import fs from 'node:fs';
import { createRequire } from 'node:module';
import dotenv from 'dotenv';
import path from 'node:path';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { drizzle as drizzleMysql } from 'drizzle-orm/mysql2';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import mysql from 'mysql2/promise';
import { sqliteSchema, mysqlSchema, pgSchema, type DbDialect } from './schema.js';
import { repoRoot } from '../paths.js';

// 仓库根由 shared/src/paths.ts 统一提供（避免各处重复上溯算错层级）

dotenv.config({ path: path.join(repoRoot, '.env') });

// pg 自带类型由 @types/pg 提供；本环境未安装该包时改用 createRequire 取 CJS 模块（运行时类型 any，
// 调用处仅当作连接池使用，不影响逻辑）。后续在 shared 安装 @types/pg 后可恢复为 `import pg from 'pg'`。
const require = createRequire(import.meta.url);
const pg: { Pool: new (opts: { connectionString: string }) => unknown } = require('pg');

export type AppDb = BetterSQLite3Database<typeof sqliteSchema>;
export type { DbDialect };
export interface DbHandle {
  dialect: DbDialect;
  db: AppDb;
}

const rawUrl = process.env.DATABASE_URL || './data/crawler.sqlite';
const dbUrl = path.isAbsolute(rawUrl) ? rawUrl : path.resolve(repoRoot, rawUrl);

/**
 * 创建数据库句柄，按 DB_DIALECT 选择方言：
 * - sqlite（默认/本地）：better-sqlite3 文件库。
 * - mysql：mysql2 连接池（DATABASE_URL 形如 mysql://user:pass@host:3306/db）。
 * - postgresql：pg 连接池（DATABASE_URL 形如 postgres://user:pass@host:5432/db）。
 *
 * 三方言的表名/列名/索引完全一致（见 schema-sqlite/mysql/pg.ts），业务代码零改动；
 * 返回的 db 统一按 AppDb（SQLite 类型）对外，调用方无需感知方言差异。
 */
export function createDb(): DbHandle {
  const dialect = (process.env.DB_DIALECT as DbDialect) || 'sqlite';

  if (dialect === 'sqlite') {
    // better-sqlite3 不会自动创建父目录；确保存在（幂等），避免首次运行报 "directory does not exist"
    fs.mkdirSync(path.dirname(dbUrl), { recursive: true });
    const sqlite = new Database(dbUrl);
    sqlite.pragma('journal_mode = WAL');
    const db = drizzle(sqlite, { schema: sqliteSchema });
    return { dialect, db };
  }

  if (dialect === 'mysql') {
    const pool = mysql.createPool(rawUrl);
    const db = drizzleMysql(pool, { schema: mysqlSchema, mode: 'default' });
    return { dialect, db: db as unknown as AppDb };
  }

  // postgresql
  const pool = new pg.Pool({ connectionString: rawUrl });
  const db = drizzlePg(pool as never, { schema: pgSchema });
  return { dialect, db: db as unknown as AppDb };
}
