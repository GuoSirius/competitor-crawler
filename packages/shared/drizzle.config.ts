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

// better-sqlite3 不会自动创建父目录；首次 push 时确保目录存在（幂等）
fs.mkdirSync(path.dirname(dbUrl), { recursive: true });

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url: dbUrl },
});
