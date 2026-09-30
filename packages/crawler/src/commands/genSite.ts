import yaml from 'yaml';
import { fetchPage, type RenderMode } from '../fetch/page.js';
import { loadSiteConfig, saveSiteConfig } from '../config/loader.js';
import { chat } from '../llm/client.js';
import { loadPrompt } from '../llm/prompts.js';
import { Progress } from '../util/progress.js';
import type { SiteConfig } from '../config/types.js';

export interface GenSiteOpts {
  domain: string;
  /** 列表页 URL；省略时回退到已存在 YAML 的 startUrl（桩文件填充场景：只写 startUrl 即可） */
  listUrl?: string;
  detailUrl?: string;
  companyKey?: string;
  competitorType?: string;
  role?: string;
  currency?: string;
  render?: string;
  notes?: string;
}

const SYSTEM_PROMPT = loadPrompt('gen-site');
const DEFAULT_CURRENCY = 'CNY';

/**
 * 模型驱动的站点配置生成：给定站点信息（用户评估后提供），
 * 抓取页面 → 调模型（MODEL_MODE，temp=0）→ 产出 YAML → 写盘 → 提示用 probe 验证。
 * 用户直接拿产出做测试/验证/微调，快速完成站点新增或更新。
 *
 * 安全合并：若 config/sites/<domain>.yaml 已存在（用户已手写身份字段），模型产出只覆盖解析相关字段，
 * 身份字段按「CLI/Excel 传入 > 模型 > 已存在文件」兜底，避免误删用户手填的 currency/role/company 等。
 */
export async function genSite(opts: GenSiteOpts): Promise<void> {
  const progress = new Progress();
  let existing: SiteConfig | null = null;
  try {
    existing = loadSiteConfig(opts.domain);
  } catch {
    existing = null;
  }

  const mode: RenderMode = (opts.render as RenderMode) ?? (existing?.render as RenderMode) ?? 'auto';

  // 列表页 URL：优先用 --list-url；桩文件填充场景下回退到已存在 YAML 的 startUrl
  const listUrl = opts.listUrl ?? existing?.startUrl;
  if (!listUrl) {
    throw new Error('gen-site 需要 --list-url <url>，或在已存在的 config/sites/<domain>.yaml 中配置 startUrl');
  }

  progress.update(`[gen-site] ${opts.domain} 抓取列表页 ${listUrl}`);
  const listHtml = await fetchPage(listUrl, mode, progress);
  let detailHtml = '';
  if (opts.detailUrl) {
    progress.update(`[gen-site] 抓取详情页 ${opts.detailUrl}`);
    detailHtml = await fetchPage(opts.detailUrl, mode, progress);
  }

  const userMsg = [
    `站点域名：${opts.domain}`,
    opts.companyKey ? `归属公司：${opts.companyKey}` : '',
    opts.competitorType ? `竞品类型：${opts.competitorType}` : '',
    opts.role ? `公司角色：${opts.role}` : '',
    opts.currency ? `币种：${opts.currency}` : '',
    `列表页 URL：${listUrl}`,
    opts.notes ? `补充说明：${opts.notes}` : '',
    '',
    '===== 列表页 HTML（已清洗/截取）=====',
    buildModelHtml(listHtml),
    opts.detailUrl ? '===== 详情页 HTML（已清洗/截取）=====\n' + buildModelHtml(detailHtml) : '',
  ]
    .filter(Boolean)
    .join('\n');

  progress.update(`[gen-site] 调用模型生成 YAML 配置…`);
  const out = await chat(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMsg },
    ],
    { temp: 0 },
  );

  const cfg = parseYamlConfig(out, opts, existing);
  const saved = saveSiteConfig(opts.domain, cfg);
  progress.done(`[gen-site] 已写入 ${saved}`);
  console.log(`\n下一步验证：pnpm probe --domain ${opts.domain} --list-url ${listUrl}`);
}

/** 喂给模型的清洗后 HTML 预算（字符）。清洗已去掉 head/style/script，60K 约覆盖绝大多数列表页全文 */
const MODEL_HTML_BUDGET = 60000;

/**
 * 清洗并截取喂给模型的 HTML（gen-site 专用，导出供测试）。
 *
 * 根因背景（普诺赛案例）：完整页面 110KB+，产品卡在 62KB 处——旧实现 `slice(0, 20000)`
 * 把全部预算花在 head/style/导航上，模型根本看不到商品卡片，只能臆造选择器。
 *
 * 处理两步：
 * ① 去 head/script/style/注释 并压缩空白（head+style 常占原始 HTML 一半以上）；
 * ② 清洗后仍超预算时按「链接密度」选窗口：商品列表区是 <a href> 最密集的区域，
 *    从密度最高的 2KB 块向两侧扩展拼满预算（块边界可能切断标签，模型只需看结构无需闭合）。
 * 若窗口里确实没有商品条目，模型会按 prompt 硬规则输出 NEED_MORE_HTML，调用方给出明确指引。
 */
export function buildModelHtml(html: string, budget = MODEL_HTML_BUDGET): string {
  const cleaned = html
    .replace(/<head[\s\S]*?<\/head>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned.length <= budget) return cleaned;

  const CHUNK = 2048;
  const chunks: string[] = [];
  for (let i = 0; i < cleaned.length; i += CHUNK) chunks.push(cleaned.slice(i, i + CHUNK));
  const score = (s: string): number => (s.match(/<a\s/gi)?.length ?? 0);
  let best = 0;
  for (let i = 1; i < chunks.length; i++) if (score(chunks[i]) > score(chunks[best])) best = i;

  // 从最佳块向两侧扩展拼满预算（unshift 左块 / push 右块，保持文档顺序）
  const picked: string[] = [chunks[best]];
  let used = chunks[best].length;
  for (let step = 1; used < budget; step++) {
    let grew = false;
    const right = chunks[best + step];
    if (right && used + right.length <= budget) {
      picked.push(right);
      used += right.length;
      grew = true;
    }
    const left = chunks[best - step];
    if (left && used + left.length <= budget) {
      picked.unshift(left);
      used += left.length;
      grew = true;
    }
    if (!grew) break;
  }
  return picked.join('');
}

/** 从模型输出中提取 YAML：优先 ```yaml 围栏，其次任意 ``` 围栏，最后整段 */
export function extractYaml(text: string): string {
  const fenced = text.match(/```yaml\s*([\s\S]*?)```/i) ?? text.match(/```\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : text).trim();
}

/** 解析模型产出的 YAML 并补全关键字段（导出供测试；非法产出抛明确错误） */
export function parseYamlConfig(text: string, opts: GenSiteOpts, existing?: SiteConfig | null): SiteConfig {
  const yamlOut = extractYaml(text);
  const cfg = yaml.parse(yamlOut) as SiteConfig;
  if (!cfg?.parseList?.itemSelector || !cfg?.parseList?.fields?.detailUrl) {
    // 模型按 prompt 硬规则「看不到商品条目 → itemSelector: null + NEED_MORE_HTML」时给出针对性指引
    const needMore = /NEED_MORE_HTML/.test(yamlOut);
    throw new Error(
      needMore
        ? '模型反馈清洗截取后的页面 HTML 中看不到商品条目结构（NEED_MORE_HTML）。可尝试：① 换更直接的列表页 URL（含真实产品网格的页面）；② 该站可能需要 spa 渲染（--render spa 重试）。'
        : '模型产出缺少必要的 parseList（itemSelector / fields.detailUrl），请检查页面 HTML 或重试',
    );
  }
  // 补全关键字段，保证产出可直接被 probe / crawl 消费
  cfg.domain = opts.domain;
  // startUrl：CLI --list-url > 已存在 YAML 的 startUrl > 模型产出（最后兜底）。
  // 关键：写回的 startUrl 必须等于 gen-site 实际抓取的入口（opts.listUrl ?? existing.startUrl），
  // 否则 probe/crawl 会抓到与生成时不同的页面；模型产出的 startUrl 仅作缺省兜底。
  cfg.startUrl = opts.listUrl ?? existing?.startUrl ?? cfg.startUrl;
  // 身份字段兜底优先级：CLI/Excel 传入 > 模型产出 > 已存在文件（避免误删用户手填值）
  cfg.company = opts.companyKey ?? cfg.company ?? existing?.company;
  cfg.competitorType = opts.competitorType ?? cfg.competitorType ?? existing?.competitorType;
  cfg.role = opts.role ?? cfg.role ?? existing?.role;
  cfg.currency = opts.currency ?? cfg.currency ?? existing?.currency ?? DEFAULT_CURRENCY;
  // 渲染模式：CLI 传入 > 已存在文件 > 默认 auto；并写回 YAML，供 probe/crawl 统一复用（批量混合 ssr/spa 无需逐站指定）
  cfg.render = (opts.render as RenderMode) ?? (cfg.render as RenderMode) ?? (existing?.render as RenderMode) ?? 'auto';
  cfg.listTraversal = cfg.listTraversal ?? { strategy: 'pagination-html', maxPages: 50, fallbackToUi: true };
  cfg.parseDetail = cfg.parseDetail ?? { fields: {}, captureRest: true };
  return cfg;
}
