import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'drizzle-kit';

dotenv.config({
  path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env'),
});

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rawUrl = process.env.DATABASE_URL || './data/crawler.sqlite';
const dbUrl = path.isAbsolute(rawUrl) ? rawUrl : path.resolve(repoRoot, rawUrl);

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url: dbUrl },
});
