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

// YAML 双引号标量转义（docs/16 S2）：值里出现 引号/反斜杠/换行 时不会破坏结构或注入键
const yq = (s: string): string =>
  `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\n')}"`;

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
  // startUrl 必须是合法 http(s) 链接（docs/16 S2：不做 URL 校验会把脏值写进 YAML）
  try {
    if (!/^https?:$/.test(new URL(startUrl).protocol)) throw new Error('not http(s)');
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'startUrl 必须是合法的 http(s) 链接' });
  }

  const target = path.join(sitesDir, `${domain}.yaml`);
  if (fs.existsSync(target)) throw createError({ statusCode: 409, statusMessage: '该域名配置已存在' });

  const yaml = `domain: ${domain}
company: ${yq(company)}
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
    category: ${yq(category)}
    startUrls: [${yq(startUrl)}]
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
