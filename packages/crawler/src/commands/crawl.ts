import fs from 'node:fs';
import { and, eq, isNull } from 'drizzle-orm';
import {
  categories,
  companies,
  crawls,
  products,
  priceHistory,
  createDb,
  nowSeconds,
  absoluteUrl,
  domainOf,
  pickDedupeKey,
  toNumber,
  type ListItem,
  type NormalizedProduct,
} from '@competitor-crawler/shared';
import { siteConfigPath, loadSiteConfig, resolveSections } from '../config/loader.js';
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
  categoryId: number | null;
  sectionKey: string;
  dedupeKey: string;
  sourceProductId: string | null;
  sku: string | null;
  name: string | null;
  englishName: string | null;
  brand: string | null;
  detailUrl: string | null;
  price: number | null;
  currency: string | null;
  priceText: string | null;
  specText: string | null;
  description: string | null;
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
  /** 本轮写入的价格历史条数（仅变化时记） */
  pricePoints: number;
  failed: number;
}

/**
 * 全量增量爬取。
 *
 * 关键事实：种子里的「品类链接」多为**站点首页**，不能直接当列表页用。
 * 因此按 **站点 → 栏目(sections) → startUrls** 抓取；栏目通过 `sections[].category`
 * 绑定到种子品类（categories.name），未绑定则按域名兜底（唯一品类则用它，否则 category_id 记空）。
 *
 * - 单站/单条失败隔离：某栏目或某详情失败只计 failed 并继续，不整轮失败。
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
    pricePoints: 0,
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
  // 每个 (companyId|sectionKey) 见到的 dedupeKey，用于软删判断
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
      summary.categories += list.length;
      // 同域名品类通常同公司：取第一个品类所属公司
      const companyId = list[0].company.id;
      companyIds.add(companyId);

      if (!fs.existsSync(siteConfigPath(domain))) {
        progress.update(`[crawl] 跳过 ${domain}：无适配器配置 config/sites/${domain}.yaml`);
        continue;
      }
      const cfg = loadSiteConfig(domain);
      const sections = resolveSections(cfg);
      summary.sections += sections.length;

      for (const section of sections) {
        if (section.startUrls.length === 0) {
          progress.update(`[crawl] 跳过 ${domain} [${section.key}]：未配置 startUrls`);
          summary.failed++;
          continue;
        }
        const categoryId = resolveCategoryId(section, list);

        const pending: PendingProduct[] = [];
        try {
          await collectSection({
            progress, mode, opts, section, companyId, categoryId, pending, seenSet,
          });
        } catch (e) {
          summary.failed++;
          progress.update(`[crawl] ${domain} [${section.key}] 失败：${(e as Error).message}`);
          continue;
        }

        if (opts.dryRun) {
          progress.update(`[crawl] (dry-run) ${domain} [${section.key}] 解析 ${pending.length} 条`);
          continue;
        }

        const existed = await loadExisting(db, companyId, section.key);
        for (const p of pending) {
          const prev = existed.get(p.dedupeKey);
          const productId = await upsertProduct(db, p, now);
          if (prev) summary.updated++;
          else summary.new++;
          // 价格历史：首次入库或价格变化时记一行（新旧价全空则不记）。仅写入，不消费。
          const changed = !prev || prev.price !== p.price;
          if (changed && (p.price !== null || (prev?.price ?? null) !== null)) {
            await recordPrice(db, productId, p, crawlRow.id, now);
            summary.pricePoints++;
          }
        }
        summary.delisted += await softDeleteMissing(db, companyId, section.key, seenSet(companyId, section.key), now);
      }
    }

    summary.companies = companyIds.size;
    progress.done(
      `[crawl] 完成：公司 ${summary.companies} / 品类 ${summary.categories} / 栏目 ${summary.sections} / 新增 ${summary.new} / 更新 ${summary.updated} / 下架 ${summary.delisted} / 价格点 ${summary.pricePoints} / 失败 ${summary.failed}`,
    );
    await finalize(db, crawlRow.id, summary.failed > 0 ? 'partial' : 'success', summary);
  } catch (e) {
    await finalize(db, crawlRow.id, 'failed', summary);
    throw e;
  }
}

/** 把栏目绑定到种子品类：优先 section.category 精确匹配，否则按域名兜底 */
function resolveCategoryId(
  section: ResolvedSection,
  list: Array<{ cat: { id: number; name: string } }>,
): number | null {
  if (section.category) {
    const hit = list.find((r) => r.cat.name === section.category);
    if (hit) return hit.cat.id;
  }
  return list.length === 1 ? list[0].cat.id : null;
}

/** 抓取一个栏目的全部 startUrls：翻页 → 详情 → 归一化入 pending */
async function collectSection(args: {
  progress: Progress;
  mode: RenderMode;
  opts: CrawlOpts;
  section: ResolvedSection;
  companyId: number;
  categoryId: number | null;
  pending: PendingProduct[];
  seenSet: (cid: number, sectionKey: string) => Set<string>;
}): Promise<void> {
  const { progress, mode, opts, section, companyId, categoryId, pending, seenSet } = args;
  const limit = opts.limit ?? Number.MAX_SAFE_INTEGER;
  const items: ListItem[] = [];

  for (const listUrl of section.startUrls) {
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
  }

  const targets = items.filter((i) => i.detailUrl).slice(0, limit);
  progress.update(`[crawl] [${section.key}] 详情解析 ${targets.length}/${items.length} 条`);

  for (const it of targets) {
    try {
      const html = await fetchPage(it.detailUrl, mode);
      const normalized = mergeListFallback(parseDetailWithConfig(html, section.parseDetail.fields), it.raw);
      const detailUrl = normalized.detailUrl ?? it.detailUrl;
      // source_product_id 语义纯净：只装「站点自身的产品 id」，没有就留空（**不用货号兜底**）。
      // 去重键随后由 pickDedupeKey 兜底到 canonical(detail_url)，见下方 dedupeKey。
      const sourceProductId = normalized.sourceProductId ?? null;
      const dedupeKey = pickDedupeKey(sourceProductId, detailUrl);
      if (!dedupeKey) continue;
      pending.push({
        companyId,
        categoryId,
        sectionKey: section.key,
        dedupeKey,
        sourceProductId,
        sku: normalized.sku ?? null,
        name: normalized.name ?? it.name ?? null,
        englishName: normalized.englishName ?? null,
        brand: normalized.brand ?? null,
        detailUrl,
        price: normalized.price ?? null,
        currency: section.currency,
        priceText: normalized.priceText ?? null,
        specText: normalized.specText ?? null,
        description: normalized.description ?? null,
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

/**
 * 详情优先、列表兜底：列表页常常有货号/价格/规格，而详情页反而缺 → 用列表值补空。
 * 只合并「一等公民」标量字段；不覆盖详情已有值。
 */
function mergeListFallback(np: NormalizedProduct, raw?: Record<string, unknown>): NormalizedProduct {
  if (!raw) return np;
  const pick = (a: unknown, b: unknown): string | null => {
    if (typeof a === 'string' && a !== '') return a;
    return typeof b === 'string' && b !== '' ? b : null;
  };
  return {
    ...np,
    name: pick(np.name, raw.name),
    sourceProductId: pick(np.sourceProductId, raw.sourceProductId),
    sku: pick(np.sku, raw.sku),
    englishName: pick(np.englishName, raw.englishName),
    brand: pick(np.brand, raw.brand),
    priceText: pick(np.priceText, raw.priceText),
    specText: pick(np.specText, raw.specText),
    description: pick(np.description, raw.description),
    cloneNumber: pick(np.cloneNumber, raw.cloneNumber),
    // 价格为数值：详情非数值时用列表值（列表 YAML 建议写 number: true；这里再兜一层字符串）
    price: typeof np.price === 'number' ? np.price : toNumberOrNull(raw.price),
  };
}

/** 把 number | string | null 归一为 number | null */
function toNumberOrNull(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') return toNumber(v);
  return null;
}

/** 读取某公司某栏目下现有产品：dedupeKey → { id, price }（用于判断 new/updated 与价格变化） */
async function loadExisting(
  db: Db,
  companyId: number,
  sectionKey: string,
): Promise<Map<string, { id: number; price: number | null }>> {
  const rows = await db
    .select({ id: products.id, dedupeKey: products.dedupeKey, price: products.price })
    .from(products)
    .where(and(eq(products.companyId, companyId), eq(products.sectionKey, sectionKey)));
  return new Map(rows.map((r) => [r.dedupeKey, { id: r.id, price: r.price }]));
}

/** 追加一条价格历史（仅写入，消费端待后续接入） */
async function recordPrice(
  db: Db,
  productId: number,
  p: PendingProduct,
  crawlId: number,
  now: number,
): Promise<void> {
  await db.insert(priceHistory).values({
    productId,
    price: p.price,
    currency: p.currency,
    priceText: p.priceText,
    specText: p.specText,
    crawlId,
    capturedAt: now,
  });
}

async function upsertProduct(db: Db, p: PendingProduct, now: number): Promise<number> {
  const rows = await db
    .insert(products)
    .values({
      companyId: p.companyId,
      categoryId: p.categoryId,
      sourceProductId: p.sourceProductId,
      sku: p.sku,
      dedupeKey: p.dedupeKey,
      sectionKey: p.sectionKey,
      name: p.name,
      englishName: p.englishName,
      brand: p.brand,
      detailUrl: p.detailUrl,
      price: p.price,
      currency: p.currency,
      priceText: p.priceText,
      specText: p.specText,
      description: p.description,
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
        sku: p.sku,
        name: p.name,
        englishName: p.englishName,
        brand: p.brand,
        detailUrl: p.detailUrl,
        price: p.price,
        currency: p.currency,
        priceText: p.priceText,
        specText: p.specText,
        description: p.description,
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
    })
    .returning({ id: products.id });
  return rows[0].id;
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
