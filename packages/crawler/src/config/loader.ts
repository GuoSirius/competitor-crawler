import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'yaml';
import type { SiteConfig } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sitesDir = path.resolve(__dirname, '../../../config/sites');

/** 站点配置文件路径：config/sites/<domain>.yaml */
export function siteConfigPath(domain: string): string {
  return path.join(sitesDir, `${domain}.yaml`);
}

/** 读取并解析站点配置；不存在时给出明确提示（引导先用 gen-site 生成） */
export function loadSiteConfig(domain: string): SiteConfig {
  const p = siteConfigPath(domain);
  if (!fs.existsSync(p)) {
    throw new Error(`未找到站点配置: ${p}（可先执行 pnpm gen-site 生成）`);
  }
  return yaml.parse(fs.readFileSync(p, 'utf-8')) as SiteConfig;
}

/** 写出站点配置（gen-site 调用） */
export function saveSiteConfig(domain: string, cfg: SiteConfig): string {
  const p = siteConfigPath(domain);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, yaml.stringify(cfg), 'utf-8');
  return p;
}
