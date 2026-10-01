import fs from 'node:fs';
import { and, eq, isNull } from 'drizzle-orm';
import {
  categories,
  companies,
  contents,
  crawls,
  products,
  priceHistory,
  createDb,
  nowSeconds,
  absoluteUrl,
  domainOf,
  pickIdentityKey,
  toNumber,
  unixFromBjParts,
  type ListItem,
  type NormalizedProduct,
  type DbDialect,
  PRODUCT_FIELDS,
} from '@competitor-crawler/shared';
import { siteConfigPath, loadSiteConfig, resolveSections, listSiteConfigs, hasCodeAdapter, listRenderMode, detailRenderMode, resolveTraversalLimits, slicePageItems } from '../config/loader.js';
import { validateSiteConfig, formatIssues } from '../config/validate.js';
import { parseListWithConfig, parseDetailWithConfig } from '../adapter/yamlAdapter.js';
import { parseBreadcrumb } from '../adapter/breadcrumb.js';
import { loadCodeAdapter } from '../adapter/adapterLoader.js';
import type { CodeAdapter, CodeAdapterCtx } from '../adapters/types.js';
import { applyApiSources } from '../adapter/apiSource.js';
import { applyModelFallback, isModelFallbackEnabled } from '../llm/fallbackAdapter.js';
import { recordAlert } from '../util/alerts.js';
import { CrawlState } from './crawlState.js';
import { traverseList } from '../fetch/listTraversal.js';
import { dedupeListItems, uniqueBy } from '../fetch/listDedupe.js';
import { fetchPage, type RenderMode } from '../fetch/page.js';
import { Progress, ProgressCounter } from '../util/progress.js';
import pLimit from 'p-limit';
import { detailConcurrency } from '../util/limit.js';
import type { ApiSourceConfig, ResolvedSection } from '../config/types.js';

type Db = ReturnType<typeof createDb>['db'];

export interface CrawlOpts {
  /** 仅爬指定域名，逗号分隔多个（调试 / 单站或少数站补跑） */
  site?: string;
  /** 只跑不入库（接站点前验证） */
  dryRun?: boolean;
  /** 每栏目最大翻页数（缺省用配置 maxPages；与 YAML **取小**，安全护栏语义） */
  pages?: number;
  /** 起始页码（覆盖 YAML pageStart；仅 pagination-url 策略生效） */
  pageStart?: number;
  /** 终止页码，闭区间（覆盖 YAML pageEnd；仅 pagination-url 策略生效） */
  pageEnd?: number;
  /** 每页条目起始偏移（覆盖 YAML offset；所有翻页策略生效） */
  offset?: number;
  /** 每页最多取条目数（覆盖 YAML limit；注意与 --limit 详情总数上限的区别） */
  perPage?: number;
  /** 每栏目最大详情抓取数（调试用，缺省不限） */
  limit?: number;
  /** 渲染模式 ssr/spa/auto */
  render?: string;
  /**
   * 爬取范围数据源（YAML 是唯一真相源，docs/05）：
   * - 'config'（默认）：扫描 config/sites/*.yaml 作为范围真相源，公司/品类按 YAML 自动 upsert 入库
   * - 'seeds'：读库内 categories（种子 Excel 入库）。Excel 已降级为一次性初始化导入工具，日常不用
   */
  source?: 'config' | 'seeds';
  /** 仅跑指定栏目 key（逗号分隔）；两数据源均生效 */
  section?: string;
  /** 仅跑指定品类名（子串匹配，不区分大小写）；两数据源均生效 */
  category?: string;
  /** 仅跑指定产品线（仅 --source seeds 生效，对应 categories.product_line）；config 模式忽略并提示 */
  productLine?: string;
  /** 触发来源：manual（手动/cli）/ schedule（调度器）；写入 crawls.trigger 便于追溯 */
  trigger?: 'manual' | 'schedule';
  /**
   * 断点续跑（docs/16 规模化兜底）：传入上次中断保存的断点文件路径；空字符串 = 自动取
   * .crawl-state/ 内最新文件。续跑时已完成栏目整段跳过、已落库产品详情不重抓。
   */
  resume?: string;
}

export interface PendingProduct {
  companyId: number;
  categoryId: number | null;
  /** 详情页面包屑分类路径（categoryFromPage 动态解析）；非空时优先于 categoryId 建树落库 */
  breadcrumb: string[] | null;
  sectionKey: string;
  identityKey: string;
  sourceProductId: string | null;
  sku: string | null;
  name: string | null;
  englishName: string | null;
  /** 别称/曾用名（页面拼接原样，可能含现用名） */
  aliases: string | null;
  /** 曾用货号（页面拼接原样，可能含现用货号） */
  oldSkus: string | null;
  brand: string | null;
  detailUrl: string | null;
  listUrl: string | null;
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
  /** 启用了代码适配器钩子（加性补充）的站点数；0 表示全仓走纯 YAML，行为与旧版一致 */
  adapterSites: number;
  /** 内容采集（contents 表）：本轮新增条数 */
  contentNew: number;
  /** 内容采集（contents 表）：本轮更新条数 */
  contentUpdated: number;
  /** 列表页抓取失败被跳过（重试耗尽）的页码清单（docs/16 规模化兜底）："domain [sectionKey] 第N页" */
  missingPages: string[];
  /**
   * 两阶段字段不一致统计（Q2）：键=字段名，值=出现次数。
   * 列表与详情都抽到且归一后不同 → 计一次（列表值已存 row[<field>_list]，详情值落库）。
   * 非阻断，仅汇总告警，帮助发现「列表/详情解析规则漂移」。
   */
  fieldMismatches: Record<string, number>;
  /** 仅 dry-run：各栏目解析出的条目合计（全程零写入，新增/更新恒 0，靠它判断解析是否有效） */
  dryRunParsed?: number;
}

/**
 * 全量增量爬取。
 *
 * 关键事实：种子里的「品类链接」多为**站点首页**，不能直接当列表页用。
 * 因此按 **站点 → 栏目(sections) → startUrls** 抓取；栏目通过 `sections[].category`
 * 绑定到种子品类（categories.name），未绑定则按域名兜底（唯一品类则用它，否则 category_id 记空）。
 *
 * - 单站/单条失败隔离：某栏目或某详情失败只计 failed 并继续，不整轮失败。
 * - 去重口径 B：写入冲突目标为 (company_id, identity_key, section_key)，见 docs/03 §3.4。
 */
export async function crawl(opts: CrawlOpts = {}): Promise<void> {
  const progress = new Progress();
  const { db, dialect } = createDb();
  const now = nowSeconds();
  const dryRun = opts.dryRun === true;
  const summary: CrawlSummary = {
    companies: 0,
    categories: 0,
    sections: 0,
    new: 0,
    updated: 0,
    delisted: 0,
    pricePoints: 0,
    failed: 0,
    adapterSites: 0,
    contentNew: 0,
    contentUpdated: 0,
    missingPages: [],
    fieldMismatches: {},
  };

  let crawlRow: { id: number };
  if (dryRun) {
    crawlRow = { id: 0 };
    progress.update('[crawl] (dry-run) 不写入 crawls 运行记录');
  } else {
    [crawlRow] = await db
      .insert(crawls)
      .values({
        trigger: opts.trigger ?? 'manual',
        status: 'running',
        modelMode: process.env.MODEL_MODE ?? null,
        startedAt: now,
      })
      .returning();
  }

  // 断点续跑状态（dry-run 不落盘）：正常轮 create（成功后清理，失败保留）；--resume 读旧断点跳过已完成栏目
  let state: CrawlState | null = null;
  if (!dryRun) {
    if (opts.resume !== undefined) {
      const p = opts.resume === '' ? CrawlState.latest() : opts.resume;
      if (!p || !fs.existsSync(p)) {
        throw new Error(`--resume 找不到断点文件：${opts.resume || '.crawl-state/ 目录为空（没有可续跑的断点）'}`);
      }
      state = CrawlState.load(p);
      if (!state) throw new Error(`--resume 断点文件损坏或格式不对：${p}`);
      progress.update(`[crawl] 断点续跑：已完成 ${state.doneCount} 个栏目将被跳过（${p}）`);
    } else {
      state = CrawlState.create({ site: opts.site ?? null, source: opts.source ?? null, trigger: opts.trigger ?? 'manual' });
    }
  }

  const companyIds = new Set<number>();
  // 每个 (companyId|sectionKey) 见到的 identityKey，用于软删判断
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

    // 数据源切换：config 扫描 config/sites/*.yaml（默认，YAML 唯一真相源）/ seeds 读库内 categories（Excel 初始化导入后的一次性场景）
    // 代码适配器是**加性补充**（docs/05 §5.3）：与 YAML 共存不冲突、不跳过，只是给该站点多挂几个钩子。

    const { targets: rawTargets, adapterSites } = await buildTargets(db, source, opts, progress);
    const targets = applyFilters(rawTargets, opts);

    if (adapterSites.length > 0) {
      progress.update(
        `[crawl] ${adapterSites.length} 个站点挂有代码适配器（钩子生效）：${adapterSites.join(', ')}`,
      );
      summary.adapterSites = adapterSites.length;
    }

    if (targets.size === 0) {
      const scope = opts.site ? `site=${opts.site}` : '全部';
      progress.done(`[crawl] 没有匹配的站点配置（source=${source}, ${scope}）`);
      await finalize(db, crawlRow.id, 'partial', summary, dryRun);
      return;
    }

    for (const [domain, target] of targets) {
      summary.sections += target.sections.length;

      // 字段校验（Q1）：每站加载配置后先跑一次，把疑似拼写错误 / 缺必填 / 缺身份键
      // 暴露给用户——仅提示、不阻断（error 级也照常继续爬）。无问题则静默。
      try {
        const cfg = loadSiteConfig(domain);
        const lines = formatIssues(domain, validateSiteConfig(cfg));
        for (const l of lines) progress.update(`[crawl] ${l}`);
      } catch {
        // 配置缺失不应在此中断整轮（buildTargets 已确保存在；极端情况下兜底跳过校验）
      }
      const companyId = target.companyId;
      companyIds.add(companyId);
      // 渲染模式：CLI --render > YAML render > 'auto'（buildTargets 已解析并存入 target.mode）
      const mode: RenderMode = target.mode;

      // ── 代码适配器（docs/16 🔴-2）：按域名加载，preflight 每站整轮一次 ──
      // 加载失败/无钩子时为 null → 行为与纯 YAML 完全一致（零回归）。
      const adapter = await loadCodeAdapter(domain);
      let extraHeaders: Record<string, string> = {};
      if (adapter?.preflight) {
        try {
          extraHeaders = (await adapter.preflight({ domain })) ?? {};
          if (Object.keys(extraHeaders).length > 0) {
            progress.update(`[crawl] ${domain} preflight 完成：附加请求头 ${Object.keys(extraHeaders).join('/')}`);
          }
        } catch (e) {
          // 前置失败不中断整轮：记录后按「无附加头」继续（适配器是增强不是单点）
          progress.update(`[crawl] ${domain} preflight 失败（按无附加头继续）：${(e as Error).message}`);
        }
      }

      for (const ts of target.sections) {
        const section = ts.section;
        if (section.startUrls.length === 0) {
          progress.update(`[crawl] 跳过 ${domain} [${section.key}]：未配置 startUrls`);
          summary.failed++;
          continue;
        }
        // 断点续跑：上次已完整落库的栏目整段跳过（含软删，不再触碰该栏目数据）
        if (state?.isDone(domain, section.key)) {
          progress.update(`[crawl] 断点续跑：跳过已完成栏目 ${domain} [${section.key}]`);
          continue;
        }

        // ── 非产品内容采集（section.contentType !== 'products'）→ contents 表管线 ──
        if (section.contentType !== 'products') {
          const pendingC: PendingContent[] = [];
          // 栏目绑定分类（buildTargets 已建树）：dry-run 哨兵 0 → 保留 null，别写不存在的 FK
          const categoryIdC = (ts.categoryId ?? 0) > 0 ? ts.categoryId : null;
          try {
            const { detailFailed: detailFailedC, missingPages: missingPagesC } = await collectContentSection({ progress, mode, opts, section, companyId, categoryId: categoryIdC, pending: pendingC, seenSet, domain, adapter, headers: extraHeaders });
            // 详情级失败计入 summary.failed（docs/16 E1：报告不再恒显「失败 0」）
            summary.failed += detailFailedC;
            for (const p of missingPagesC) summary.missingPages.push(`${domain} [${section.key}] 内容第${p}页`);
          } catch (e) {
            summary.failed++;
            progress.update(`[crawl] ${domain} [${section.key}] 内容采集失败：${(e as Error).message}`);
            continue;
          }
          if (dryRun) {
            summary.dryRunParsed = (summary.dryRunParsed ?? 0) + pendingC.length;
            progress.update(`[crawl] (dry-run) ${domain} [${section.key}] 解析内容 ${pendingC.length} 条`);
            continue;
          }
          const existedC = await loadExistingContents(db, companyId, section.key);
          // 同一栏目内 identityKey 唯一化（与产品管线同口径）
          const uniqueC = uniqueBy(pendingC, (c) => c.identityKey);
          if (uniqueC.length !== pendingC.length) {
            progress.update(
              `[crawl] ${domain} [${section.key}] 内容去重键唯一化：${pendingC.length} → ${uniqueC.length} 条`,
            );
          }
          for (const [i, c] of uniqueC.entries()) {
            const prev = existedC.get(c.identityKey);
            await upsertContent(db, c, now);
            if (prev) summary.contentUpdated++;
            else summary.contentNew++;
            // 落库进度节流（与产品管线同口径）
            const step = Math.max(25, Math.ceil(uniqueC.length / 10));
            if ((i + 1) % step === 0 || i + 1 === uniqueC.length) {
              progress.update(`[crawl] ${domain} [${section.key}] 内容落库 ${i + 1}/${uniqueC.length}`);
            }
          }
          summary.delisted += await softDeleteMissingContents(
            db,
            companyId,
            section.key,
            seenSet(companyId, section.key),
            now,
          );
          continue;
        }

        summary.categories++;
        const categoryId = ts.categoryId;

        const pending: PendingProduct[] = [];
        // 模型兜底（形态 E）本栏目统计：补全字段数 / 失败条数 + 首条失败原因
        const modelStat: ModelStat = { filled: 0, failed: 0 };
        // 先读库内已有产品（identityKey → id/price）：既供落库阶段判 新增/更新/价格变化，
        // 又在续跑时作为「已落库不重抓」的跳过集合（docs/16 规模化兜底）
        const existed = await loadExisting(db, companyId, section.key);
        // ⚠️ 仅续跑（--resume）才跳过已落库详情；普通轮必须全量重抓——否则价格/描述永远刷新不到
        // （state 普通轮也非空：为了中途崩溃可续跑，每轮都会建断点文件，不能拿它当续跑判据）
        const skipKeys = opts.resume !== undefined ? new Set(existed.keys()) : undefined;
        // 栏目级计数基线：完成后算增量，写进断点文件
        const baseNew = summary.new;
        const baseUpdated = summary.updated;
        const baseFailed = summary.failed;
        // 流式落库上下文（docs/16 规模化兜底）：详情每满 CRAWL_UPSERT_BATCH 条就地刷库——
        // 边抓边写（库里实时可见）、内存有界、崩溃最多丢一批。面包屑建树挪进刷批前逐条解析。
        const catCache = new Map<string, number>();
        const flushedKeys = new Set<string>(); // 跨批防重（同 identityKey 只落一次，计数不虚高）
        let flushedCount = 0;
        let batchNo = 0;
        // 返回实际刷库条数（去重防重后可能 < batch.length）：collectSection 据此打「已落库N」实时后缀
        const flushBatch = async (batch: PendingProduct[]): Promise<number> => {
          const fresh = uniqueBy(batch, (p) => p.identityKey).filter((p) => !flushedKeys.has(p.identityKey));
          if (fresh.length === 0) return 0;
          for (const p of fresh) {
            if (!p.breadcrumb?.length) continue;
            const key = p.breadcrumb.join(' > ');
            let cid = catCache.get(key);
            if (cid === undefined) {
              cid = await upsertCategoryPath(db, companyId, p.breadcrumb, null, section.productLine ?? null, dryRun, progress);
              catCache.set(key, cid);
            }
            if (cid > 0) p.categoryId = cid; // dryRun 哨兵 0 → 保留栏目绑定分类
          }
          for (const p of fresh) flushedKeys.add(p.identityKey);
          await flushUpsertBatch(db, dialect, fresh, existed, summary, now, crawlRow.id, progress, domain, section.key);
          flushedCount += fresh.length;
          batchNo++;
          return fresh.length;
        };
        try {
          const { detailFailed, missingPages, fieldMismatches } = await collectSection({
            progress, mode, opts, section, companyId, categoryId, pending, seenSet, modelStat,
            domain, adapter, headers: extraHeaders, skipKeys,
            onBatch: dryRun ? undefined : flushBatch, // dry-run 全程零写入，缓冲全量留给解析计数
          });
          // 详情级失败计入 summary.failed（docs/16 E1：报告不再恒显「失败 0」）
          summary.failed += detailFailed;
          if (detailFailed > 0) {
            progress.update(`[crawl] ${domain} [${section.key}] 详情失败 ${detailFailed} 条（已计入 summary.failed）`);
          }
          // 两阶段字段不一致累计（Q2）：并入 summary，结束前统一告警
          for (const [f, c] of Object.entries(fieldMismatches)) {
            summary.fieldMismatches[f] = (summary.fieldMismatches[f] ?? 0) + c;
          }
          // 列表页抓取失败被跳过的页码：汇总进 summary，结束前统一告警（docs/16 规模化兜底）
          for (const p of missingPages) summary.missingPages.push(`${domain} [${section.key}] 第${p}页`);
        } catch (e) {
          summary.failed++;
          progress.update(`[crawl] ${domain} [${section.key}] 失败：${(e as Error).message}`);
          continue;
        }
        // 流式落库收尾（docs/16 规模化兜底）：详情阶段已满批刷出，这里补刷不满一批的余量，
        // 并定格独立的「落库 完成」行（紧跟详情行之后；置于瞬时提示前，防 writeLine 清掉下方提示）。
        if (!dryRun) {
          if (pending.length > 0) await flushBatch(pending.splice(0, pending.length));
          progress.writeLine(
            `[crawl] ${domain} [${section.key}] 落库 完成 累计${flushedCount}${batchNo > 0 ? ` · 批次${batchNo}` : ''}`,
          );
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
          summary.dryRunParsed = (summary.dryRunParsed ?? 0) + pending.length;
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

        summary.delisted += await softDeleteMissing(db, companyId, section.key, seenSet(companyId, section.key), now);
        // 断点落盘：本栏目采集+落库+软删全部完成 → 标记 done 并写文件（崩溃后 --resume 可跳过）
        state?.markDone(domain, section.key, {
          newCount: summary.new - baseNew,
          updatedCount: summary.updated - baseUpdated,
          failedCount: summary.failed - baseFailed,
        });
        state?.save();
      }
    }

    summary.companies = companyIds.size;
    // 列表页缺失强告警（docs/16 规模化兜底）：重试耗尽仍失败的页已跳过、继续翻页，不再静默终止整轮
    if (summary.missingPages.length > 0) {
      progress.update(`[crawl] ⚠️ ${summary.missingPages.length} 个列表页抓取失败（重试耗尽已跳过，继续翻页）：`);
      for (const m of summary.missingPages.slice(0, 20)) progress.update(`[crawl]   ⚠️ 缺失 ${m}`);
      if (summary.missingPages.length > 20) progress.update(`[crawl]   … 其余 ${summary.missingPages.length - 20} 个略`);
      if (!dryRun) {
        await recordAlert(db, {
          type: 'SITE_UNREACHABLE',
          severity: 'warning',
          message: `本轮 ${summary.missingPages.length} 个列表页抓取失败（重试耗尽已跳过，继续翻页，不终止整轮）`,
          payload: {
            missingPages: summary.missingPages,
            hint: '检查该站点 listTraversal（listRetry / urlTemplate / 渲染模式 / WAF 前置 preflight）',
          },
        });
      }
    }
    // 两阶段字段不一致汇总告警（Q2）：非阻断，提示「列表/详情解析规则可能漂移」
    const mismatchEntries = Object.entries(summary.fieldMismatches).sort((a, b) => b[1] - a[1]);
    if (mismatchEntries.length > 0) {
      const total = mismatchEntries.reduce((s, [, c]) => s + c, 0);
      progress.update(`[crawl] ⚠️ 两阶段字段不一致 ${total} 次（列表值已存 row[<字段>_list]，详情值落库）：`);
      for (const [f, c] of mismatchEntries.slice(0, 15)) {
        progress.update(`[crawl]   ⚠️ ${f}: ${c} 次`);
      }
      if (mismatchEntries.length > 15) progress.update(`[crawl]   … 其余 ${mismatchEntries.length - 15} 个字段略`);
    }
    progress.done(
      `${dryRun ? '[crawl] (dry-run) 完成（全程零写入）' : '[crawl] 完成'}：公司 ${summary.companies} / 品类 ${summary.categories} / 栏目 ${summary.sections} / 新增 ${summary.new} / 更新 ${summary.updated} / 下架 ${summary.delisted} / 价格点 ${summary.pricePoints}${summary.contentNew + summary.contentUpdated > 0 ? ` / 内容新增 ${summary.contentNew} / 内容更新 ${summary.contentUpdated}` : ''} / 失败 ${summary.failed}${summary.missingPages.length ? ` / 缺失页 ${summary.missingPages.length}` : ''}${mismatchEntries.length ? ` / 字段不一致 ${mismatchEntries.reduce((s, [, c]) => s + c, 0)}` : ''}${summary.adapterSites ? ` / 代码适配器 ${summary.adapterSites}` : ''}${dryRun ? ` / 解析 ${summary.dryRunParsed ?? 0} 条` : ''}`,
    );
    await finalize(db, crawlRow.id, summary.failed > 0 ? 'partial' : 'success', summary, dryRun);
    // 整轮成功（含 partial：栏目级失败已计 summary.failed，下轮全量重跑即可）→ 清理断点文件
    state?.remove();
  } catch (e) {
    await finalize(db, crawlRow.id, 'failed', summary, dryRun);
    // 断点保留 + 明确告知续跑方式（docs/16 规模化兜底：失败不前功尽弃）
    if (state) {
      state.save();
      progress.done(`[crawl] ⚠️ 运行中断：${(e as Error).message}`);
      progress.done(
        `[crawl] 断点已保存（已完成 ${state.doneCount} 个栏目）。续跑：pnpm crawl --resume ${state.path}${opts.site ? ` --site ${opts.site}` : ''}`,
      );
      try {
        await recordAlert(db, {
          type: 'CRAWL_INTERRUPTED',
          severity: 'critical',
          crawlId: crawlRow.id,
          message: `crawl 运行中断（断点已保存，已完成 ${state.doneCount} 个栏目，可用 --resume 续跑）`,
          payload: {
            resumePath: state.path,
            doneSections: state.doneCount,
            error: (e as Error).message,
          },
        });
      } catch {
        /* 告警写入失败不影响中断处理 */
      }
    }
    throw e;
  }
}

/** 把栏目绑定到种子品类：优先 name + 产品线精确匹配，否则按域名兜底 */
function resolveCategoryId(
  section: ResolvedSection,
  list: Array<{ cat: { id: number; name: string; productLine: string | null } }>,
): number | null {
  if (section.category) {
    const hits = list.filter((r) => r.cat.name === section.category);
    if (hits.length === 1) return hits[0].cat.id;
    if (hits.length > 1) {
      const f = hits.find((r) => r.cat.productLine === (section.productLine ?? null));
      if (f) return f.cat.id;
      return null; // 同名多节点且无法靠产品线消歧，不瞎猜
    }
  }
  return list.length === 1 ? list[0].cat.id : null;
}

/** 爬取目标：一个域名 → 归属公司 + 一组已绑定 DB 品类的栏目 */
interface SiteTarget {
  domain: string;
  companyId: number;
  sections: TargetSection[];
  /** 渲染模式：CLI --render > YAML render > 'auto'（docs/13 渲染模式梳理） */
  mode: RenderMode;
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
 * - config：扫描 `config/sites/*.yaml` 作为爬取范围真相源。
 * - seeds：读库内 categories（可按产品线过滤）。
 *
 * 代码适配器是**加性补充**（docs/05 §5.3）：与 YAML 共存不算冲突、**不跳过**，
 * 只是给该站点多挂几个可选钩子（过 WAF / 自定义分页 / 解析后补字段）。
 * 返回目标 + 「挂有代码适配器」的域名清单（仅供日志说明，不影响执行）。
 */
async function buildTargets(
  db: Db,
  source: 'config' | 'seeds',
  opts: CrawlOpts,
  progress: Progress,
): Promise<{ targets: Map<string, SiteTarget>; adapterSites: string[] }> {
  const adapterSites: string[] = [];
  const targets = new Map<string, SiteTarget>();
  const dryRun = opts.dryRun === true;
  // --site 支持逗号分隔多个域名
  const siteSet = opts.site ? new Set(opts.site.split(',').map((s) => s.trim()).filter(Boolean)) : null;

  if (source === 'config') {
    for (const domain of listSiteConfigs()) {
      if (siteSet && !siteSet.has(domain)) continue;
      // 加性：有代码适配器也不跳过，只登记（其后按 YAML 解析 + 适配器钩子补齐）
      if (hasCodeAdapter(domain)) adapterSites.push(domain);
      const cfg = loadSiteConfig(domain);
      const mode: RenderMode = (opts.render as RenderMode) ?? (cfg.render as RenderMode) ?? 'auto';
      const sections = resolveSections(cfg);
      const companyId = await resolveCompanyId(db, cfg, dryRun, progress);
      const targetSections: TargetSection[] = [];
      for (const section of sections) {
        // --product-line 过滤（config 模式）：仅跑 productLine 命中的栏目；未声明产品线的栏目一律排除
        if (opts.productLine && section.productLine !== opts.productLine) continue;
        const categoryName = section.category ?? `${domain}::${section.key}`;
        const breadcrumb = section.categoryPath ?? [categoryName];
        // 内容栏目（contentType !== 'products'）同样在分类表建节点，但 content_type 用**内容类型**（school/video…），
        // 与产品的 'products' 分域互不干扰（categories 表按 (company,content_type,path) 判重）。
        // 此前内容栏目恒不建树、contents.category_id 恒 null → 分类表里看不到内容栏目，
        // 前端「按内容分类筛选」无锚点；表设计本就支持（categories.content_type / contents.category_id）。
        const categoryId = await upsertCategoryPath(
          db,
          companyId,
          breadcrumb,
          section.startUrls[0] ?? cfg.startUrl ?? '',
          section.productLine ?? null,
          dryRun,
          progress,
          section.contentType,
        );
        targetSections.push({ section, categoryId, categoryName });
      }
      targets.set(domain, { domain, companyId, sections: targetSections, mode });
    }
    return { targets, adapterSites };
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
    if (siteSet && !siteSet.has(d)) continue;
    const list = byDomain.get(d) ?? [];
    list.push(r);
    byDomain.set(d, list);
  }

  for (const [domain, list] of byDomain) {
    if (!fs.existsSync(siteConfigPath(domain))) {
      progress.update(`[crawl] 跳过 ${domain}：无适配器配置 config/sites/${domain}.yaml`);
      continue;
    }
    // 加性：有代码适配器也不跳过，只登记（其后按 YAML 解析 + 适配器钩子补齐）
    if (hasCodeAdapter(domain)) adapterSites.push(domain);
    const cfg = loadSiteConfig(domain);
    const mode: RenderMode = (opts.render as RenderMode) ?? (cfg.render as RenderMode) ?? 'auto';
    const sections = resolveSections(cfg);
    const companyId = list[0].company.id;
    const targetSections: TargetSection[] = sections.map((section) => {
      // 内容栏目（collects !== 'products'）不绑品类
      const categoryId = section.contentType !== 'products' ? null : resolveCategoryId(section, list);
      const categoryName = section.category ?? domain;
      return { section, categoryId, categoryName };
    });
    targets.set(domain, { domain, companyId, sections: targetSections, mode });
  }

  return { targets, adapterSites };
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
 * config 模式公司解析：优先复用「website 命中该域名」或「name 命中 YAML company」的已存在公司
 * （含人工手动插入的行），避免重复建行；都找不到才按 name=company??domain 新建。
 * dryRun：改为仅预览——命中已存在公司返回其 id（不改名），未命中只记「将新建」并返回哨兵 0，不做任何写入。
 */
async function resolveCompanyId(
  db: Db,
  cfg: { domain: string; company?: string; competitorType?: string; role?: string },
  dryRun: boolean,
  progress: Progress,
): Promise<number> {
  const domain = cfg.domain;
  const wantName = cfg.company ?? domain;
  const all = await db.select().from(companies).where(isNull(companies.removedAt));
  // YAML 显式声明的公司属性（competitorType/role）：与库中现有值不同则更新（YAML 为准），未声明/相同则不动
  const applyAttrs = async (row: { id: number; competitorType: string | null; role: string }) => {
    const set: { competitorType?: string; role?: string } = {};
    if (cfg.competitorType && cfg.competitorType !== row.competitorType) set.competitorType = cfg.competitorType;
    if (cfg.role && cfg.role !== row.role) set.role = cfg.role;
    if (!Object.keys(set).length) return;
    if (dryRun) {
      progress.update(`[crawl] (dry-run) 将按 YAML 更新公司属性 id=${row.id}: ${JSON.stringify(set)}`);
      return;
    }
    await db.update(companies).set({ ...set, updatedAt: nowSeconds() }).where(eq(companies.id, row.id));
  };
  const byWeb = all.find((c) => domainOf(c.website) === domain);
  if (byWeb) {
    if (cfg.company && cfg.company !== byWeb.name) {
      if (dryRun) {
        progress.update(`[crawl] (dry-run) 将更新公司名称 ${byWeb.name} → ${cfg.company} (id=${byWeb.id})`);
      } else {
        await db
          .update(companies)
          .set({ name: cfg.company, updatedAt: nowSeconds() })
          .where(eq(companies.id, byWeb.id));
      }
    }
    await applyAttrs(byWeb);
    return byWeb.id;
  }
  // name 命中（含人工手动插入的公司）：复用并补全 website
  const byName = all.find((c) => c.name === wantName);
  if (byName) {
    if (!byName.website) {
      if (dryRun) {
        progress.update(`[crawl] (dry-run) 复用公司 ${byName.name} (id=${byName.id}) 并补 website=https://${domain}`);
      } else {
        await db
          .update(companies)
          .set({ website: `https://${domain}`, updatedAt: nowSeconds() })
          .where(eq(companies.id, byName.id));
      }
    }
    await applyAttrs(byName);
    return byName.id;
  }
  if (dryRun) {
    progress.update(`[crawl] (dry-run) 将新建公司 ${wantName}`);
    return 0;
  }
  return upsertCompany(db, wantName, `https://${domain}`, cfg);
}

/** 按 name upsert 公司（config 模式新建 / 复用）；website 仅在为空时补全，不覆盖人工维护值 */
async function upsertCompany(
  db: Db,
  name: string,
  website?: string,
  attrs?: { competitorType?: string; role?: string },
): Promise<number> {
  const t = nowSeconds();
  const existing = await db.select().from(companies).where(eq(companies.name, name)).limit(1);
  if (existing.length) {
    const row = existing[0];
    const set: { competitorType?: string; role?: string; removedAt: null; updatedAt: number } = {
      removedAt: null,
      updatedAt: t,
    };
    if (attrs?.competitorType && attrs.competitorType !== row.competitorType) set.competitorType = attrs.competitorType;
    if (attrs?.role && attrs.role !== row.role) set.role = attrs.role;
    await db.update(companies).set(set).where(eq(companies.id, row.id));
    return row.id;
  }
  const [ins] = await db
    .insert(companies)
    .values({
      name,
      website: website ?? null,
      competitorType: attrs?.competitorType ?? null,
      role: attrs?.role ?? 'competitor',
      removedAt: null,
      createdAt: t,
      updatedAt: t,
    })
    .returning();
  return ins.id;
}

/**
 * 按 (companyId, contentType, path) 业务主键 upsert 单个分类节点；返回 { id, idPath }。
 * idPath = id 物化路径（`0-<rootId>-…-<selfId>`，parentIds 传父链、根传 '0'）：辅助键，
 * 改名不动它、子树可按前缀 LIKE 精准圈定；**爬虫业务键仍是 name-path**（自增 id 跨库不稳定）。
 * idPath 含自身 id → 新建行先插再补写（两次语句，分类量小可接受）；旧行 idPath 缺失/漂移则顺带自愈。
 */
async function upsertCategoryNode(
  db: Db,
  companyId: number,
  name: string,
  path: string,
  productLine: string | null,
  url: string | null,
  parentId: number | null,
  parentIds: string,
  level: number,
  dryRun: boolean,
  progress: Progress,
  contentType = 'products',
): Promise<{ id: number; idPath: string }> {
  const t = nowSeconds();
  const existing = await db
    .select({ id: categories.id, idPath: categories.idPath })
    .from(categories)
    .where(
      and(
        eq(categories.companyId, companyId),
        eq(categories.contentType, contentType),
        eq(categories.path, path),
      ),
    )
    .limit(1);
  if (existing.length) {
    const idPath = `${parentIds}-${existing[0].id}`;
    if (!dryRun) {
      await db
        .update(categories)
        .set({
          name, url, productLine, parentId, level, removedAt: null, updatedAt: t,
          ...(existing[0].idPath !== idPath ? { idPath } : {}), // 自愈旧数据/漂移
        })
        .where(eq(categories.id, existing[0].id));
    }
    return { id: existing[0].id, idPath };
  }
  if (dryRun) {
    progress.update(`[crawl] (dry-run) 将新建分类 ${path} (contentType=${contentType}, company=${companyId})`);
    return { id: 0, idPath: `${parentIds}-0` }; // dry-run 哨兵：不写库，链形状仅用于延续父链
  }
  const [ins] = await db
    .insert(categories)
    .values({ companyId, contentType, parentId, path, name, level, productLine, url, removedAt: null, createdAt: t, updatedAt: t })
    .returning();
  const idPath = `${parentIds}-${ins.id}`;
  await db.update(categories).set({ idPath }).where(eq(categories.id, ins.id));
  return { id: ins.id, idPath };
}

/**
 * 自顶向下建树并 upsert 栏目绑定的分类：breadcrumb（从根到栏目）逐层建节点，
 * 计算 parent_id / path / level；productLine 作为最顶层根（兼容 --product-line）。返回叶子（本栏目所属分类）id。
 * url 仅写在叶子节点上（分类列表页地址；动态面包屑场景传 null）。
 */
export async function upsertCategoryPath(
  db: Db,
  companyId: number,
  breadcrumb: string[],
  url: string | null,
  productLine: string | null,
  dryRun: boolean,
  progress: Progress,
  contentType = 'products',
): Promise<number> {
  const full = productLine ? [productLine, ...breadcrumb] : breadcrumb.slice();
  let parentId: number | null = null;
  let parentIds = '0'; // 根的父链（idPath 以 0 起头：0-<rootId>-…）
  let leafId = 0;
  for (let i = 0; i < full.length; i++) {
    const isLeaf = i === full.length - 1;
    const node = await upsertCategoryNode(
      db, companyId, full[i], full.slice(0, i + 1).join('/'), productLine,
      isLeaf ? url : null, parentId, parentIds, i, dryRun, progress, contentType,
    );
    parentId = node.id;
    parentIds = node.idPath;
    leafId = node.id;
  }
  return leafId;
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

/** 抓取一个栏目的全部 startUrls：翻页 → 详情 → 归一化入 pending。返回详情抓取失败条数（docs/16 E1） */
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
  /** 站点域名（供适配器钩子 ctx 使用） */
  domain: string;
  /** 代码适配器（docs/16 🔴-2）：null = 纯 YAML */
  adapter: CodeAdapter | null;
  /** preflight 产出的附加请求头（如 Cookie） */
  headers: Record<string, string>;
  /**
   * 断点续跑（docs/16）：已落库的 identityKey 集合，命中则跳过详情抓取（不重抓，只标 seen 防软删）。
   * 仅 --resume 时传入；正常轮不传（全量重抓才能发现价格/描述变化）。
   */
  skipKeys?: Set<string>;
  /**
   * 流式落库（docs/16 规模化兜底）：详情缓冲满 UPSERT_BATCH 条时同步切批回调刷库。
   * 返回实际刷库条数（跨批去重后可能 < batch.length），用于详情行「已落库N」实时后缀。
   * 不传则维持旧行为「整栏目抓完再落」。刷库失败不吞成详情失败——记录后收尾统一上抛（整栏目失败）。
   */
  onBatch?: (batch: PendingProduct[]) => Promise<number>;
}): Promise<{ detailFailed: number; missingPages: number[]; fieldMismatches: Record<string, number> }> {
  const { progress, mode, opts, section, companyId, categoryId, pending, seenSet, modelStat, domain, adapter, headers, skipKeys, onBatch } = args;
  // 渲染模式回退链（Hybrid 站点）：列表页 renderList → render → 站点 mode；详情页 renderDetail → render → 站点 mode
  const listMode = listRenderMode(section, mode);
  const detailMode = detailRenderMode(section, mode);
  const limit = opts.limit ?? Number.MAX_SAFE_INTEGER;
  // 翻页/条目控制：YAML（section 字段级合并）+ CLI 覆盖 → 最终生效值
  const tv = resolveTraversalLimits(section.listTraversal, opts);
  const items: ListItem[] = [];
  const ctx: CodeAdapterCtx = { domain, sectionKey: section.key, contentType: section.contentType };
  // 列表抓取失败被跳过的页码（重试耗尽仍失败），汇总后由主循环落告警（docs/16 规模化兜底）
  const missingPages: number[] = [];
  // 两阶段字段不一致累计（Q2）：键=字段名，值=次数；随返回结果并入 summary
  const fieldMismatches: Record<string, number> = {};

  // 列表翻页进度：页级 ProgressCounter（实时用时/速率）。收尾 commit 成独立行（带 \n），
  // 后续详情进度从新行开始，不会覆盖本行（docs/16 P5-进度：列表进度需保留可见）。
  // total 仅在 pagination-url 且 pageEnd 已知时才有意义，否则记 0（未知总页数 → 显示「第N页」）。
  const listCap = tv.pageEnd !== undefined ? tv.pageEnd - tv.pageStart + 1 : 0;
  const listBar = new ProgressCounter(progress, `[crawl] [${section.key}] 列表`, listCap, {
    unit: '页',
    showOutcome: false,
    liveTime: true,
  });
  for (const listUrl of section.startUrls) {
    listBar.note(`翻页 ${listUrl}`);
    const res = await traverseList({
      url: listUrl,
      traversal: section.listTraversal,
      listMode,
      maxPages: tv.maxPages,
      pageEnd: tv.pageEnd,
      progress,
      // 适配器钩子（docs/16 🔴-2）：preflight 附加头 + 自定义翻页拼装
      headers,
      buildPageUrlFn: adapter?.buildPageUrl
        ? (base, template, page) => adapter.buildPageUrl!(base, template, page, ctx)
        : undefined,
      onPage: async (html, pageNo, pageUrl) => {
        let pageItems = slicePageItems(parseListWithConfig(html, section.parseList, section.key), tv);
        for (const it of pageItems) {
          it.detailUrl = absoluteUrl(it.detailUrl, pageUrl ?? listUrl);
          it.listUrl = pageUrl ?? listUrl; // 溯源：本条出自哪个列表页
        }
        // 适配器钩子：列表解析后二次加工（过滤/补字段）；同步异步均可，统一 await
        if (adapter?.postParseList) pageItems = await adapter.postParseList(pageItems, ctx);
        items.push(...pageItems);
        listBar.tick(true, `第${pageNo}页 +${pageItems.length}条 累计${items.length}`);
        return pageItems.length;
      },
    });
    if (res.missingPages.length) missingPages.push(...res.missingPages);
  }

  // 列表去重：列表页常把同一产品渲染两次（pc/web 双套模板、图片链接+标题链接），
  // 不去重会导致同一详情被抓两次、`新增` 计数虚高。去重键 = canonical(detailUrl)，与落库口径一致。
  const { items: deduped, duplicates } = dedupeListItems(items);
  const targets = deduped.slice(0, limit);
  // 列表阶段收尾：去重/解析统计一并定格进列表进度行（commit 带 \n，详情进度从其下新行开始）
  const listNotes: string[] = [];
  if (duplicates > 0) listNotes.push(`去重${items.length}→${deduped.length}`);
  listNotes.push(`详情解析${targets.length}/${deduped.length}`);
  listBar.finish(listNotes.join(' · '));

  // 详情失败可见化（docs/16 E1）：失败不再静默——计数 + 明细收尾统一打印
  // 并发限制（docs/16 P5）：p-limit 限流，CRAWL_DETAIL_CONCURRENCY（0/未设/非法 → CPU 核心数），防同站瞬时高并发被拉黑
  const limiter = pLimit(detailConcurrency());
  // 并发详情进度：逐条 tick 单行刷新（完成数/百分比/速率），失败明细 finish 时统一打印
  const detailBar = new ProgressCounter(progress, `[crawl] [${section.key}] 详情`, targets.length);
  let detailFailed = 0;
  let skippedSaved = 0; // 续跑时跳过的已落库条数（收尾打进详情行，让「跳过」可见）
  let flushError: unknown = null; // 流式刷库失败：不吞成详情失败，收尾统一上抛（整栏目失败）
  // 流式落库实时后缀：满批刷库回调外包一层，刷完立刻在详情行尾追加「已落库N」（三段进度：列表/详情/落库）
  let flushedSaved = 0;
  const wrappedOnBatch = onBatch
    ? async (batch: PendingProduct[]) => {
        const n = await onBatch(batch);
        flushedSaved += n;
        detailBar.setSuffix(`已落库${flushedSaved}`);
      }
    : undefined;
  await Promise.all(targets.map((it) => limiter(async () => {
    let ok = true;
    let errMsg = '';
    try {
      // 断点续跑：该条已落库 → 不重抓详情，只标 seen（软删口径不变）。
      // 列表阶段没有类型化 sourceProductId（在 raw 快照里），与落库时 pickIdentityKey 同源兜底到 canonical(detailUrl)
      const preKey = pickIdentityKey(
        typeof it.raw?.sourceProductId === 'string' ? it.raw.sourceProductId : null,
        it.detailUrl,
      );
      if (skipKeys?.has(preKey)) {
        seenSet(companyId, section.key).add(preKey);
        skippedSaved++;
        return;
      }
      const html = await fetchPage(it.detailUrl, detailMode, undefined, headers);
      const merged = mergeListFallback(parseDetailWithConfig(html, section.parseDetail.fields), it.raw);
      let normalized = merged.product;
      for (const f of merged.mismatches) {
        fieldMismatches[f] = (fieldMismatches[f] ?? 0) + 1;
      }
      // 适配器钩子：详情解析后二次加工（在 api 源 / 模型兜底之前，它们只补空不覆盖）
      if (adapter?.postParseDetail) normalized = await adapter.postParseDetail(normalized, html, ctx);
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
      // 身份键随后由 pickIdentityKey 兜底到规范化详情链接（canonical）。
      const sourceProductId = normalized.sourceProductId ?? null;
      const identityKey = pickIdentityKey(sourceProductId, detailUrl);
      if (!identityKey) return;
      // 面包屑动态分类：配置了 categoryFromPage 才解析；空数组时落库侧回落栏目绑定分类
      const breadcrumb = section.categoryFromPage ? parseBreadcrumb(html, section.categoryFromPage) : null;
      pending.push({
        companyId,
        categoryId,
        breadcrumb: breadcrumb && breadcrumb.length > 0 ? breadcrumb : null,
        sectionKey: section.key,
        identityKey,
        sourceProductId,
        sku: normalized.sku ?? null,
        name: normalized.name ?? it.name ?? null,
        englishName: normalized.englishName ?? null,
        aliases: normalized.aliases ?? null,
        oldSkus: normalized.oldSkus ?? null,
        brand: normalized.brand ?? null,
        detailUrl,
        listUrl: it.listUrl ?? null,
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
      seenSet(companyId, section.key).add(identityKey);
      // 流式落库：缓冲满一批就同步切出刷库（check+splice 同步原子，并发 worker 不会双刷）；
      // 刷库失败记录后不再继续刷（防级联报错），收尾统一上抛
      if (wrappedOnBatch && pending.length >= UPSERT_BATCH) {
        const batch = pending.splice(0, pending.length);
        if (flushError === null) {
          try {
            await wrappedOnBatch(batch);
          } catch (e) {
            flushError = e;
          }
        }
      }
    } catch (e) {
      // 详情失败隔离：跳过该条继续，但**必须可见**（计数 + finish 时统一打印明细，不再静默丢数据）
      ok = false;
      errMsg = `${it.detailUrl}：${(e as Error).message}`;
      detailFailed++;
    } finally {
      detailBar.tick(ok, ok ? undefined : errMsg);
    }
  })));
  // 定格详情行前清掉中间态后缀（定格行只报详情结果；最终落库数由主循环紧随其后的「落库 完成」行给出）
  detailBar.setSuffix(null);
  detailBar.finish(skippedSaved > 0 ? `跳过已落库${skippedSaved}（--resume 续跑）` : undefined);
  if (flushError) throw flushError; // 落库失败按栏目失败上抛（进主循环 catch，不混入详情失败计数）
  return { detailFailed, missingPages, fieldMismatches };
}

/**
 * 详情优先、列表兜底合并（Q2，由字段注册表驱动，去掉硬编码 12 字段）：
 * 列表页常有货号/价格/规格而详情页反而缺 → 用列表值补空（不覆盖详情已有值）。
 * 仅合并 registry 中 `listFallback=true` 的标量/数值字段；数组字段（specs 等）不动。
 * 两阶段都抽到且「归一后不一致」的字段（`auditMismatch=true`）计入 mismatches，
 * 并把列表值存入 `row[<field>_list]` 供溯源；汇总进 summary.fieldMismatches（非阻断告警）。
 */
function mergeListFallback(np: NormalizedProduct, raw?: Record<string, unknown>): {
  product: NormalizedProduct;
  mismatches: string[];
} {
  const mismatches: string[] = [];
  if (!raw) return { product: np, mismatches };
  const target = np as unknown as Record<string, unknown>;
  for (const meta of PRODUCT_FIELDS) {
    if (!meta.listFallback) continue;
    const detailVal = target[meta.name];
    const listVal = raw[meta.name];
    if (meta.type === 'number') {
      const d = toNumberOrNull(detailVal);
      const l = toNumberOrNull(listVal);
      if (d === null) {
        if (l !== null) target[meta.name] = l;
      } else if (meta.auditMismatch && l !== null && d !== l) {
        (np.row as Record<string, unknown>)[`${meta.name}_list`] = listVal;
        mismatches.push(meta.name);
      }
    } else {
      const dStr = typeof detailVal === 'string' ? detailVal : '';
      const lStr = typeof listVal === 'string' ? listVal : '';
      if (dStr === '' && lStr !== '') target[meta.name] = lStr;
      else if (meta.auditMismatch && dStr !== '' && lStr !== '' && !normEqual(dStr, lStr)) {
        (np.row as Record<string, unknown>)[`${meta.name}_list`] = listVal;
        mismatches.push(meta.name);
      }
    }
  }
  return { product: np, mismatches };
}

/** 归一比较：去首尾空白、压缩内部空白、转小写后相等则视为一致（避免大小写/空格造成的噪音告警） */
function normEqual(a: string, b: string): boolean {
  const n = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
  return n(a) === n(b);
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

/** 读取某公司某栏目下现有产品：identityKey → { id, price }（用于判断 new/updated 与价格变化） */
async function loadExisting(
  db: Db,
  companyId: number,
  sectionKey: string,
): Promise<Map<string, { id: number; price: number | null }>> {
  const rows = await db
    .select({ id: products.id, identityKey: products.identityKey, price: products.price })
    .from(products)
    .where(and(eq(products.companyId, companyId), eq(products.sectionKey, sectionKey)));
  return new Map(rows.map((r) => [r.identityKey, { id: r.id, price: r.price }]));
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

/**
 * 批量写价格历史（多行 insert，一次网络往返写一批，解决逐条写库慢）。
 * 仅写入不消费；与产品 upsert 同事务（见 flushUpsertBatch），失败整批回滚。
 */
interface PriceRow {
  productId: number;
  p: PendingProduct;
  crawlId: number;
  now: number;
}
async function batchRecordPrice(db: Db, rows: PriceRow[]): Promise<void> {
  if (rows.length === 0) return;
  await db.insert(priceHistory).values(
    rows.map((r) => ({
      productId: r.productId,
      price: r.p.price,
      currency: r.p.currency,
      priceText: r.p.priceText,
      specText: r.p.specText,
      crawlId: r.crawlId,
      capturedAt: r.now,
    })),
  );
}

/**
 * 增量批量落库（docs/16 规模化兜底）：把一批评产品（≤ CRAWL_UPSERT_BATCH，默认 200）逐条 upsert
 * （复用现有 upsertProduct，零方言风险）+ 批量写价格历史（多行一次插入）。
 * - 解决「逐条写库慢」：价格历史走多行批量写入，生产库 MySQL/PG 还可整批包进 1 个事务（仅 1 次 commit）。
 * - 解决「中途崩全丢」：批内 upsert 是幂等的，崩溃最多丢当前批，重跑（断点续跑）会跳过已落盘项，不重复、不丢。
 *
 * 方言注意：better-sqlite3 的事务回调**必须是同步函数**，而 drizzle 的 insert 是 async，故 SQLite 走
 * 逐条 upsert（与旧行为一致、安全）；MySQL/PG 事务支持 async 回调 → 整批包进事务，原子且只 1 次 commit。
 */
const UPSERT_BATCH = Number(process.env.CRAWL_UPSERT_BATCH) > 0 ? Number(process.env.CRAWL_UPSERT_BATCH) : 200;
export async function flushUpsertBatch(
  db: Db,
  dialect: DbDialect,
  batch: PendingProduct[],
  existed: Map<string, { id: number; price: number | null }>,
  summary: CrawlSummary,
  now: number,
  crawlId: number,
  progress: Progress,
  domain: string,
  sectionKey: string,
): Promise<void> {
  const priceRows: PriceRow[] = [];
  const runBatch = async (tx: Db) => {
    for (const p of batch) {
      const prev = existed.get(p.identityKey);
      const productId = await upsertProduct(tx, p, now);
      if (prev) summary.updated++;
      else summary.new++;
      // 价格历史：首次入库或价格变化时记一行（新旧价全空则不记）
      const changed = !prev || prev.price !== p.price;
      if (changed && (p.price !== null || (prev?.price ?? null) !== null)) {
        priceRows.push({ productId, p, crawlId, now });
        summary.pricePoints++;
      }
    }
    await batchRecordPrice(tx, priceRows);
  };
  if (dialect === 'sqlite') {
    // better-sqlite3 事务回调必须同步，drizzle insert 是 async → 无法用 db.transaction；逐条 upsert 与旧行为一致
    await runBatch(db);
  } else {
    // MySQL / PostgreSQL：事务支持 async 回调 → 整批原子（失败整批回滚），且只 1 次 commit，大幅减少网络往返
    await db.transaction(async (tx) => {
      await runBatch(tx as Db);
    });
  }
}

async function upsertProduct(db: Db, p: PendingProduct, now: number): Promise<number> {
  const rows = await db
    .insert(products)
    .values({
      companyId: p.companyId,
      categoryId: p.categoryId,
      contentType: 'products',
      sourceProductId: p.sourceProductId,
      sku: p.sku,
      identityKey: p.identityKey,
      sectionKey: p.sectionKey,
      name: p.name,
      englishName: p.englishName,
      aliases: p.aliases,
      oldSkus: p.oldSkus,
      brand: p.brand,
      detailUrl: p.detailUrl,
      listUrl: p.listUrl,
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
      target: [products.companyId, products.identityKey, products.sectionKey],
      set: {
        categoryId: p.categoryId,
        contentType: 'products',
        sourceProductId: p.sourceProductId,
        sku: p.sku,
        name: p.name,
        englishName: p.englishName,
        aliases: p.aliases,
        oldSkus: p.oldSkus,
        brand: p.brand,
        detailUrl: p.detailUrl,
        listUrl: p.listUrl,
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
    .select({ id: products.id, identityKey: products.identityKey, missingSince: products.missingSince })
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
    if (seenKeys.has(r.identityKey)) continue;
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

async function finalize(
  db: Db,
  crawlId: number,
  status: string,
  summary: CrawlSummary,
  dryRun = false,
): Promise<void> {
  if (dryRun) return;
  await db
    .update(crawls)
    .set({ status, summary, finishedAt: nowSeconds() })
    .where(eq(crawls.id, crawlId));
}

// ─────────────────────────────────────────────────────────────────────────────
// 泛型内容采集（section.collects !== 'products'）→ contents 表
//
// 复用同一套抓取引擎（traverseList → parseList → 详情 fetch → parseDetail），
// 只在「归一化落库」处分叉：字段映射 title/summary/body/publishedAt，价格/规格等不适用。
// YAML 写法见 docs/05 §5.6；去重/软删口径与 products 完全一致。
// ─────────────────────────────────────────────────────────────────────────────

interface PendingContent {
  companyId: number;
  /** 内容类型（= section.contentType，原样写入 contents.content_type） */
  contentType: string;
  sectionKey: string;
  identityKey: string;
  sourceId: string | null;
  /** 栏目绑定分类 id（categories 表，content_type 同本行）；null = 不挂 */
  categoryId: number | null;
  title: string;
  summary: string | null;
  body: string | null;
  /** 正文富文本（contents.body_html 列）；仅 YAML 显式配 html: true 的栏有值，默认 null */
  bodyHtml: string | null;
  author: string | null;
  publishedAt: number | null;
  detailUrl: string | null;
  listUrl: string | null;
  row: Record<string, unknown>;
}

/**
 * 抓取一个内容栏目的全部 startUrls：翻页 → 详情 → 归一化入 pending。
 * 与产品版 collectSection 同构；模型兜底 / api 源暂不参与内容管线。
 */
async function collectContentSection(args: {
  progress: Progress;
  mode: RenderMode;
  opts: CrawlOpts;
  section: ResolvedSection;
  companyId: number;
  /** 栏目绑定分类 id（buildTargets 中的 ts.categoryId）；null = 不挂分类（如 dry-run 哨兵） */
  categoryId: number | null;
  pending: PendingContent[];
  seenSet: (cid: number, sectionKey: string) => Set<string>;
  /** 站点域名（供适配器钩子 ctx 使用） */
  domain: string;
  /** 代码适配器（docs/16 🔴-2）：null = 纯 YAML */
  adapter: CodeAdapter | null;
  /** preflight 产出的附加请求头（如 Cookie） */
  headers: Record<string, string>;
}): Promise<{ detailFailed: number; missingPages: number[] }> {
  const { progress, mode, opts, section, companyId, categoryId, pending, seenSet, domain, adapter, headers } = args;
  // 渲染模式回退链（Hybrid 站点）：列表页 renderList → render → 站点 mode；详情页 renderDetail → render → 站点 mode
  const listMode = listRenderMode(section, mode);
  const detailMode = detailRenderMode(section, mode);
  const limit = opts.limit ?? Number.MAX_SAFE_INTEGER;
  // 翻页/条目控制：与产品管线同口径（YAML 字段级合并 + CLI 覆盖）
  const tv = resolveTraversalLimits(section.listTraversal, opts);
  const items: ListItem[] = [];
  const ctx: CodeAdapterCtx = { domain, sectionKey: section.key, contentType: section.contentType };
  // 列表抓取失败被跳过的页码（重试耗尽仍失败），汇总后由主循环落告警（docs/16 规模化兜底）
  const missingPages: number[] = [];

  // 列表翻页进度：页级 ProgressCounter（实时用时/速率），收尾 commit 成独立行，不被详情覆盖
  const listCap = tv.pageEnd !== undefined ? tv.pageEnd - tv.pageStart + 1 : 0;
  const listBar = new ProgressCounter(progress, `[crawl] [${section.key}] 内容列表`, listCap, {
    unit: '页',
    showOutcome: false,
    liveTime: true,
  });
  for (const listUrl of section.startUrls) {
    listBar.note(`翻页 ${listUrl}`);
    const res = await traverseList({
      url: listUrl,
      traversal: section.listTraversal,
      listMode,
      maxPages: tv.maxPages,
      pageEnd: tv.pageEnd,
      progress,
      headers,
      buildPageUrlFn: adapter?.buildPageUrl
        ? (base, template, page) => adapter.buildPageUrl!(base, template, page, ctx)
        : undefined,
      onPage: async (html, pageNo, pageUrl) => {
        let pageItems = slicePageItems(parseListWithConfig(html, section.parseList, section.key), tv);
        for (const it of pageItems) {
          it.detailUrl = absoluteUrl(it.detailUrl, pageUrl ?? listUrl);
          it.listUrl = pageUrl ?? listUrl; // 溯源：本条出自哪个列表页
        }
        if (adapter?.postParseList) pageItems = await adapter.postParseList(pageItems, ctx);
        items.push(...pageItems);
        listBar.tick(true, `第${pageNo}页 +${pageItems.length}条 累计${items.length}`);
        return pageItems.length;
      },
    });
    if (res.missingPages.length) missingPages.push(...res.missingPages);
  }

  // 列表去重：同 canonical(detailUrl) 只留一条（与产品管线一致）
  const { items: deduped, duplicates } = dedupeListItems(items);
  const targets = deduped.slice(0, limit);
  const listNotes: string[] = [];
  if (duplicates > 0) listNotes.push(`去重${items.length}→${deduped.length}`);
  listNotes.push(section.listOnly ? `仅列表${targets.length}/${deduped.length}` : `详情解析${targets.length}/${deduped.length}`);
  listBar.finish(listNotes.join(' · '));

  // 仅列表模式（listOnly，docs：无详情页的栏目）：条目即终态（文件直链/SPA 单页），
  // 跳过详情抓取，用列表快照归一化——title=列表 name、identityKey=canonical(detailUrl)、publishedAt/summary 为空。
  if (section.listOnly) {
    for (const it of targets) {
      const c = toPendingContent({ row: {} } as NormalizedProduct, it, it.detailUrl, companyId, section.key, section.contentType);
      if (c) {
        c.categoryId = categoryId; // 栏目绑定分类（建树在 buildTargets）
        pending.push(c);
        seenSet(companyId, section.key).add(c.identityKey);
      }
    }
    progress.update(`[crawl] [${section.key}] 仅列表模式：${targets.length} 条直接入库（无详情阶段）`);
    return { detailFailed: 0, missingPages };
  }

  // 详情失败可见化（docs/16 E1，与产品管线同口径）；并发限制同 P5（p-limit）
  const limiter = pLimit(detailConcurrency());
  const detailBar = new ProgressCounter(progress, `[crawl] [${section.key}] 内容详情`, targets.length);
  let detailFailed = 0;
  await Promise.all(targets.map((it) => limiter(async () => {
    let ok = true;
    let errMsg = '';
    try {
      const html = await fetchPage(it.detailUrl, detailMode, undefined, headers);
      let np = parseDetailWithConfig(html, section.parseDetail.fields);
      // 适配器钩子：详情解析后二次加工（与产品管线同口径）
      if (adapter?.postParseDetail) np = await adapter.postParseDetail(np, html, ctx);
      const c = toPendingContent(np, it, it.detailUrl, companyId, section.key, section.contentType);
      if (c) {
        c.categoryId = categoryId; // 栏目绑定分类（建树在 buildTargets）
        pending.push(c);
        seenSet(companyId, section.key).add(c.identityKey);
      }
    } catch (e) {
      // 单条失败隔离：跳过该条继续，但记明细 + 计数（不再静默）
      ok = false;
      errMsg = `${it.detailUrl}：${(e as Error).message}`;
      detailFailed++;
    } finally {
      detailBar.tick(ok, ok ? undefined : errMsg);
    }
  })));
  detailBar.finish();
  return { detailFailed, missingPages };
}

/**
 * 归一化内容条目：
 * - title：详情 name → row.title → 列表名
 * - summary：row.summary → description；body：row.body / row.content / row.text
 * - publishedAt：row.date / publishedAt / publishTime / publishDate / time → Unix 秒
 * - identityKey：COALESCE(source_id, canonical(detail_url))，同产品口径
 */
export function toPendingContent(
  np: NormalizedProduct,
  it: ListItem,
  detailUrl: string,
  companyId: number,
  sectionKey: string,
  contentType: string,
): PendingContent | null {
  const row = (np.row ?? {}) as Record<string, unknown>;
  const pick = (...vs: unknown[]): string | null => {
    for (const v of vs) {
      if (typeof v === 'string' && v.trim() !== '') return v.trim();
    }
    return null;
  };
  // 标题链：详情 np.name（YAML 配 name）→ row.title（YAML 配 title 的详情抽取）→ 列表名（YAML 配 name）
  // → 列表 raw.title（YAML 配 title 的列表抽取；listOnly 等无详情场景的唯一兜底，缺它会被静默丢弃）
  const title = pick(np.name, row.title, it.name, it.raw?.title);
  if (!title) return null; // 无标题丢弃
  // 列表阶段抽取快照：详情页常常缺 id/封面/摘要，而列表页有 → 一律「详情非空优先、详情没有就回退列表」。
  // 典型坑：sourceId 只能配在 parseList（id 藏在列表条目链接里），不回退就是「YAML 配了、库里恒 null」；
  // 产品管线的 preKey 兜底（列表 it.raw?.sourceProductId）与此处同源，口径统一。
  const raw = it.raw ?? {};
  /** 列表阶段同名字段兜底：详情没抽到（或抽到空串）时才用，按 keys 顺序取第一个非空 */
  const fromList = (...keys: string[]) => {
    for (const k of keys) {
      const v = raw[k];
      if (typeof v === 'string' && v.trim() !== '') return v.trim();
    }
    return null;
  };
  const sourceId = pick(
    np.sourceProductId,
    row.sourceId,
    row.articleId,
    row.newsId,
    fromList('sourceId', 'articleId', 'newsId'),
  );
  const identityKey = pickIdentityKey(sourceId, detailUrl);
  if (!identityKey) return null;
  return {
    companyId,
    contentType,
    sectionKey,
    identityKey,
    sourceId,
    categoryId: null, // 由调用方按栏目建树结果赋值（buildTargets → 本管线 categoryId）
    title,
    summary: pick(row.summary, np.description, fromList('summary', 'description')),
    body: pick(row.body, row.content, row.text, fromList('body', 'content', 'text')),
    // 富文本：YAML 显式配 bodyHtml(html:true) 时才有值；缺省恒 null（不占空间）
    bodyHtml: pick(row.bodyHtml, fromList('bodyHtml')),
    author: pick(row.author, row.source, fromList('author', 'source')),
    publishedAt: parseDateStr(
      row.date ?? row.publishedAt ?? row.publishTime ?? row.publishDate ?? row.time ??
        fromList('date', 'publishedAt', 'publishTime', 'publishDate', 'time') ??
        undefined,
    ),
    detailUrl: detailUrl || null,
    listUrl: it.listUrl ?? null,
    // 行 JSON：详情字段为主，列表阶段独有的字段补在后面（详情有同名键则以详情为准）——
    // 列表常能抽到详情页没有的封面/缩略图/栏目专有字段（如 material 的 cover），不补就白抽了
    row: { ...mergeListFields(row, raw), listTitle: it.name ?? undefined },
  };
}

/**
 * 行 JSON 两阶段合并：详情字段优先，列表阶段独有（详情没有、或详情抽到空值）的字段补进来。
 * 只补「详情没有的键」——同名的以详情为准，避免列表的脏值覆盖详情抽到的干净值。
 */
function mergeListFields(
  row: Record<string, unknown>,
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...row };
  for (const [k, v] of Object.entries(raw)) {
    if (k in merged) continue;
    if (typeof v === 'string') {
      if (v.trim() === '') continue;
      merged[k] = v.trim();
    } else if (v !== null && v !== undefined) {
      merged[k] = v;
    }
  }
  return merged;
}

/**
 * 常见日期写法 → Unix 秒（统一走 shared/time 封装，时区锁定 Asia/Shanghai，docs/16 T2）：
 * - 数字：>=1e12 视为毫秒、>=1e9 视为秒，其他不猜
 * - 字符串：`YYYY-MM-DD[ HH:mm[:ss]]`（支持 / . 分隔）优先，其次 Date.parse 可解析的 ISO 等格式
 */
export function parseDateStr(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) {
    if (v >= 1e12) return Math.floor(v / 1000);
    if (v >= 1e9) return Math.floor(v);
    return null;
  }
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s) return null;
  // 带时区标记（Z / ±hh[:mm]）的 ISO 字符串：优先 Date.parse（保时区语义），避免被本地时间正则误截
  if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(s)) {
    const t = Date.parse(s);
    if (Number.isFinite(t)) return Math.floor(t / 1000);
  }
  const m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    // 页面日期按北京墙钟口径解析；分量非法（如时 25）返回 null，不做进位滚动
    return unixFromBjParts(
      Number(m[1]), Number(m[2]), Number(m[3]),
      Number(m[4] ?? 0), Number(m[5] ?? 0), Number(m[6] ?? 0),
    );
  }
  const t = Date.parse(s);
  return Number.isFinite(t) ? Math.floor(t / 1000) : null;
}

/** 读取某公司某栏目下现有内容：identityKey → id（用于 new/updated 判定） */
async function loadExistingContents(
  db: Db,
  companyId: number,
  sectionKey: string,
): Promise<Map<string, number>> {
  const rows = await db
    .select({ id: contents.id, identityKey: contents.identityKey })
    .from(contents)
    .where(and(eq(contents.companyId, companyId), eq(contents.sectionKey, sectionKey)));
  return new Map(rows.map((r) => [r.identityKey, r.id]));
}

/** 内容 upsert（导出供集成冒烟测试使用） */
export async function upsertContent(db: Db, c: PendingContent, now: number): Promise<void> {
  await db
    .insert(contents)
    .values({
      companyId: c.companyId,
      contentType: c.contentType,
      sectionKey: c.sectionKey,
      identityKey: c.identityKey,
      sourceId: c.sourceId,
      categoryId: c.categoryId, // 栏目绑定分类（内容栏目建树在 buildTargets）
      title: c.title,
      summary: c.summary,
      body: c.body,
      bodyHtml: c.bodyHtml,
      author: c.author,
      publishedAt: c.publishedAt,
      detailUrl: c.detailUrl,
      listUrl: c.listUrl,
      row: c.row,
      status: 'active',
      firstSeenAt: now,
      lastSeenAt: now,
      missingSince: null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [contents.companyId, contents.identityKey, contents.sectionKey],
      set: {
        contentType: c.contentType,
        sourceId: c.sourceId,
        categoryId: c.categoryId, // 冲突时一并回写（重跑即回填历史行的 category_id）
        title: c.title,
        summary: c.summary,
        body: c.body,
      bodyHtml: c.bodyHtml,
        author: c.author,
        publishedAt: c.publishedAt,
        detailUrl: c.detailUrl,
        listUrl: c.listUrl,
        row: c.row,
        status: 'active',
        lastSeenAt: now,
        missingSince: null,
        updatedAt: now,
      },
    });
}

/**
 * 内容软删除（与产品同口径）：连续 2 轮缺失才下架——
 * 本轮未见到的在线内容：首次 → missingSince=now 仍 active；再次 → removed。
 */
export async function softDeleteMissingContents(
  db: Db,
  companyId: number,
  sectionKey: string,
  seenKeys: Set<string>,
  now: number,
): Promise<number> {
  const rows = await db
    .select({ id: contents.id, identityKey: contents.identityKey, missingSince: contents.missingSince })
    .from(contents)
    .where(
      and(
        eq(contents.companyId, companyId),
        eq(contents.sectionKey, sectionKey),
        eq(contents.status, 'active'),
      ),
    );
  let removed = 0;
  for (const r of rows) {
    if (seenKeys.has(r.identityKey)) continue;
    if (r.missingSince == null) {
      await db.update(contents).set({ missingSince: now, updatedAt: now }).where(eq(contents.id, r.id));
    } else {
      await db
        .update(contents)
        .set({ status: 'removed', missingSince: null, updatedAt: now })
        .where(eq(contents.id, r.id));
      removed++;
    }
  }
  return removed;
}
