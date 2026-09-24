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
    const listUrl = flags['list-url'];
    if (typeof domain !== 'string') throw new Error('gen-site 需要 --domain <domain>');
    if (typeof listUrl !== 'string') throw new Error('gen-site 需要 --list-url <url>');
    await genSite({
      domain,
      listUrl,
      detailUrl: typeof flags['detail-url'] === 'string' ? flags['detail-url'] : undefined,
      companyKey: typeof flags['company-key'] === 'string' ? flags['company-key'] : undefined,
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
    await crawl({
      site: typeof flags.site === 'string' ? flags.site : undefined,
      dryRun: flags['dry-run'] === true || flags['dry-run'] === 'true',
      pages: typeof flags.pages === 'string' ? Number(flags.pages) : undefined,
      limit: typeof flags.limit === 'string' ? Number(flags.limit) : undefined,
      render: typeof flags.render === 'string' ? flags.render : undefined,
      source: typeof flags.source === 'string' ? (flags.source as 'config' | 'seeds') : undefined,
      section: typeof flags.section === 'string' ? flags.section : undefined,
      category: typeof flags.category === 'string' ? flags.category : undefined,
      productLine: typeof flags['product-line'] === 'string' ? flags['product-line'] : undefined,
    });
  } else if (cmd === 'report') {
    await report({
      excel: flags.excel === true || flags.excel === 'true',
      charts: flags.charts === true || flags.charts === 'true',
      company: typeof flags.company === 'string' ? flags.company : undefined,
      category: typeof flags.category === 'string' ? flags.category : undefined,
      out: typeof flags.out === 'string' ? flags.out : undefined,
    });
  } else {
    console.log('用法: tsx src/cli.ts <seed|probe|gen-site|gen-site-batch|gen-site-template|backfill|crawl|report> [--flags]');
    console.log('  crawl 额外参数: --source config|seeds (默认 config) --site <d> --section <key> --category <名> --product-line <线> --pages <n> --limit <n> --render ssr|spa|auto --dry-run');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
