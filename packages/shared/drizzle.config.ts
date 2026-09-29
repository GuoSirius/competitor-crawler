import fs from 'node:fs';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'drizzle-kit';

dotenv.config({
  path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env'),
});

// 仓库根 = competitor-crawler/（本文件在 packages/shared/ 下，故上溯两级）
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const rawUrl = process.env.DATABASE_URL || './data/crawler.sqlite';
const dbUrl = path.isAbsolute(rawUrl) ? rawUrl : path.resolve(repoRoot, rawUrl);

const dialect = (process.env.DB_DIALECT || 'sqlite') as 'sqlite' | 'mysql' | 'postgresql';
const schemaFile =
  dialect === 'mysql'
    ? './src/db/schema-mysql.ts'
    : dialect === 'postgresql'
      ? './src/db/schema-pg.ts'
      : './src/db/schema-sqlite.ts';

// sqlite 文件库需确保父目录存在；mysql/pg 用连接串，无需 mkdir
if (dialect === 'sqlite') {
  fs.mkdirSync(path.dirname(dbUrl), { recursive: true });
}

// 三方言的 dbCredentials 统一用连接串：sqlite=文件路径；mysql/pg=DATABASE_URL
const dbCredentials = { url: dialect === 'sqlite' ? dbUrl : rawUrl };

export default defineConfig({
  dialect,
  schema: schemaFile,
  out: './drizzle',
  dbCredentials,
});
