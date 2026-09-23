import { resolveSections, loadSiteConfig } from '../config/loader.js';
import { fetchPage, type RenderMode } from '../fetch/page.js';
import { parseListWithConfig } from '../adapter/yamlAdapter.js';
import { Progress } from '../util/progress.js';

export interface ProbeOpts {
  domain: string;
  listUrl?: string;
  render?: string;
  sample?: number;
  /** 只验证指定栏目（多规则站点）；省略则遍历全部 section */
  section?: string;
}

/**
 * 单站验证探针：加载该站点的 YAML 适配器，抓取列表页并跑解析，
 * 打印抽取条数与前 N 条样本，便于分析 YAML / 适配器逻辑是否正确。
 *
 * 多规则站点（sections）会逐栏目验证：每个 section 用各自的 startUrls + parseList，
 * 并给条目打上 sectionKey，模拟详情阶段的规则选型与去重口径 B。
 * 确认正常后再做大批量 crawl（见用户需求：先验证再采集）。
 */
export async function probe(opts: ProbeOpts): Promise<void> {
  const progress = new Progress();
  const cfg = loadSiteConfig(opts.domain);
  let sections = resolveSections(cfg);

  if (opts.section) {
    const wanted = opts.section;
    sections = sections.filter((s) => s.key === wanted);
    if (sections.length === 0) {
      const all = resolveSections(cfg).map((s) => s.key).join(', ');
      throw new Error(`未找到 section="${wanted}"（该站可用栏目：${all}）`);
    }
  }

  const sample = opts.sample ?? 5;
  let grandTotal = 0;
  let anyMissingDetail = false;

  for (const section of sections) {
    const listUrls = opts.listUrl ? [opts.listUrl] : section.startUrls;
    if (listUrls.length === 0) {
      console.log(`\n⚠️ [section=${section.key}] 无列表页 URL（startUrls 为空且未传 --list-url），跳过。`);
      continue;
    }
    const mode: RenderMode = (opts.render as RenderMode) ?? (section.listTraversal.fallbackToUi ? 'auto' : 'ssr');

    let sectionTotal = 0;
    for (const listUrl of listUrls) {
      progress.update(`[probe] ${opts.domain} [section=${section.key}] 抓取列表页 ${listUrl}`);
      const html = await fetchPage(listUrl, mode, progress);
      progress.update(`[probe] ${opts.domain} [section=${section.key}] 解析列表页…`);
      const items = parseListWithConfig(html, section.parseList, section.key);

      sectionTotal += items.length;
      grandTotal += items.length;
      if (items.some((i) => !i.detailUrl)) anyMissingDetail = true;

      console.log(`\n[section=${section.key}] ${listUrl}`);
      console.log(`  解析出 ${items.length} 条；样本（前 ${Math.min(sample, items.length)} 条）：`);
      for (const it of items.slice(0, sample)) {
        console.log(`    • [${it.sectionKey}] ${it.name ?? '(无名称)'}  →  ${it.detailUrl || '(无详情链接)'}`);
      }
    }
    if (sectionTotal === 0) {
      console.log(`\n⚠️ [section=${section.key}] 未解析到任何条目：检查该 section 的 parseList.itemSelector 与 fields 选择器。`);
    }
  }

  progress.done(`[probe] 完成：共 ${sections.length} 个栏目，解析出 ${grandTotal} 条产品`);
  if (grandTotal === 0) {
    console.log('\n⚠️ 全部栏目均未解析到条目：请检查 itemSelector 与 fields 选择器是否匹配页面结构。');
  } else if (anyMissingDetail) {
    console.log('\n⚠️ 部分条目缺少 detailUrl：检查 parseList.fields.detailUrl 的 sel/attr 是否取到链接。');
  }
}
