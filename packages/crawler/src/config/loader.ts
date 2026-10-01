import fs from 'node:fs';
import path from 'node:path';
import yaml from 'yaml';
import { repoRoot } from '@competitor-crawler/shared';
import type { RenderMode } from '../fetch/page.js';
import type { ListTraversalConfig, ResolvedSection, SectionConfig, SiteConfig } from './types.js';

// 仓库根统一由 shared/src/paths.ts 提供（避免各处重复上溯算错层级）
const sitesDir = path.join(repoRoot, 'config', 'sites');
// 代码型适配器目录（对 YAML 的**加性补充**，不是替代；见 docs/05 §5.3）
const adaptersDir = path.join(repoRoot, 'packages', 'crawler', 'src', 'adapters');

/**
 * 域名安全校验（docs/16 S3）：仅允许 字母/数字/./-_，
 * 拒绝路径分隔符（/ \）、盘符（:）与「..」，杜绝 path.join 路径穿越
 * （如 `--domain ../../model` 覆盖 config/model.yaml）。CLI 与 web 两侧入口统一走这里。
 */
function assertSafeDomain(domain: string): string {
  if (!/^[A-Za-z0-9._-]+$/.test(domain) || domain.includes('..')) {
    throw new Error(`非法域名: "${domain}"（仅允许 字母/数字/./-_，且不含 .. 与路径分隔符）`);
  }
  return domain;
}

/** 站点配置文件路径：config/sites/<domain>.yaml */
export function siteConfigPath(domain: string): string {
  return path.join(sitesDir, `${assertSafeDomain(domain)}.yaml`);
}

/** 代码型适配器路径：packages/crawler/src/adapters/<domain>.ts */
export function adapterPath(domain: string): string {
  return path.join(adaptersDir, `${assertSafeDomain(domain)}.ts`);
}

/**
 * 某站点是否存在「代码型适配器」。
 *
 * **加性、不替换（docs/05 §5.3）**：代码适配器只提供 YAML 表达不了的**可选钩子**
 * （如过 WAF 的 preflight、需 JS 计算的分页、解析后补字段），YAML 始终是主力与真相源。
 * 二者**可以共存**：共存时先按 YAML 解析，再用适配器钩子补齐缺口；
 * 某站点没有适配器文件时，行为与「没有这套机制」完全一致（零回归）。
 */
export function hasCodeAdapter(domain: string): boolean {
  return fs.existsSync(adapterPath(domain));
}

/**
 * 扫描 config/sites 下全部站点配置（排除 `_template*` 模板），返回域名数组（升序）。
 * 作为「config 目录即爬取范围真相源」时的站点清单。
 */
export function listSiteConfigs(): string[] {
  if (!fs.existsSync(sitesDir)) return [];
  return fs
    .readdirSync(sitesDir)
    .filter((f) => f.toLowerCase().endsWith('.yaml') && !f.startsWith('_'))
    .map((f) => f.replace(/\.yaml$/i, ''))
    .sort();
}

/** 读取并解析站点配置；不存在时给出明确提示（引导先用 gen-site 生成） */
export function loadSiteConfig(domain: string): SiteConfig {
  const p = siteConfigPath(domain);
  if (!fs.existsSync(p)) {
    throw new Error(`未找到站点配置: ${p}（可先执行 pnpm gen-site 生成）`);
  }
  return yaml.parse(fs.readFileSync(p, 'utf-8')) as SiteConfig;
}

/** 写出站点配置（gen-site 调用）；header 为可选的文件头注释（如 gen-site 回验 TODO 提醒） */
export function saveSiteConfig(domain: string, cfg: SiteConfig, header?: string): string {
  const p = siteConfigPath(domain);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const body = yaml.stringify(cfg);
  fs.writeFileSync(p, header ? header + body : body, 'utf-8');
  return p;
}

/** maxPages 硬兜底（YAML / CLI 都未显式配置时的防呆上限，见 traverseList「显式意图放行」） */
export const DEFAULT_MAX_PAGES = 1000;

const DEFAULT_TRAVERSAL: ListTraversalConfig = { strategy: 'pagination-html', maxPages: DEFAULT_MAX_PAGES, fallbackToUi: true };

/** 站点币种缺省值 */
const DEFAULT_CURRENCY = 'CNY';

/**
 * listTraversal **字段级合并**：section 显式值优先，未写的字段逐个回退顶层默认。
 * 与渲染模式的逐字段回退链同哲学——section 只覆盖自己关心的字段
 * （如只覆盖 maxPages，strategy/nextSelector 仍继承顶层）。
 */
function mergeTraversal(s: ListTraversalConfig | undefined, top: ListTraversalConfig): ListTraversalConfig {
  if (!s) return top;
  return {
    strategy: s.strategy ?? top.strategy,
    nextSelector: s.nextSelector ?? top.nextSelector,
    maxPages: s.maxPages ?? top.maxPages,
    fallbackToUi: s.fallbackToUi ?? top.fallbackToUi,
    urlTemplate: s.urlTemplate ?? top.urlTemplate,
    pageStart: s.pageStart ?? top.pageStart,
    pageEnd: s.pageEnd ?? top.pageEnd,
    offset: s.offset ?? top.offset,
    limit: s.limit ?? top.limit,
  };
}

/** CLI 分页/条数参数（页面级覆盖，全部可选；显式传入时覆盖 YAML，--pages 除外——与 YAML 取小） */
export interface CliTraversalOpts {
  /** CLI --page-start：起始页码 */
  pageStart?: number;
  /** CLI --page-end：终止页码（闭区间） */
  pageEnd?: number;
  /** CLI --pages：最多翻页数（与 YAML maxPages **取小**，安全护栏语义） */
  pages?: number;
  /** CLI --offset：每页条目起始偏移 */
  offset?: number;
  /** CLI --per-page：每页最多取条目数（对应 YAML listTraversal.limit） */
  perPage?: number;
}

/** 最终生效的翻页/条目控制参数（YAML 字段级合并后再叠 CLI 覆盖） */
export interface TraversalLimits {
  /** 起始页码（默认 1） */
  pageStart: number;
  /** 终止页码（闭区间；undefined = 不限）。仅 pagination-url 生效 */
  pageEnd?: number;
  /** 最多翻页数（含首页） */
  maxPages: number;
  /** 每页条目起始偏移（≥0） */
  offset: number;
  /** 每页最多取条目数（undefined = 取到页尾） */
  perPage?: number;
  /**
   * 单页抓取失败重试次数（仅 pagination-url 生效）。
   * 默认 1：失败 1 次即跳过该页（记入缺失页）；0 = 不重试；2 = 最多重试 2 次。
   */
  listRetry: number;
}

/**
 * 计算「最终生效」的翻页/条目控制：section/顶层字段级合并（resolveSections 已做）后的
 * traversal 配置，再叠加 CLI 显式覆盖。
 *
 * 覆盖规则：
 * - pageStart / pageEnd / offset / perPage：CLI 显式传入 → **覆盖** YAML（调试意图优先）；
 * - pages（maxPages）：CLI 与 YAML **取小**——防翻页失控是安全护栏，不是意图指定。
 */
export function resolveTraversalLimits(t: ListTraversalConfig, cli?: CliTraversalOpts): TraversalLimits {
  const yamlMax = t.maxPages ?? DEFAULT_MAX_PAGES;
  return {
    pageStart: cli?.pageStart ?? t.pageStart ?? 1,
    pageEnd: cli?.pageEnd ?? t.pageEnd,
    maxPages: cli?.pages !== undefined ? Math.min(cli.pages, yamlMax) : yamlMax,
    offset: Math.max(0, cli?.offset ?? t.offset ?? 0),
    perPage: cli?.perPage ?? t.limit,
    listRetry: Math.max(0, t.listRetry ?? 1),
  };
}

/** 每页条目截取（offset 起连取 perPage 条）；无需截取时原样返回 */
export function slicePageItems<T>(items: T[], limits: Pick<TraversalLimits, 'offset' | 'perPage'>): T[] {
  if (limits.offset <= 0 && limits.perPage === undefined) return items;
  return items.slice(limits.offset, limits.perPage !== undefined ? limits.offset + limits.perPage : undefined);
}

/**
 * 推断栏目的品类面包屑：section.categoryPath > 顶层 categoryPath > section.category 单层级 > 顶层 category 单层级。
 * 返回从根到本栏目的各层级名数组（产品线由 buildTargets/probe 单独负责挂到最顶层）。
 */
function inferCategoryPath(s: SectionConfig, cfg: SiteConfig): string[] | undefined {
  if (s.categoryPath && s.categoryPath.length) return s.categoryPath;
  if (cfg.categoryPath && cfg.categoryPath.length) return cfg.categoryPath;
  if (s.category) return [s.category];
  if (cfg.category) return [cfg.category];
  return undefined;
}

/**
 * 把站点配置归一化为「栏目规则数组」，屏蔽单规则 / 多规则两种写法的差异。
 *
 * - 多规则（cfg.sections 非空）：逐 section 合并顶层默认值；key 缺省补 'default'。
 * - 单规则（无 sections）：把顶层 startUrl + parseList + parseDetail 包成 key='default' 的单个 section，
 *   保证旧配置与 gen-site 产出零改动即可继续使用。
 *
 * 消费方（probe / crawl）统一遍历返回值即可，无需再判断写法。
 */
export function resolveSections(cfg: SiteConfig): ResolvedSection[] {
  const topTraversal = cfg.listTraversal ?? DEFAULT_TRAVERSAL;
  const topDetail = cfg.parseDetail ?? { fields: {}, captureRest: true };
  const topStartUrls = cfg.startUrl ? [cfg.startUrl] : [];
  const currency = cfg.currency ?? DEFAULT_CURRENCY;
  // 采集内容类型路由：section.contentType → 顶层默认 → 'products'（产品管线）
  const topContentType = cfg.contentType ?? cfg.collects ?? 'products';

  if (cfg.sections && cfg.sections.length > 0) {
    return cfg.sections.map((s, i) => {
      if (!s.parseList && !cfg.parseList) {
        throw new Error(`sections[${i}] (key=${s.key || '(未命名)'}) 缺少 parseList，且顶层未提供默认 parseList`);
      }
      return {
        key: s.key || 'default',
        contentType: s.contentType ?? s.collects ?? topContentType,
        category: s.category,
        categoryPath: inferCategoryPath(s, cfg),
        categoryFromPage: s.categoryFromPage ?? cfg.categoryFromPage,
        productLine: s.productLine ?? cfg.productLine,
        currency,
        startUrls: s.startUrls && s.startUrls.length > 0 ? s.startUrls : topStartUrls,
        listTraversal: mergeTraversal(s.listTraversal, topTraversal),
        // 上面的前置校验保证二者至少有一个存在
        parseList: (s.parseList ?? cfg.parseList)!,
        parseDetail: s.parseDetail ?? topDetail,
        listOnly: s.listOnly,
        match: s.match,
        // 渲染模式合并：section 显式值优先，否则继承站点级（render 已含站点顶层；renderList/renderDetail 同理）
        render: s.render ?? cfg.render,
        renderList: s.renderList ?? cfg.renderList,
        renderDetail: s.renderDetail ?? cfg.renderDetail,
      };
    });
  }

  if (!cfg.parseList) {
    throw new Error(`站点配置 ${cfg.domain} 缺少 parseList（单规则需写顶层 parseList；多规则请写 sections）`);
  }
  return [
    {
      key: 'default',
      contentType: topContentType,
      category: cfg.category,
      categoryPath: inferCategoryPath({ category: cfg.category, categoryPath: cfg.categoryPath } as SectionConfig, cfg),
      categoryFromPage: cfg.categoryFromPage,
      productLine: cfg.productLine,
      currency,
      startUrls: topStartUrls,
      listTraversal: topTraversal,
      parseList: cfg.parseList,
      parseDetail: topDetail,
      listOnly: cfg.listOnly,
      // 单规则站点：渲染模式直接取站点级（无 section 覆盖）
      render: cfg.render,
      renderList: cfg.renderList,
      renderDetail: cfg.renderDetail,
    },
  ];
}

/**
 * 列表页最终渲染模式（Hybrid 站点支持）：renderList > render > 调用方回退值。
 * 调用方传入站点级 mode（CLI --render > YAML render > auto）作为最终兜底。
 */
export function listRenderMode(
  s: Pick<ResolvedSection, 'render' | 'renderList' | 'renderDetail'>,
  fallback: RenderMode,
): RenderMode {
  return s.renderList ?? s.render ?? fallback;
}

/**
 * 详情页最终渲染模式（Hybrid 站点支持）：renderDetail > render > 调用方回退值。
 * 与 listRenderMode 对称，仅把 renderList 换成 renderDetail，覆盖「列表/详情渲染不一致」站点。
 */
export function detailRenderMode(
  s: Pick<ResolvedSection, 'render' | 'renderList' | 'renderDetail'>,
  fallback: RenderMode,
): RenderMode {
  return s.renderDetail ?? s.render ?? fallback;
}

/**
 * 按 URL 选栏目：用于「拿到一个未打 sectionKey 的 URL」时反查所属 section。
 * @param kind 'list' 匹配 match.listUrlIncludes；'detail' 匹配 match.detailUrlIncludes。
 * @returns 命中的 section（多个命中取第一个）；无命中返回 undefined（调用方自行兜底）。
 */
export function pickSectionByUrl(
  sections: ResolvedSection[],
  url: string,
  kind: 'list' | 'detail' = 'detail',
): ResolvedSection | undefined {
  const key = kind === 'list' ? 'listUrlIncludes' : 'detailUrlIncludes';
  return sections.find((s) => s.match?.[key]?.some((frag) => frag && url.includes(frag)));
}
