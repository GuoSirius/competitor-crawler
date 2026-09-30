import yaml from 'yaml';
import { fetchPage, type RenderMode } from '../fetch/page.js';
import { saveSiteConfig } from '../config/loader.js';
import { chat } from '../llm/client.js';
import { loadPrompt } from '../llm/prompts.js';
import { Progress } from '../util/progress.js';
import type { SiteConfig } from '../config/types.js';

export interface GenSiteOpts {
  domain: string;
  listUrl: string;
  detailUrl?: string;
  companyKey?: string;
  competitorType?: string;
  role?: string;
  render?: string;
  notes?: string;
}

const SYSTEM_PROMPT = loadPrompt('gen-site');

/**
 * 模型驱动的站点配置生成：给定站点信息（用户评估后提供），
 * 抓取页面 → 调模型（MODEL_MODE，temp=0）→ 产出 YAML → 写盘 → 提示用 probe 验证。
 * 用户直接拿产出做测试/验证/微调，快速完成站点新增或更新。
 */
export async function genSite(opts: GenSiteOpts): Promise<void> {
  const progress = new Progress();
  const mode: RenderMode = (opts.render as RenderMode) ?? 'auto';

  progress.update(`[gen-site] ${opts.domain} 抓取列表页 ${opts.listUrl}`);
  const listHtml = await fetchPage(opts.listUrl, mode, progress);
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
    `列表页 URL：${opts.listUrl}`,
    opts.notes ? `补充说明：${opts.notes}` : '',
    '',
    '===== 列表页 HTML（已截断）=====',
    listHtml.slice(0, 20000),
    opts.detailUrl ? '===== 详情页 HTML（已截断）=====\n' + detailHtml.slice(0, 20000) : '',
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

  const cfg = parseYamlConfig(out, opts);
  const saved = saveSiteConfig(opts.domain, cfg);
  progress.done(`[gen-site] 已写入 ${saved}`);
  console.log(`\n下一步验证：pnpm probe --domain ${opts.domain} --list-url ${opts.listUrl}`);
}

/** 从模型输出中提取 YAML：优先 ```yaml 围栏，其次任意 ``` 围栏，最后整段 */
export function extractYaml(text: string): string {
  const fenced = text.match(/```yaml\s*([\s\S]*?)```/i) ?? text.match(/```\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : text).trim();
}

/** 解析模型产出的 YAML 并补全关键字段（导出供测试；非法产出抛明确错误） */
export function parseYamlConfig(text: string, opts: GenSiteOpts): SiteConfig {
  const cfg = yaml.parse(extractYaml(text)) as SiteConfig;
  if (!cfg?.parseList?.itemSelector || !cfg?.parseList?.fields?.detailUrl) {
    throw new Error('模型产出缺少必要的 parseList（itemSelector / fields.detailUrl），请检查页面 HTML 或重试');
  }
  // 补全关键字段，保证产出可直接被 probe / crawl 消费
  cfg.domain = opts.domain;
  cfg.startUrl = opts.listUrl;
  // 归属公司：优先用用户传入的 companyKey；否则保留模型可能写出的 company
  cfg.company = opts.companyKey ?? cfg.company;
  // 公司属性：用户显式传入时以传入值为准；未传入保留模型产出（通常没有）
  cfg.competitorType = opts.competitorType ?? cfg.competitorType;
  cfg.role = opts.role ?? cfg.role;
  cfg.listTraversal = cfg.listTraversal ?? { strategy: 'pagination-html', maxPages: 50, fallbackToUi: true };
  cfg.parseDetail = cfg.parseDetail ?? { fields: {}, captureRest: true };
  return cfg;
}
