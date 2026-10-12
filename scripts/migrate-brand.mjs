#!/usr/bin/env node
/**
 * 品牌列改名一次性迁移（2026-10-12，schema 品牌字段显式化重构）：
 *   companies.brand（无）        → ADD COLUMN company_brand        （公司品牌，YAML 顶层 companyBrand）
 *   sections.brand               → RENAME TO competitor_brand      （竞对品牌，顶层默认 + section 覆盖）
 *   products.brand               → RENAME TO competitor_brand      （产品竞对品牌，空值回退 sections）
 * 幂等：已改过的列直接跳过，可重复跑。改完后 drizzle-kit push 不再产生结构 diff。
 * 用法：node scripts/migrate-brand.mjs [sqlite文件路径]（默认 data/crawler.sqlite）
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
// pnpm 严格 node_modules：better-sqlite3 是 shared 的依赖，借它的解析路径找
const Database = require.resolve('better-sqlite3', { paths: [path.join(root, 'packages/shared')] });
const BetterSqlite3 = require(Database);

const dbFile = process.argv[2] ?? path.join(root, 'data/crawler.sqlite');
const db = new BetterSqlite3(dbFile);

const columns = (table) => new Set(db.prepare(`select name from pragma_table_info('${table}')`).all().map((r) => r.name));

const done = [];
for (const [table, from, to] of [
  ['sections', 'brand', 'competitor_brand'],
  ['products', 'brand', 'competitor_brand'],
]) {
  const cols = columns(table);
  if (cols.has(from)) {
    db.exec(`alter table ${table} rename column ${from} to ${to}`);
    done.push(`${table}.${from} → ${to}`);
  } else if (cols.has(to)) {
    done.push(`${table}.${to}（已是新名，跳过）`);
  } else {
    console.error(`✗ ${table} 既无 ${from} 也无 ${to}，请人工检查库结构`);
    process.exitCode = 1;
    break;
  }
}

const companyCols = columns('companies');
if (!companyCols.has('company_brand')) {
  db.exec('alter table companies add column company_brand text');
  done.push('companies + company_brand');
} else {
  done.push('companies.company_brand（已存在，跳过）');
}

db.close();
for (const line of done) console.log(`✓ ${line}`);
console.log('迁移完成');
