import { defineEventHandler, getRouterParam, createError } from 'h3';
import fs from 'node:fs';
import path from 'node:path';
import { repoRoot } from '@competitor-crawler/shared';

const sitesDir = path.join(repoRoot, 'config', 'sites');

// 读取单个站点 YAML 原文（供前端展示 / 复制）
export default defineEventHandler(async (event) => {
  const domain = getRouterParam(event, 'domain') ?? '';
  if (!/^[\w.-]+$/.test(domain)) throw createError({ statusCode: 400, statusMessage: 'invalid domain' });
  const file = path.join(sitesDir, `${domain}.yaml`);
  if (!fs.existsSync(file)) throw createError({ statusCode: 404, statusMessage: 'not found' });
  return { domain, content: fs.readFileSync(file, 'utf8') };
});
