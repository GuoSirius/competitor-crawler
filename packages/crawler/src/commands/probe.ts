import { loadSiteConfig } from '../config/loader.js';
import { fetchPage, type RenderMode } from '../fetch/page.js';
import { parseListWithConfig } from '../adapter/yamlAdapter.js';
import { Progress } from '../util/progress.js';

export interface ProbeOpts {
  domain: string;
  listUrl?: string;
  render?: string;
  sample?: number;
}

/**
 * 单站验证探针：加载该站点的 YAML 适配器，抓取列表页并跑解析，
 * 打印抽取条数与前 N 条样本，便于分析 YAML / 适配器逻辑是否正确。
 * 确认正常后再做大批量 crawl（见用户需求：先验证再采集）。
 */
export async function probe(opts: ProbeOpts): Promise<void> {
  const progress = new Progress();
  const cfg = loadSiteConfig(opts.domain);
  const listUrl = opts.listUrl ?? cfg.startUrl;
  if (!listUrl) {
    throw new Error(`probe 需要 --list-url，或在 config/sites/${opts.domain}.yaml 中写 startUrl`);
  }
  const mode: RenderMode = (opts.render as RenderMode) ?? (cfg.listTraversal.fallbackToUi ? 'auto' : 'ssr');

  progress.update(`[probe] ${opts.domain} 抓取列表页 ${listUrl}`);
  const html = await fetchPage(listUrl, mode, progress);
  progress.update(`[probe] 解析列表页…`);
  const items = parseListWithConfig(html, cfg.parseList);
  progress.done(`[probe] 完成：解析出 ${items.length} 条产品`);

  const sample = opts.sample ?? 5;
  console.log(`\n列表页解析结果（前 ${Math.min(sample, items.length)} / 共 ${items.length} 条）：`);
  for (const it of items.slice(0, sample)) {
    console.log(`  • ${it.name ?? '(无名称)'}  →  ${it.detailUrl || '(无详情链接)'}`);
  }
  if (items.length === 0) {
    console.log('\n⚠️ 未解析到任何条目：请检查 parseList.itemSelector 与 fields 选择器是否匹配页面结构。');
  } else if (items.some((i) => !i.detailUrl)) {
    console.log('\n⚠️ 部分条目缺少 detailUrl：检查 parseList.fields.detailUrl 的 sel/attr 是否取到链接。');
  }
}
