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
import { runValidate, runFieldDocs } from './commands/validate.js';
import { sweep } from './commands/sweep.js';
import { startDaemon, runScheduledCrawl } from './scheduler.js';
import { parseFlags, normalizeAliases } from './util/args.js';
import { isRenderMode, RENDER_MODES } from './config/types.js';

// 路径统一由 shared/src/paths.ts 提供（不再本地上溯算层级）
const seedsJson = path.join(dataDir, 'seeds', 'seeds.json');

async function main() {
  const cmd = process.argv[2];
  // 别名归一化（--domain/--max-pages/--page-offset/--page-size；旧名仍可用）
  const flags = normalizeAliases(parseFlags(process.argv.slice(3)));

  // --help / -h：只看用法，不执行
  if (flags.help === true || flags.h === true) {
    printHelp(cmd);
    return;
  }

  // --render 取值守卫：非法值会静默退化成 auto（排查成本高），入口直接挡掉。
  if (typeof flags.render === 'string' && !isRenderMode(flags.render)) {
    console.error(`[cli] --render 取值无效：'${flags.render}'（可选：${RENDER_MODES.join(' / ')}）`);
    if (flags.render === 'spa') console.error('      旧名 spa 已于 2026-10-05 更名为 browser，请改用 --render browser');
    process.exit(1);
  }

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
      // --domain（--site 别名）统一为站点参数；内部字段名保持 site（断点/CrawlState 语义不变）
      site: typeof flags.domain === 'string' ? flags.domain : undefined,
      dryRun: flags['dry-run'] === true || flags['dry-run'] === 'true',
      pages: num('max-pages'),
      pageStart: num('page-start'),
      pageEnd: num('page-end'),
      offset: num('page-offset'),
      perPage: num('page-size'),
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
  } else if (cmd === 'validate') {
    // 校验全部（或 --site 指定）站点字段配置；存在 error 级问题时退出码置 1（CI 门禁用）
    const errs = runValidate({ domain: typeof flags.domain === 'string' ? flags.domain : undefined });
    if (errs > 0) process.exitCode = 1;
  } else if (cmd === 'field-docs') {
    // --domain/--site 指定站点时，额外打印该站点「YAML 字段 → 落库列」对照
    runFieldDocs({ domain: typeof flags.domain === 'string' ? flags.domain : undefined });
  } else if (cmd === 'sweep') {
    // 批量反爬复探（docs/14 C 类）：不依赖站点 YAML，只测「可达/挑战页/内容量」
    await sweep(flags);
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
    printHelp(cmd);
  }
}

/**
 * 用法输出（分组打印，替代原来一长串 usage 行）。
 * `cli <cmd> --help` 与不带参数、未知命令都会走到这里；已知命令则只打印该命令的参数。
 */
function printHelp(cmd?: string): void {
  const known = new Set([
    'seed', 'probe', 'gen-site', 'gen-site-batch', 'gen-site-template',
    'backfill', 'crawl', 'validate', 'field-docs', 'schedule', 'report', 'sweep',
  ]);
  const all = cmd === undefined || cmd === 'help' || !known.has(cmd);
  if (all) {
    console.log('用法: pnpm <cmd> [--flags]\n');
    console.log('常用:');
    console.log('  crawl               抓全站（config/sites/*.yaml 为范围真相源）');
    console.log('  validate            校验站点字段配置（存在 error 退出码 1，CI 门禁用）');
    console.log('  probe --domain x    列表/详情结构探针（不落库）');
    console.log('  gen-site --domain x 生成站点 YAML 草稿');
    console.log('  report              跑爬取报表（默认控制台；--excel --charts 出文件）');
    console.log('  schedule            定时抓取（--daemon 常驻；默认跑一次）');
    console.log('  seed                从 Excel 提取种子并入库');
    console.log('  field-docs          打印内建字段字典');
  }
  console.log('\n通用参数（crawl / probe / validate / gen-site 均支持，站点标识统一 --domain）：');
  console.log('  --domain <d>        站点域名（等价旧名 --site，仍可用）');
  console.log('  --section <key>     只跑指定栏目（crawl / probe）');
  console.log('  --render ssr|browser|auto  渲染模式覆盖（crawl / probe / gen-site）');
  console.log('  --dry-run           解析不落库（crawl）');
  if (all || cmd === 'crawl') {
    console.log('\ncrawl 翻页 / 条数（覆盖 YAML listTraversal，显式传入生效）：');
    console.log('  --max-pages <n>     最多抓几页（数量护栏，与 YAML maxPages 取小；旧名 --pages 可用）');
    console.log('  --page-start <n>    从第几页开始（页码起点）');
    console.log('  --page-end <n>      到第几页（闭区间，仅 pagination-url）');
    console.log('  --page-offset <n>   每页条目起始偏移（旧名 --offset）');
    console.log('  --page-size <n>     每页最多条数（旧名 --per-page；与总条数 --limit 不同）');
    console.log('  --limit <n>         详情阶段总条目上限');
    console.log('  --resume [<文件>]   断点续跑（不带值取 .crawl-state/ 最新断点）');
    console.log('  --source config|seeds  爬取范围来源（默认 config）');
    console.log('  --category <名> / --product-line <线>  按品类/产品线过滤');
  }
  if (all || cmd === 'probe') {
    console.log('\nprobe：--domain <d>（必填） --sample <n> --detail <n> --list-url <url> --section <key> --render <mode>');
  }
  if (all || cmd === 'gen-site') {
    console.log('\ngen-site：--domain <d>（必填） --list-url <url> --detail-url <url> --company-key <k> --competitor-type <t> --role <r> --currency <c> --render <mode> --notes <文本>');
  }
  if (all || cmd === 'validate') {
    console.log('\nvalidate：--domain <d>（省略则校验 config/sites 下全部站点）；存在 error 退出码 1');
  }
  if (all || cmd === 'schedule') {
    console.log('\nschedule：--daemon（常驻守护，按季度首月 1 日 03:00 触发，北京时间口径）');
  }
  if (all) console.log('\n提示：`pnpm <cmd> --help` 只打印该命令的参数。');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
