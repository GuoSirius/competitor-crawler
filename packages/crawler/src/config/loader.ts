import fs from 'node:fs';
import path from 'node:path';
import yaml from 'yaml';
import { repoRoot } from '@competitor-crawler/shared';
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

/** 写出站点配置（gen-site 调用） */
export function saveSiteConfig(domain: string, cfg: SiteConfig): string {
  const p = siteConfigPath(domain);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, yaml.stringify(cfg), 'utf-8');
  return p;
}

const DEFAULT_TRAVERSAL: ListTraversalConfig = { strategy: 'pagination-html', maxPages: 50, fallbackToUi: true };

/** 站点币种缺省值 */
const DEFAULT_CURRENCY = 'CNY';

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
        listTraversal: s.listTraversal ?? topTraversal,
        // 上面的前置校验保证二者至少有一个存在
        parseList: (s.parseList ?? cfg.parseList)!,
        parseDetail: s.parseDetail ?? topDetail,
        match: s.match,
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
    },
  ];
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
