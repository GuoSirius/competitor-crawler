import yaml from 'yaml';
import { fetchPage, type RenderMode } from '../fetch/page.js';
import { saveSiteConfig } from '../config/loader.js';
import { chat } from '../llm/client.js';
import { Progress } from '../util/progress.js';
import type { SiteConfig } from '../config/types.js';

export interface GenSiteOpts {
  domain: string;
  listUrl: string;
  detailUrl?: string;
  companyKey?: string;
  render?: string;
  notes?: string;
}

const SYSTEM_PROMPT = `你是竞品爬虫的站点适配器配置生成器。根据提供的网页 HTML，输出一份 YAML 配置，结构严格如下：

domain: <域名>
startUrl: <列表页URL>
listTraversal:
  strategy: pagination-html | pagination-api | scroll-api | model-generic
  nextSelector: <翻页按钮 CSS 选择器，pagination 类必填>
  maxPages: 50
  fallbackToUi: true
parseList:
  itemSelector: <每个产品条目容器的 CSS 选择器>
  fields:
    detailUrl: { sel: <a 标签选择器>, attr: href }
    name: { sel: <名称选择器>, text: true }
parseDetail:
  fields:
    name: { sel: <名称选择器>, text: true }
    cloneNumber: { sel: <克隆号选择器>, text: true }
    applications: { sel: <应用 li 选择器>, list: true }
    specs:
      sel: <规格行选择器>
      list: true
      map:
        spec: { sel: <规格名选择器>, text: true }
        priceNow: { sel: <现价选择器>, text: true }
    introMedia:
      sel: <介绍图/文选择器>
      list: true
      map:
        image: { sel: img, attr: src }
        description: { sel: <描述选择器>, text: true }
  captureRest: true

字段抽取规范（FieldSpec）三种取值：
1) 取文本：不写 attr（或 text: true）
2) 取属性值：attr: "href" / "src"
3) 取文本/属性中的一段：regex: '...'（优先第1捕获组）
另支持 list（收集数组）/ map（嵌套对象）。

只输出 YAML，不要解释。选择器用最可能的值，用户会自行微调验证。`;

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

function extractYaml(text: string): string {
  const fenced = text.match(/```yaml\s*([\s\S]*?)```/i) ?? text.match(/```\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : text).trim();
}

function parseYamlConfig(text: string, opts: GenSiteOpts): SiteConfig {
  const cfg = yaml.parse(extractYaml(text)) as SiteConfig;
  if (!cfg?.parseList?.itemSelector || !cfg?.parseList?.fields?.detailUrl) {
    throw new Error('模型产出缺少必要的 parseList（itemSelector / fields.detailUrl），请检查页面 HTML 或重试');
  }
  // 补全关键字段，保证产出可直接被 probe / crawl 消费
  cfg.domain = opts.domain;
  cfg.startUrl = opts.listUrl;
  // 归属公司：优先用用户传入的 companyKey；否则保留模型可能写出的 company
  cfg.company = opts.companyKey ?? cfg.company;
  cfg.listTraversal = cfg.listTraversal ?? { strategy: 'pagination-html', maxPages: 50, fallbackToUi: true };
  cfg.parseDetail = cfg.parseDetail ?? { fields: {}, captureRest: true };
  return cfg;
}
