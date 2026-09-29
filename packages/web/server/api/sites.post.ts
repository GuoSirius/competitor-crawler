import { defineEventHandler, readBody, createError } from 'h3';
import fs from 'node:fs';
import path from 'node:path';
import { repoRoot } from '@competitor-crawler/shared';

const sitesDir = path.join(repoRoot, 'config', 'sites');

interface NewSiteBody {
  domain?: string;
  company?: string;
  startUrl?: string;
  category?: string;
}

// 从模板新建站点 YAML（同事自助加站点：填表 → 生成配置 → 再用 pnpm probe 验证）
export default defineEventHandler(async (event) => {
  const body = (await readBody<NewSiteBody>(event)) ?? {};
  const domain = (body.domain ?? '').trim();
  const company = (body.company ?? '').trim();
  const startUrl = (body.startUrl ?? '').trim();
  const category = (body.category ?? '').trim() || domain;

  if (!/^[\w.-]+$/.test(domain))
    throw createError({ statusCode: 400, statusMessage: 'domain 仅允许字母/数字/.-，且不含协议与路径' });
  if (!company || !startUrl)
    throw createError({ statusCode: 400, statusMessage: 'company 与 startUrl 必填' });

  const target = path.join(sitesDir, `${domain}.yaml`);
  if (fs.existsSync(target)) throw createError({ statusCode: 409, statusMessage: '该域名配置已存在' });

  const yaml = `domain: ${domain}
company: ${company}
currency: CNY
parseList:
  itemSelector: "TODO: 列表项选择器"
  fields:
    detailUrl: { sel: "a", attr: href }
    name:       { sel: "a", text: true }
parseDetail:
  fields: {}
  captureRest: true
sections:
  - key: default
    category: ${category}
    startUrls: ["${startUrl}"]
    listTraversal:
      strategy: pagination-html
      nextSelector: ".next"
      maxPages: 20
      fallbackToUi: true
`;

  fs.mkdirSync(sitesDir, { recursive: true });
  fs.writeFileSync(target, yaml, 'utf8');
  return { ok: true, domain, file: `${domain}.yaml` };
});
