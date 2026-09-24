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
import { siteConfigPath, loadSiteConfig, resolveSections, listSiteConfigs, hasCodeAdapter } from '../config/loader.js';
import { parseListWithConfig, parseDetailWithConfig } from '../adapter/yamlAdapter.js';
import { applyApiSources } from '../adapter/apiSource.js';
import { applyModelFallback, isModelFallbackEnabled } from '../llm/fallbackAdapter.js';
import { recordAlert } from '../util/alerts.js';
import { traverseList } from '../fetch/listTraversal.js';
import { dedupeListItems, uniqueBy } from '../fetch/listDedupe.js';
import { fetchPage, type RenderMode } from '../fetch/page.js';
import { Progress } from '../util/progress.js';
import type { ApiSourceConfig, ResolvedSection } from '../config/types.js';

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
  /**
   * 爬取范围数据源（需求①·决策B，可切换）：
   * - 'config'（默认）：扫描 config/sites/*.yaml 作为真相源，公司/品类按 YAML 自动 upsert 入库
   * - 'seeds'：沿用库内 categories（种子 Excel 入库）作为范围（旧行为）
   */
  source?: 'config' | 'seeds';
  /** 仅跑指定栏目 key（逗号分隔）；两数据源均生效 */
  section?: string;
  /** 仅跑指定品类名（子串匹配，不区分大小写）；两数据源均生效 */
  category?: string;
  /** 仅跑指定产品线（仅 --source seeds 生效，对应 categories.product_line）；config 模式忽略并提示 */
  productLine?: string;
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
  /** 检测到「YAML 配置 ↔ 代码适配器 互斥」的站点数（已跳过、待用户处理） */
  conflicts: number;
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
    conflicts: 0,
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
    const source: 'config' | 'seeds' = opts.source === 'seeds' ? 'seeds' : 'config';

    // 数据源切换（需求①·决策B）：config 扫描 config/sites/*.yaml / seeds 读库内 categories，可切换。
    // 两种模式都做「YAML 配置 ↔ 代码适配器 互斥检测」（决策A）：共存则记录冲突、跳过、跑完汇总提示。
    if (opts.productLine && source !== 'seeds') {
      progress.update('[crawl] 警告：--product-line 仅在 --source seeds 生效，config 模式已忽略');
    }

    const { targets: rawTargets, conflicts } = await buildTargets(db, source, opts, progress);
    const targets = applyFilters(rawTargets, opts);

    if (targets.size === 0) {
      const scope = opts.site ? `site=${opts.site}` : '全部';
      progress.done(`[crawl] 没有匹配的站点配置（source=${source}, ${scope}）`);
      await finalize(db, crawlRow.id, 'partial', summary);
      return;
    }

    for (const [domain, target] of targets) {
      summary.categories += target.sections.length;
      summary.sections += target.sections.length;
      const companyId = target.companyId;
      companyIds.add(companyId);

      for (const ts of target.sections) {
        const section = ts.section;
        if (section.startUrls.length === 0) {
          progress.update(`[crawl] 跳过 ${domain} [${section.key}]：未配置 startUrls`);
          summary.failed++;
          continue;
        }
        const categoryId = ts.categoryId;

        const pending: PendingProduct[] = [];
        // 模型兜底（形态 E）本栏目统计：补全字段数 / 失败条数 + 首条失败原因
        const modelStat: ModelStat = { filled: 0, failed: 0 };
        try {
          await collectSection({
            progress, mode, opts, section, companyId, categoryId, pending, seenSet, modelStat,
          });
        } catch (e) {
          summary.failed++;
          progress.update(`[crawl] ${domain} [${section.key}] 失败：${(e as Error).message}`);
          continue;
        }

        if (modelStat.filled > 0) {
          progress.update(`[crawl] ${domain} [${section.key}] 模型兜底：补全 ${modelStat.filled} 个字段`);
        }
        if (modelStat.failed > 0) {
          progress.update(
            `[crawl] ${domain} [${section.key}] 模型兜底失败 ${modelStat.failed} 条：${modelStat.lastError ?? '未知原因'}`,
          );
        }

        if (opts.dryRun) {
          progress.update(`[crawl] (dry-run) ${domain} [${section.key}] 解析 ${pending.length} 条`);
          continue;
        }

        // 模型失败落告警（type=MODEL_FAILURE）：模型是增强不是单点，失败只降级不阻塞整轮（docs/04 §4.6）
        if (modelStat.failed > 0) {
          await recordAlert(db, {
            type: 'MODEL_FAILURE',
            severity: 'warning',
            companyId,
            message: `[${domain}] [${section.key}] 模型兜底提取失败 ${modelStat.failed} 条`,
            payload: {
              domain,
              sectionKey: section.key,
              failed: modelStat.failed,
              lastError: modelStat.lastError ?? null,
              modelMode: process.env.MODEL_MODE ?? null,
              configFile: `config/sites/${domain}.yaml`,
              configPath: 'parseDetail.modelFallback',
            },
          });
        }

        const existed = await loadExisting(db, companyId, section.key);
        // 同一栏目内 dedupeKey 唯一化：同一去重键只应写一条，否则计数虚高且重复 upsert。
        const unique = uniqueBy(pending, (p) => p.dedupeKey);
        if (unique.length !== pending.length) {
          progress.update(
            `[crawl] ${domain} [${section.key}] 去重键唯一化：${pending.length} → ${unique.length} 条`,
          );
        }
        for (const p of unique) {
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
    if (conflicts.length > 0) {
      progress.update(
        `[crawl] ⚠️ 检测到 ${conflicts.length} 个站点同时存在 YAML 配置与代码适配器（互斥），已跳过待处理：${conflicts.join(', ')}`,
      );
      progress.update('[crawl] 请移除其一后再跑：config/sites/<domain>.yaml 或 packages/crawler/src/adapters/<domain>.ts');
      summary.conflicts = conflicts.length;
    }
    progress.done(
      `[crawl] 完成：公司 ${summary.companies} / 品类 ${summary.categories} / 栏目 ${summary.sections} / 新增 ${summary.new} / 更新 ${summary.updated} / 下架 ${summary.delisted} / 价格点 ${summary.pricePoints} / 失败 ${summary.failed}${summary.conflicts ? ` / 冲突 ${summary.conflicts}` : ''}`,
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

/** 爬取目标：一个域名 → 归属公司 + 一组已绑定 DB 品类的栏目 */
interface SiteTarget {
  domain: string;
  companyId: number;
  sections: TargetSection[];
}

/** 已绑定到 DB 品类的栏目（携带用于 --category 过滤的品类名） */
interface TargetSection {
  section: ResolvedSection;
  categoryId: number | null;
  /** 用于 --category 过滤的品类名（config: section.category ?? `<domain>::<key>`；seeds: section.category ?? domain） */
  categoryName: string;
}

/**
 * 按数据源构建爬取目标（需求①·决策B）。
 * - config：扫描 `config/sites/*.yaml` 作为爬取范围真相源；YAML 与代码适配器共存 → 记冲突并跳过。
 * - seeds：读库内 categories（可按产品线过滤）；同样做共存检测。
 * 返回所有「未冲突」的目标 + 冲突域名清单（供跑完汇总提示）。
 */
async function buildTargets(
  db: Db,
  source: 'config' | 'seeds',
  opts: CrawlOpts,
  progress: Progress,
): Promise<{ targets: Map<string, SiteTarget>; conflicts: string[] }> {
  const conflicts: string[] = [];
  const targets = new Map<string, SiteTarget>();

  if (source === 'config') {
    for (const domain of listSiteConfigs()) {
      if (opts.site && domain !== opts.site) continue;
      // 决策A：YAML 与代码适配器互斥，共存则记录冲突、跳过该站点
      if (hasCodeAdapter(domain)) {
        conflicts.push(domain);
        continue;
      }
      const cfg = loadSiteConfig(domain);
      const sections = resolveSections(cfg);
      const companyId = await resolveCompanyId(db, cfg);
      const targetSections: TargetSection[] = [];
      for (const section of sections) {
        const categoryName = section.category ?? `${domain}::${section.key}`;
        const categoryId = await upsertCategory(
          db,
          companyId,
          categoryName,
          section.startUrls[0] ?? cfg.startUrl ?? '',
          null,
        );
        targetSections.push({ section, categoryId, categoryName });
      }
      targets.set(domain, { domain, companyId, sections: targetSections });
    }
    return { targets, conflicts };
  }

  // source === 'seeds'
  const conds = [isNull(categories.removedAt)];
  if (opts.productLine) conds.push(eq(categories.productLine, opts.productLine));
  const rows = await db
    .select({ cat: categories, company: companies })
    .from(categories)
    .innerJoin(companies, eq(categories.companyId, companies.id))
    .where(and(...conds));

  const byDomain = new Map<string, typeof rows>();
  for (const r of rows) {
    const d = domainOf(r.cat.url);
    if (!d) continue;
    if (opts.site && d !== opts.site) continue;
    const list = byDomain.get(d) ?? [];
    list.push(r);
    byDomain.set(d, list);
  }

  for (const [domain, list] of byDomain) {
    if (!fs.existsSync(siteConfigPath(domain))) {
      progress.update(`[crawl] 跳过 ${domain}：无适配器配置 config/sites/${domain}.yaml`);
      continue;
    }
    // 决策A：YAML 与代码适配器互斥，共存则记录冲突、跳过该站点
    if (hasCodeAdapter(domain)) {
      conflicts.push(domain);
      continue;
    }
    const cfg = loadSiteConfig(domain);
    const sections = resolveSections(cfg);
    const companyId = list[0].company.id;
    const targetSections: TargetSection[] = sections.map((section) => {
      const categoryId = resolveCategoryId(section, list);
      const categoryName = section.category ?? domain;
      return { section, categoryId, categoryName };
    });
    targets.set(domain, { domain, companyId, sections: targetSections });
  }

  return { targets, conflicts };
}

/** 按 --section / --category 过滤栏目（两数据源通用） */
function applyFilters(
  targets: Map<string, SiteTarget>,
  opts: CrawlOpts,
): Map<string, SiteTarget> {
  const sectionSet = opts.section
    ? new Set(opts.section.split(',').map((s) => s.trim()).filter(Boolean))
    : null;
  const catFilter = opts.category ? opts.category.toLowerCase() : null;
  const out = new Map<string, SiteTarget>();
  for (const [domain, target] of targets) {
    const secs = target.sections.filter((ts) => {
      if (sectionSet && !sectionSet.has(ts.section.key)) return false;
      if (catFilter && !ts.categoryName.toLowerCase().includes(catFilter)) return false;
      return true;
    });
    if (secs.length > 0) out.set(domain, { ...target, sections: secs });
  }
  return out;
}

/**
 * config 模式公司解析：优先复用「website 命中该域名」或「name 命中 YAML company」的已存在公司，
 * 避免与种子入库的公司重复建行；都找不到才按 name=company??domain 新建。
 */
async function resolveCompanyId(
  db: Db,
  cfg: { domain: string; company?: string },
): Promise<number> {
  const domain = cfg.domain;
  const all = await db.select().from(companies).where(isNull(companies.removedAt));
  const byWeb = all.find((c) => domainOf(c.website) === domain);
  if (byWeb) {
    if (cfg.company && cfg.company !== byWeb.name) {
      await db
        .update(companies)
        .set({ name: cfg.company, updatedAt: nowSeconds() })
        .where(eq(companies.id, byWeb.id));
    }
    return byWeb.id;
  }
  return upsertCompany(db, cfg.company ?? domain);
}

/** 按 name upsert 公司（config 模式新建 / 复用） */
async function upsertCompany(db: Db, name: string): Promise<number> {
  const t = nowSeconds();
  const existing = await db.select().from(companies).where(eq(companies.name, name)).limit(1);
  if (existing.length) {
    await db.update(companies).set({ removedAt: null, updatedAt: t }).where(eq(companies.id, existing[0].id));
    return existing[0].id;
  }
  const [ins] = await db
    .insert(companies)
    .values({ name, removedAt: null, createdAt: t, updatedAt: t })
    .returning();
  return ins.id;
}

/** 按 (companyId, productLine, name) 业务主键 upsert 品类（config 模式新建 / 复用） */
async function upsertCategory(
  db: Db,
  companyId: number,
  name: string,
  url: string,
  productLine: string | null,
): Promise<number> {
  const t = nowSeconds();
  const existing = await db
    .select()
    .from(categories)
    .where(
      and(
        eq(categories.companyId, companyId),
        productLine === null ? isNull(categories.productLine) : eq(categories.productLine, productLine),
        eq(categories.name, name),
      ),
    )
    .limit(1);
  if (existing.length) {
    await db
      .update(categories)
      .set({ url, productLine, removedAt: null, updatedAt: t })
      .where(eq(categories.id, existing[0].id));
    return existing[0].id;
  }
  const [ins] = await db
    .insert(categories)
    .values({ companyId, productLine, name, url, removedAt: null, createdAt: t, updatedAt: t })
    .returning();
  return ins.id;
}

/** 模型兜底（形态 E）的栏目级统计 */
interface ModelStat {
  /** 成功补全的字段个数 */
  filled: number;
  /** 失败条数 */
  failed: number;
  /** 首条失败原因（便于告警里给可读信息） */
  lastError?: string;
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
  modelStat: ModelStat;
}): Promise<void> {
  const { progress, mode, opts, section, companyId, categoryId, pending, seenSet, modelStat } = args;
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
      onPage: (html, _pageNo, pageUrl) => {
        const pageItems = parseListWithConfig(html, section.parseList, section.key);
        for (const it of pageItems) it.detailUrl = absoluteUrl(it.detailUrl, pageUrl ?? listUrl);
        items.push(...pageItems);
        return pageItems.length;
      },
    });
  }

  // 列表去重：列表页常把同一产品渲染两次（pc/web 双套模板、图片链接+标题链接），
  // 不去重会导致同一详情被抓两次、`新增` 计数虚高。去重键 = canonical(detailUrl)，与落库口径一致。
  const { items: deduped, duplicates } = dedupeListItems(items);
  if (duplicates > 0) {
    progress.update(
      `[crawl] [${section.key}] 列表去重：${items.length} → ${deduped.length} 条（丢弃 ${duplicates} 条重复链接）`,
    );
  }
  const targets = deduped.slice(0, limit);
  progress.update(`[crawl] [${section.key}] 详情解析 ${targets.length}/${deduped.length} 条`);

  for (const it of targets) {
    try {
      const html = await fetchPage(it.detailUrl, mode);
      const normalized = mergeListFallback(parseDetailWithConfig(html, section.parseDetail.fields), it.raw);
      const detailUrl = normalized.detailUrl ?? it.detailUrl;
      // 形态 D：人工登记的异步接口数据源（config/sites/<domain>.yaml 的 parseDetail.api）
      if (section.parseDetail.api?.length) {
        await applyApiSourcesLogged(normalized, detailUrl, section.parseDetail.api, progress);
      }
      // 形态 E：模型兜底（仅 section 显式配置 parseDetail.modelFallback 时调用；只补空，不覆盖上面两步）
      if (isModelFallbackEnabled(section.parseDetail.modelFallback)) {
        const outcome = await applyModelFallback(
          normalized,
          html,
          { detailUrl, name: it.name },
          section.parseDetail.modelFallback,
        );
        if (outcome?.ok) modelStat.filled += outcome.filled.length;
        else if (outcome) {
          modelStat.failed++;
          modelStat.lastError ??= outcome.error;
        }
      }
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

/**
 * 应用「异步接口数据源」（形态 D）并记录进度。具体逻辑见 adapter/apiSource.ts（与 probe 共用）。
 */
async function applyApiSourcesLogged(
  np: NormalizedProduct,
  detailUrl: string,
  sources: ApiSourceConfig[],
  progress: Progress,
): Promise<void> {
  const results = await applyApiSources(np, detailUrl, sources);
  for (const r of results) {
    progress.update(
      r.ok
        ? `[crawl] api 源 "${r.target}" 取到 ${r.count === 1 ? '1 项' : `${r.count} 条`}（${r.url}）`
        : `[crawl] api 源 "${r.target}" 失败：${r.error}`,
    );
  }
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
