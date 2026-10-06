#!/usr/bin/env node
// 把「方案A 已开着的 Chrome（带 --remote-debugging-port）」里、你手动过盾后的 cookie
// 持久化成 Playwright storageState JSON，落到 <repo>/.runtime/state/<host>.json，
// 供 crawl / diagnose 的 browser 通道自动复用（与 page.ts 的 statePathOf 同一路径）。
//
// 由 scripts/plan-a/launch.mjs --persist 调用，也可单独用：
//   pnpm --filter @competitor-crawler/crawler exec tsx scripts/plan-a/dump-cookies.mjs <port> <host>
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const [, , port, host] = process.argv;
if (!port || !host) {
  console.error('用法: tsx scripts/plan-a/dump-cookies.mjs <port> <host>');
  process.exit(1);
}

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
const ctx = browser.contexts()[0];
if (!ctx) {
  console.error('✗ 未找到浏览器上下文（Chrome 可能未完全启动或已关闭）');
  await browser.close().catch(() => {});
  process.exit(1);
}
const cookies = await ctx.cookies();
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..'); // scripts/plan-a -> scripts -> repoRoot
const out = resolve(repoRoot, '.runtime', 'state', `${host}.json`);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ cookies, origins: [] }, null, 2), 'utf8');
const cf = cookies.filter((c) => /cf_clearance|__cf_bm|^cf_/i.test(c.name)).map((c) => c.name);
console.log(`✓ 已持久化 ${cookies.length} 条 cookie → ${out}`);
console.log(cf.length ? `  含 CF 关键 cookie: ${cf.join(', ')}` : '  ⚠️ 未发现 cf_clearance —— 请确认已在该 Chrome 窗口通过 Cloudflare 验证');
await browser.close().catch(() => {});
