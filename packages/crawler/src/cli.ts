import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { xlsxToSeeds } from './seed/xlsxToSeeds.js';
import { loadSeeds } from './seed/loadSeeds.js';
import { probe } from './commands/probe.js';
import { genSite } from './commands/genSite.js';
import { crawl } from './commands/crawl.js';
import { backfill } from './commands/backfill.js';
import { parseFlags } from './util/args.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const seedsJson = path.resolve(__dirname, '../../../data/seeds/seeds.json');

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
  } else if (cmd === 'crawl') {
    await crawl({
      site: typeof flags.site === 'string' ? flags.site : undefined,
      dryRun: flags['dry-run'] === true || flags['dry-run'] === 'true',
      pages: typeof flags.pages === 'string' ? Number(flags.pages) : undefined,
      limit: typeof flags.limit === 'string' ? Number(flags.limit) : undefined,
      render: typeof flags.render === 'string' ? flags.render : undefined,
    });
  } else if (cmd === 'report') {
    console.log('[report] 待实现（P4 下游）');
  } else {
    console.log('用法: tsx src/cli.ts <seed|probe|gen-site|backfill|crawl|report> [--flags]');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
