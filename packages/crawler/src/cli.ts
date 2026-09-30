import path from 'node:path';
import { dataDir } from '@competitor-crawler/shared';
import { xlsxToSeeds } from './seed/xlsxToSeeds.js';
import { loadSeeds } from './seed/loadSeeds.js';
import { probe } from './commands/probe.js';
import { genSite } from './commands/genSite.js';
import { genSiteBatch } from './commands/genSiteBatch.js';
import { genSiteTemplate } from './commands/genSiteTemplate.js';
import { crawl } from './commands/crawl.js';
import { backfill } from './commands/backfill.js';
import { report } from './commands/report.js';
import { startDaemon, runScheduledCrawl } from './scheduler.js';
import { parseFlags } from './util/args.js';

// 路径统一由 shared/src/paths.ts 提供（不再本地上溯算层级）
const seedsJson = path.join(dataDir, 'seeds', 'seeds.json');

async function main() {
  const cmd = process.argv[2];
  const flags = parseFlags(process.argv.slice(3));

  if (cmd === 'seed') {
    const out = await xlsxToSeeds();
    console.log(`[seed] 抽取完成 -> ${out}`);
    const result = await loadSeeds(seedsJson);
    console.log('[seed] 同步完成:', result);
  } else if (cmd === 'probe') {
    const domain = flags.domain;
    if (typeof domain !== 'string') throw new Error('probe 需要 --domain <domain>');
    await probe({
      domain,
      listUrl: typeof flags['list-url'] === 'string' ? flags['list-url'] : undefined,
      render: typeof flags.render === 'string' ? flags.render : undefined,
      sample: typeof flags.sample === 'string' ? Number(flags.sample) : undefined,
      section: typeof flags.section === 'string' ? flags.section : undefined,
      detail: typeof flags.detail === 'string' ? Number(flags.detail) : undefined,
    });
  } else if (cmd === 'gen-site') {
    const domain = flags.domain;
    if (typeof domain !== 'string') throw new Error('gen-site 需要 --domain <domain>');
    // --list-url 可选：省略时回退到已存在 YAML 的 startUrl（桩文件填充场景）
    const listUrl = typeof flags['list-url'] === 'string' ? flags['list-url'] : undefined;
    await genSite({
      domain,
      listUrl,
      detailUrl: typeof flags['detail-url'] === 'string' ? flags['detail-url'] : undefined,
      companyKey: typeof flags['company-key'] === 'string' ? flags['company-key'] : undefined,
      competitorType: typeof flags['competitor-type'] === 'string' ? flags['competitor-type'] : undefined,
      role: typeof flags.role === 'string' ? flags.role : undefined,
      currency: typeof flags.currency === 'string' ? flags.currency : undefined,
      render: typeof flags.render === 'string' ? flags.render : undefined,
      notes: typeof flags.notes === 'string' ? flags.notes : undefined,
    });
  } else if (cmd === 'backfill') {
    const column = flags.column;
    const rowKey = flags['row-key'];
    if (typeof column !== 'string') throw new Error('backfill 需要 --column <列名>');
    if (typeof rowKey !== 'string') throw new Error('backfill 需要 --row-key <row中的key>');
    await backfill({
      column,
      rowKey,
      dry: flags.dry === true || flags.dry === 'true',
    });
  } else if (cmd === 'gen-site-batch') {
    await genSiteBatch({
      file: typeof flags.file === 'string' ? flags.file : undefined,
      dryRun: flags['dry-run'] === true || flags['dry-run'] === 'true',
    });
  } else if (cmd === 'gen-site-template') {
    const saved = await genSiteTemplate(typeof flags.file === 'string' ? flags.file : undefined);
    console.log(`[gen-site-template] 已生成模板 -> ${saved}`);
  } else if (cmd === 'crawl') {
    // 数值型 flag 解析：非法/缺省 → undefined（交给 YAML 默认值）
    const num = (k: string): number | undefined => {
      const raw = flags[k];
      if (typeof raw !== 'string' || raw === '' || !Number.isFinite(Number(raw))) return undefined;
      return Number(raw);
    };
    await crawl({
      site: typeof flags.site === 'string' ? flags.site : undefined,
      dryRun: flags['dry-run'] === true || flags['dry-run'] === 'true',
      pages: num('pages'),
      pageStart: num('page-start'),
      pageEnd: num('page-end'),
      offset: num('offset'),
      perPage: num('per-page'),
      limit: num('limit'),
      render: typeof flags.render === 'string' ? flags.render : undefined,
      source: typeof flags.source === 'string' ? (flags.source as 'config' | 'seeds') : undefined,
      section: typeof flags.section === 'string' ? flags.section : undefined,
      category: typeof flags.category === 'string' ? flags.category : undefined,
      productLine: typeof flags['product-line'] === 'string' ? flags['product-line'] : undefined,
      // --resume：不带值（true）= 自动取 .crawl-state/ 最新断点；带值 = 指定断点文件
      resume: flags.resume === true ? '' : typeof flags.resume === 'string' ? flags.resume : undefined,
    });
  } else if (cmd === 'report') {
    await report({
      excel: flags.excel === true || flags.excel === 'true',
      charts: flags.charts === true || flags.charts === 'true',
      company: typeof flags.company === 'string' ? flags.company : undefined,
      category: typeof flags.category === 'string' ? flags.category : undefined,
      out: typeof flags.out === 'string' ? flags.out : undefined,
    });
  } else if (cmd === 'schedule') {
    const source = typeof flags.source === 'string' ? (flags.source as 'config' | 'seeds') : 'config';
    if (flags.daemon === true || flags.daemon === 'true') {
      // 默认季度首月 1 日 03:00 触发（与 docs/06.4 一致）
      const stop = startDaemon(
        { months: [1, 4, 7, 10], daysOfMonth: [1], hours: [3], minutes: [0] },
        { source },
      );
      console.log('[schedule] 守护进程已启动，按季度首月 1 日 03:00 触发（Ctrl+C 退出）');
      process.on('SIGINT', () => {
        stop();
        process.exit(0);
      });
    } else {
      await runScheduledCrawl({ source });
    }
  } else {
    console.log('用法: tsx src/cli.ts <seed|probe|gen-site|gen-site-batch|gen-site-template|backfill|crawl|schedule|report> [--flags]');
    console.log('  crawl 额外参数: --source config|seeds (默认 config；seeds 为 Excel 初始化导入后的一次性场景) --site <d[,d2..]> --section <key> --category <名> --product-line <线> --pages <n> --limit <n> --render ssr|spa|auto --dry-run');
    console.log('  crawl 分页/条数（覆盖 YAML listTraversal，显式传入生效）: --page-start <n> 起始页 / --page-end <n> 终止页(闭区间，仅 pagination-url) / --offset <n> 每页条目偏移 / --per-page <n> 每页最多条数；--pages 与 YAML maxPages 取小（安全护栏）');
    console.log('  crawl 断点续跑（docs/16 规模化兜底）: --resume [<文件>] 中断后续跑——不带值自动取最新断点；已完成栏目跳过、已落库详情不重抓。运行中断时会打印续跑命令');
    console.log('  schedule 额外参数: --daemon（常驻守护，按季度首月 1 日 03:00 触发，北京时间口径）');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
