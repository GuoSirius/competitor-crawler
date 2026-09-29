import { defineEventHandler, readBody, createError } from 'h3';
import fs from 'node:fs';
import path from 'node:path';
import { repoRoot } from '@competitor-crawler/shared';
import { buildSiteYaml, validateSiteInput } from '../utils/siteInput.js';

const sitesDir = path.join(repoRoot, 'config', 'sites');

// 从模板新建站点 YAML（同事自助加站点：填表 → 生成配置 → 再用 pnpm probe 验证）
export default defineEventHandler(async (event) => {
  const body = (await readBody(event)) ?? {};
  // 纯校验/拼装逻辑在 server/utils/siteInput.ts（可单测）；此处只做 h3 错误映射与写盘
  const input = validateSiteInput(body);
  if (!input.ok) throw createError({ statusCode: 400, statusMessage: input.statusMessage });

  const target = path.join(sitesDir, `${input.domain}.yaml`);
  if (fs.existsSync(target)) throw createError({ statusCode: 409, statusMessage: '该域名配置已存在' });

  fs.mkdirSync(sitesDir, { recursive: true });
  fs.writeFileSync(target, buildSiteYaml(input), 'utf8');
  return { ok: true, domain: input.domain, file: `${input.domain}.yaml` };
});
