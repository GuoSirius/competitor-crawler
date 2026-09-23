import fs from 'node:fs';
import { and, eq, isNull } from 'drizzle-orm';
import {
  categories,
  companies,
  crawls,
  products,
  createDb,
  nowSeconds,
  absoluteUrl,
  domainOf,
  pickDedupeKey,
  type ListItem,
  type NormalizedProduct,
} from '@competitor-crawler/shared';
import { siteConfigPath, loadSiteConfig, resolveSections, pickSectionByUrl } from '../config/loader.js';
import { parseListWithConfig, parseDetailWithConfig } from '../adapter/yamlAdapter.js';
import { traverseList } from '../fetch/listTraversal.js';
import { fetchPage, type RenderMode } from '../fetch/page.js';
import { Progress } from '../util/progress.js';
import type { ResolvedSection } from '../config/types.js';

type Db = ReturnType<typeof createDb>['db'];

export interface CrawlOpts {
  /** 仅爬指定域名（调试 / 单站补跑） */
  site?: string;
  /** 只跑不入库（接站点前验证） */
  dryRun?: boolean;
  /** 每栏目最大翻页数（缺省用配置 maxPages） */
  pages?: number;
  /** 每栏目最大详情抓取数（调试用，缺省不限） */
  limit?: number;
  /** 渲染模式 ssr/spa/auto */
  render?: string;
}

interface PendingProduct {
  companyId: number;
  categoryId: number;
  sectionKey: string;
  dedupeKey: string;
  sourceProductId: string | null;
  name: string | null;
  detailUrl: string | null;
  specs: NormalizedProduct['specs'];
  introMedia: NormalizedProduct['introMedia'];
  cloneNumber: string | null;
  applications: string[] | null;
  row: Record<string, unknown>;
}

interface CrawlSummary {
  companies: number;
  categories: number;
  sections: number;
  new: number;
  updated: number;
  delisted: number;
  failed: number;
}

/**
 * 全量增量爬取：种子品类 → 按域名路由适配器 → 列表翻页 → 详情解析 → upsert → 软删。
 *
 * - 单站/单条失败隔离：某品类或某详情失败只计 failed 并继续，不整轮失败。
 * - 去重口径 B：写入冲突目标为 (company_id, dedupe_key, section_key)，见 docs/03 §3.4。
 */
export async function crawl(opts: CrawlOpts = {}): Promise<void> {
  const progress = new Progress();
  const { db } = createDb();
  const mode: RenderMode = (opts.render as RenderMode) ?? 'auto';
  const now = nowSeconds();
  const summary: CrawlSummary = {
    companies: 0,
    categories: 0,
    sections: 0,
    new: 0,
    updated: 0,
    delisted: 0,
    failed: 0,
  };

  const [crawlRow] = await db
    .insert(crawls)
    .values({
      trigger: 'manual',
      status: 'running',
      modelMode: process.env.MODEL_MODE ?? null,
      startedAt: now,
    })
    .returning();

  const companyIds = new Set<number>();
  // 本轮每个 (companyId|sectionKey) 见到的 dedupeKey，用于软删判断
  const seenKeys = new Map<string, Set<string>>();
  const seenSet = (cid: number, sectionKey: string): Set<string> => {
    const k = `${cid}|${sectionKey}`;
    let s = seenKeys.get(k);
    if (!s) {
      s = new Set<string>();
      seenKeys.set(k, s);
    }
    return s;
  };

  try {
    // 1) 活跃品类 + 归属公司
    const rows = await db
      .select({ cat: categories, company: companies })
      .from(categories)
      .innerJoin(companies, eq(categories.companyId, companies.id))
      .where(isNull(categories.removedAt));

    // 2) 按域名分组（可 --site 过滤）
    const byDomain = new Map<string, typeof rows>();
    for (const r of rows) {
      const d = domainOf(r.cat.url);
      if (!d) continue;
      if (opts.site && d !== opts.site) continue;
      const list = byDomain.get(d) ?? [];
      list.push(r);
      byDomain.set(d, list);
    }

    if (byDomain.size === 0) {
      progress.done(`[crawl] 没有匹配的活跃品类（site=${opts.site ?? '全部'}）`);
      await finalize(db, crawlRow.id, 'partial', summary);
      return;
    }

    for (const [domain, list] of byDomain) {
      if (!fs.existsSync(siteConfigPath(domain))) {
        progress.update(`[crawl] 跳过 ${domain}：无适配器配置 config/sites/${domain}.yaml`);
        continue;
      }
      const cfg = loadSiteConfig(domain);
      const sections = resolveSections(cfg);
      summary.sections += sections.length;

      for (const r of list) {
        const { cat, company } = r;
        summary.categories++;
        companyIds.add(company.id);

        const section =
          pickSectionByUrl(sections, cat.url, 'list') ?? (sections.length === 1 ? sections[0] : undefined);
        if (!section) {
          progress.update(`[crawl] 跳过品类「${cat.name}」：URL 未命中任何 section（检查 match.listUrlIncludes）`);
          summary.failed++;
          continue;
        }

        const pending: PendingProduct[] = [];
        try {
          await crawlOneCategory({
            progress, mode, opts, section,
            listUrl: cat.url,
            companyId: company.id,
            categoryId: cat.id,
            pending,
            seenSet,
          });
        } catch (e) {
          summary.failed++;
          progress.update(`[crawl] 「${company.name} / ${cat.name}」失败：${(e as Error).message}`);
          continue;
        }

        if (opts.dryRun) {
          progress.update(
            `[crawl] (dry-run) 「${company.name} / ${cat.name}」[${section.key}] 解析 ${pending.length} 条`,
          );
          continue;
        }

        // 3) upsert + 软删
        const existed = await loadExistingKeys(db, company.id, section.key);
        for (const p of pending) {
          await upsertProduct(db, p, now);
          if (existed.has(p.dedupeKey)) summary.updated++;
          else summary.new++;
        }
        summary.delisted += await softDeleteMissing(db, company.id, section.key, seenSet(company.id, section.key), now);
      }
    }

    summary.companies = companyIds.size;
    progress.done(
      `[crawl] 完成：公司 ${summary.companies} / 品类 ${summary.categories} / 新增 ${summary.new} / 更新 ${summary.updated} / 下架 ${summary.delisted} / 失败 ${summary.failed}`,
    );
    await finalize(db, crawlRow.id, summary.failed > 0 ? 'partial' : 'success', summary);
  } catch (e) {
    await finalize(db, crawlRow.id, 'failed', summary);
    throw e;
  }
}

async function crawlOneCategory(args: {
  progress: Progress;
  mode: RenderMode;
  opts: CrawlOpts;
  section: ResolvedSection;
  listUrl: string;
  companyId: number;
  categoryId: number;
  pending: PendingProduct[];
  seenSet: (cid: number, sectionKey: string) => Set<string>;
}): Promise<void> {
  const { progress, mode, opts, section, listUrl, companyId, categoryId, pending, seenSet } = args;
  const limit = opts.limit ?? Number.MAX_SAFE_INTEGER;
  const items: ListItem[] = [];

  progress.update(`[crawl] [${section.key}] 列表翻页 ${listUrl}`);
  await traverseList({
    url: listUrl,
    traversal: section.listTraversal,
    mode,
    maxPages: opts.pages ?? Number.MAX_SAFE_INTEGER,
    progress,
    onPage: (html) => {
      const pageItems = parseListWithConfig(html, section.parseList, section.key);
      for (const it of pageItems) it.detailUrl = absoluteUrl(it.detailUrl, listUrl);
      items.push(...pageItems);
      return pageItems.length;
    },
  });

  const targets = items.filter((i) => i.detailUrl).slice(0, limit);
  progress.update(`[crawl] [${section.key}] 详情解析 ${targets.length}/${items.length} 条`);

  for (const it of targets) {
    try {
      const html = await fetchPage(it.detailUrl, mode);
      const normalized = parseDetailWithConfig(html, section.parseDetail.fields);
      const detailUrl = normalized.detailUrl ?? it.detailUrl;
      const dedupeKey = pickDedupeKey(normalized.sourceProductId, detailUrl);
      if (!dedupeKey) continue;
      pending.push({
        companyId,
        categoryId,
        sectionKey: section.key,
        dedupeKey,
        sourceProductId: normalized.sourceProductId ?? null,
        name: normalized.name ?? it.name ?? null,
        detailUrl,
        specs: normalized.specs,
        introMedia: normalized.introMedia,
        cloneNumber: normalized.cloneNumber ?? null,
        applications: normalized.applications ?? null,
        row: { ...normalized.row, listName: it.name ?? undefined },
      });
      seenSet(companyId, section.key).add(dedupeKey);
    } catch {
      // 详情失败隔离：跳过该条，继续
    }
  }
}

/** 读取某公司某栏目下现有产品 dedupeKey 集合（判断 new / updated） */
async function loadExistingKeys(db: Db, companyId: number, sectionKey: string): Promise<Set<string>> {
  const rows = await db
    .select({ dedupeKey: products.dedupeKey })
    .from(products)
    .where(and(eq(products.companyId, companyId), eq(products.sectionKey, sectionKey)));
  return new Set(rows.map((r) => r.dedupeKey));
}

async function upsertProduct(db: Db, p: PendingProduct, now: number): Promise<void> {
  await db
    .insert(products)
    .values({
      companyId: p.companyId,
      categoryId: p.categoryId,
      sourceProductId: p.sourceProductId,
      dedupeKey: p.dedupeKey,
      sectionKey: p.sectionKey,
      name: p.name,
      detailUrl: p.detailUrl,
      specs: p.specs,
      introMedia: p.introMedia,
      cloneNumber: p.cloneNumber,
      applications: p.applications,
      row: p.row,
      status: 'active',
      firstSeenAt: now,
      lastSeenAt: now,
      missingSince: null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [products.companyId, products.dedupeKey, products.sectionKey],
      set: {
        categoryId: p.categoryId,
        sourceProductId: p.sourceProductId,
        name: p.name,
        detailUrl: p.detailUrl,
        specs: p.specs,
        introMedia: p.introMedia,
        cloneNumber: p.cloneNumber,
        applications: p.applications,
        row: p.row,
        status: 'active',
        lastSeenAt: now,
        missingSince: null,
        updatedAt: now,
      },
    });
}

/**
 * 软删除（连续 2 轮缺失才下架，见 docs/03 §3.5.1）：
 * 本轮未见到的活跃产品：首次 → missingSince=now 仍 active；再次 → delisted。
 */
async function softDeleteMissing(
  db: Db,
  companyId: number,
  sectionKey: string,
  seenKeys: Set<string>,
  now: number,
): Promise<number> {
  const rows = await db
    .select({ id: products.id, dedupeKey: products.dedupeKey, missingSince: products.missingSince })
    .from(products)
    .where(
      and(
        eq(products.companyId, companyId),
        eq(products.sectionKey, sectionKey),
        eq(products.status, 'active'),
      ),
    );
  let delisted = 0;
  for (const r of rows) {
    if (seenKeys.has(r.dedupeKey)) continue;
    if (r.missingSince == null) {
      await db.update(products).set({ missingSince: now, updatedAt: now }).where(eq(products.id, r.id));
    } else {
      await db
        .update(products)
        .set({ status: 'delisted', missingSince: null, updatedAt: now })
        .where(eq(products.id, r.id));
      delisted++;
    }
  }
  return delisted;
}

async function finalize(db: Db, crawlId: number, status: string, summary: CrawlSummary): Promise<void> {
  await db
    .update(crawls)
    .set({ status, summary, finishedAt: nowSeconds() })
    .where(eq(crawls.id, crawlId));
}
