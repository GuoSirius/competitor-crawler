#!/usr/bin/env node
// 方案B：Chrome 插件导出的 Netscape cookie.txt → Playwright storageState 转换器（零依赖，仅用 Node 内置模块）。
// 已接入 pnpm：`pnpm plan:b <cookie.txt> <domain>`
//
// 背景：方案B = 用 Chrome 插件把已手动过盾站点的 cookie 导出为 Netscape cookie.txt，
// 本脚本把它转成 Playwright 的 storageState JSON（.runtime/state/<domain>.json），
// 之后 `pnpm crawl --domain <domain>` 的 browser 通道会自动复用这份 cookie 过盾。
//
// 用法：
//   pnpm plan:b ./cookies.txt www.biolegend.com
//
// 说明：
//   - 读取 Chrome 插件导出的 Netscape 格式（含 `#HttpOnly_` 前缀的数据行）。
//   - 输出 .runtime/state/<domain>.json（与方案A 的 CDP 持久化产物同路径，crawl 共用）。
//   - <domain> 必须与 crawl 时的站点域名一致（即 config/sites/<domain>.yaml 的 host），
//     crawl 会按该域名读取 .runtime/state/<domain>.json。
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..'); // scripts/plan-b -> scripts -> repoRoot

const [cookieFile, domain] = process.argv.slice(2);

if (!cookieFile || !domain) {
  console.error('用法：pnpm plan:b <cookie.txt> <domain>');
  console.error('示例：pnpm plan:b ./cookies.txt www.biolegend.com');
  process.exit(1);
}
if (!/^[a-zA-Z0-9.-]+$/.test(domain)) {
  console.error(`✗ domain 非法：${domain}（仅允许字母/数字/.-）`);
  process.exit(1);
}
if (!existsSync(cookieFile)) {
  console.error(`✗ cookie 文件不存在：${cookieFile}`);
  process.exit(1);
}

/**
 * 解析 Netscape cookie 文件（Tab 分隔 7 列：domain \t flag \t path \t secure \t expiry \t name \t value）。
 * - 注释行（以 # 开头且非 #HttpOnly_）跳过；
 * - #HttpOnly_ 前缀是数据行，标记写在 domain 字段前，需剥离并置 httpOnly=true。
 */
function parseNetscape(text) {
  const cookies = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, '');
    if (!line) continue;
    if (line.startsWith('#') && !line.startsWith('#HttpOnly_')) continue;
    const cols = line.split('\t');
    const f = cols.length >= 7 ? cols : line.split(/\s+/);
    if (f.length < 7) continue;
    const [domainField, , path, secure, expiry, name, ...rest] = f;
    const value = rest.join('\t');
    const httpOnly = domainField.startsWith('#HttpOnly_');
    const domainName = domainField.replace(/^#HttpOnly_/, '');
    const expNum = Number(expiry);
    const expires = expiry && expiry !== '-1' && Number.isFinite(expNum) && expNum > Date.now() / 1000
      ? expNum
      : undefined;
    cookies.push({
      name,
      value,
      domain: domainName,
      path,
      ...(expires !== undefined ? { expires } : {}),
      httpOnly,
      secure: secure === 'TRUE',
    });
  }
  return cookies;
}

const text = readFileSync(cookieFile, 'utf8');
const cookies = parseNetscape(text);
if (cookies.length === 0) {
  console.error('✗ 未从 cookie.txt 解析出任何 cookie，请确认是 Netscape 格式（Tab 分隔 7 列）。');
  process.exit(1);
}

const stateDir = resolve(repoRoot, '.runtime', 'state');
mkdirSync(stateDir, { recursive: true });
const outPath = resolve(stateDir, `${domain}.json`);
writeFileSync(outPath, JSON.stringify({ cookies, origins: [] }, null, 2), 'utf8');

console.log(`✓ 已转换 ${cookies.length} 条 cookie → ${outPath}`);
console.log(`  直接用：pnpm crawl --domain ${domain}（browser 通道自动复用这份 cf_clearance 等 cookie 过盾）`);
