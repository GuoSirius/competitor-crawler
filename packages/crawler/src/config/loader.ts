import fs from 'node:fs';
import path from 'node:path';
import yaml from 'yaml';
import { repoRoot } from '@competitor-crawler/shared';
import type { ListTraversalConfig, ResolvedSection, SiteConfig } from './types.js';

// 仓库根统一由 shared/src/paths.ts 提供（避免各处重复上溯算错层级）
const sitesDir = path.join(repoRoot, 'config', 'sites');
// 代码型适配器目录（YAML 之外的逃生舱；与 YAML 互斥，见 docs/05）
const adaptersDir = path.join(repoRoot, 'packages', 'crawler', 'src', 'adapters');

/** 站点配置文件路径：config/sites/<domain>.yaml */
export function siteConfigPath(domain: string): string {
  return path.join(sitesDir, `${domain}.yaml`);
}

/** 代码型适配器路径：packages/crawler/src/adapters/<domain>.ts */
export function adapterPath(domain: string): string {
  return path.join(adaptersDir, `${domain}.ts`);
}

/**
 * 某站点是否存在「代码型适配器」（YAML 之外的逃生舱）。
 * 与 YAML 配置**互斥**：两者同时存在视为冲突，crawl 记录并跳过、跑完汇总提示（docs/05、需求①·决策A）。
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

  if (cfg.sections && cfg.sections.length > 0) {
    return cfg.sections.map((s, i) => {
      if (!s.parseList && !cfg.parseList) {
        throw new Error(`sections[${i}] (key=${s.key || '(未命名)'}) 缺少 parseList，且顶层未提供默认 parseList`);
      }
      return {
        key: s.key || 'default',
        category: s.category,
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
