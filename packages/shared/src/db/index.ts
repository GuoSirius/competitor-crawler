import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { schema } from './schema.js';

dotenv.config({
  path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.env'),
});

export type DbDialect = 'sqlite' | 'mysql' | 'postgresql';
export type AppDb = BetterSQLite3Database<typeof schema>;
export interface DbHandle {
  dialect: DbDialect;
  db: AppDb;
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const rawUrl = process.env.DATABASE_URL || './data/crawler.sqlite';
const dbUrl = path.isAbsolute(rawUrl) ? rawUrl : path.resolve(repoRoot, rawUrl);

/**
 * 创建数据库句柄。当前实现 SQLite（本地默认）；
 * MySQL / PostgreSQL 生产切换需补充对应方言 schema 变体（见 docs/09），
 * 届时按 DB_DIALECT 在此分支构造 mysql2 / pg 的 drizzle 实例即可，业务代码不变。
 */
export function createDb(): DbHandle {
  const dialect = (process.env.DB_DIALECT as DbDialect) || 'sqlite';
  if (dialect !== 'sqlite') {
    throw new Error(
      `DB_DIALECT=${dialect} 尚未提供对应方言 schema 变体；请先使用 sqlite（生产切换见 docs/09）。`,
    );
  }
  const sqlite = new Database(dbUrl);
  sqlite.pragma('journal_mode = WAL');
  const db = drizzle(sqlite, { schema });
  return { dialect, db };
}
