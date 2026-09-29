import { defineEventHandler } from 'h3';
import fs from 'node:fs';
import path from 'node:path';
import { repoRoot } from '@competitor-crawler/shared';

const sitesDir = path.join(repoRoot, 'config', 'sites');

// 站点配置清单：列出 config/sites/*.yaml 并抽取基础元信息（轻量解析，不引入 crawler 依赖）
export default defineEventHandler(async () => {
  if (!fs.existsSync(sitesDir)) return [];
  const files = fs.readdirSync(sitesDir).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));
  return files.map((file) => {
    const domain = file.replace(/\.ya?ml$/, '');
    const raw = fs.readFileSync(path.join(sitesDir, file), 'utf8');
    const get = (re: RegExp) => {
      const m = raw.match(re);
      return m && m[1] ? m[1].trim() : '';
    };
    const company = get(/^company:\s*(.+)$/m);
    const currency = get(/^currency:\s*(.+)$/m);
    const sectionCount = (raw.match(/^\s*-\s*key:/gm) ?? []).length;
    return { domain, file, company, currency, sectionCount };
  });
});
