#!/usr/bin/env node
// 方案A 一键启动器（零依赖，仅用 Node 内置模块）。已接入 pnpm：`pnpm plan:a <domain> [--persist]`
//
// 做三件事：
//   1. 用本机 Chrome（CHROME_BIN 环境变量指定）开一个带 --remote-debugging-port 的实例，
//      自动打开目标站；
//   2. 你在弹出的窗口里手动通过 Cloudflare 验证，按 Enter 继续；
//   3. 通过 CDP 连上这个已认证的浏览器会话跑 diagnose —— 全程复用你过盾后的 cookie。
//
// 用法（CHROME_BIN 在系统环境变量里配一次即可）：
//   pnpm plan:a www.biolegend.com
//   pnpm plan:a www.biolegend.com --persist      # 过盾后把 cookie 持久化，供 crawl 复用
//
// 环境变量：
//   CHROME_BIN            本机 Chrome 可执行文件路径（必填，配一次即可）
//   CDP_PORT              远程调试端口（默认 9222）
//   CHROME_USER_DATA_DIR  自定义用户数据目录（默认 <repo>/.runtime/cdp-profile，隔离常驻 Chrome）
//   PLAN_A_PERSIST=1      等价于 --persist
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import readline from 'node:readline';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..'); // scripts/plan-a -> scripts -> repoRoot

const CHROME_BIN = process.env.CHROME_BIN || process.env.PLAN_A_CHROME;
const domain = process.argv[2];
const PERSIST = process.argv.includes('--persist') || process.env.PLAN_A_PERSIST === '1';
const PORT = process.env.CDP_PORT || '9222';
const USER_DATA = process.env.CHROME_USER_DATA_DIR || resolve(repoRoot, '.runtime', 'cdp-profile');
const target = domain ? `https://${domain}` : 'about:blank';

if (!CHROME_BIN) {
  console.error('✗ 请通过环境变量 CHROME_BIN 提供本机 Chrome 路径（系统环境变量配一次即可），例如：');
  console.error('  CHROME_BIN="C:/Program Files/Google/Chrome/Application/chrome.exe" pnpm plan:a www.biolegend.com');
  process.exit(1);
}
if (!existsSync(CHROME_BIN)) {
  console.error(`✗ CHROME_BIN 指向的文件不存在：${CHROME_BIN}`);
  process.exit(1);
}
if (!domain) {
  console.error('✗ 请在参数里给出站点域名，例如：pnpm plan:a www.biolegend.com');
  process.exit(1);
}

console.log(`▸ 启动 Chrome（远程调试端口 ${PORT}）…`);
console.log(`  Chrome: ${CHROME_BIN}`);
console.log(`  用户目录: ${USER_DATA}`);
console.log(`  目标站: ${target}`);
console.log('  （若窗口未弹出请查看任务栏；请勿关闭该 Chrome）');

// 用独立 user-data-dir，避免与你常驻 Chrome 的 profile 锁冲突
const child = spawn(CHROME_BIN, [
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${USER_DATA}`,
  '--no-first-run',
  '--no-default-browser-check',
  target,
], { detached: true, stdio: 'ignore', windowsHide: false });
child.unref(); // 父进程退出后 Chrome 继续在后台运行

function probe() {
  return new Promise((res) => {
    const req = http.get(`http://127.0.0.1:${PORT}/json/version`, (r) => { r.resume(); res(true); });
    req.on('error', () => res(false));
    req.setTimeout(800, () => { req.destroy(); res(false); });
  });
}

const deadline = Date.now() + 20000;
(async () => {
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 500));
    if (await probe()) break;
  }
  if (Date.now() >= deadline) {
    console.error(`\n✗ 端口 ${PORT} 20s 内未就绪，可能 Chrome 启动失败或端口被占用。`);
    console.error(`  排查：netstat -ano | findstr :${PORT}`);
    process.exit(1);
  }
  console.log('\n✓ Chrome 远程调试已就绪（DevTools: http://127.0.0.1:' + PORT + '）');
  console.log('>>> 请在弹出的 Chrome 窗口里手动通过 Cloudflare 验证，完成后按 Enter 继续…');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise((ok) => rl.question('', () => { rl.close(); ok(); }));

  const mode = `cdp:http://127.0.0.1:${PORT}`;

  if (PERSIST) {
    console.log('\n▸ 把过盾后的 cookie 持久化到 storageState（供 crawl 复用）…');
    const helper = resolve(__dirname, 'dump-cookies.mjs');
    const dump = spawn('pnpm', ['--filter', '@competitor-crawler/crawler', 'exec', 'tsx', helper, PORT, domain], { cwd: repoRoot, stdio: 'inherit' });
    const code = await new Promise((ok) => {
      dump.on('error', (e) => { console.error('✗ 无法启动 pnpm：' + e.message); ok(1); });
      dump.on('exit', (c) => ok(c ?? 0));
    });
    if (code !== 0) { console.error('  cookie 持久化失败，跳过；仍继续跑 diagnose 验证。'); }
  }

  console.log(`\n▸ 通过 CDP 连接该浏览器，对 ${domain} 跑 diagnose（自动复用你过盾的 cookie）…\n`);
  const diag = spawn('pnpm', ['--filter', '@competitor-crawler/crawler', 'exec', 'tsx', 'src/cli.ts', 'diagnose', '--domain', domain, '--mode', mode], { cwd: repoRoot, stdio: 'inherit' });
  diag.on('error', (e) => {
    console.error('\n✗ 无法启动 pnpm（' + e.message + '），请手动执行：');
    console.error(`  pnpm --filter @competitor-crawler/crawler exec tsx src/cli.ts diagnose --domain ${domain} --mode ${mode}`);
    process.exit(1);
  });
  diag.on('exit', (code) => {
    console.log('\n✓ diagnose 结束（退出码 ' + code + '）。');
    console.log('  该 Chrome 仍在后台运行，用完后请手动关闭它的窗口。');
    if (PERSIST) console.log(`  已持久化 cookie → .runtime/state/${domain}.json，可直接 pnpm crawl --domain ${domain}（browser 通道自动复用）。`);
    console.log(`  若显示已通过（200 / 无挑战），可把 config/sites/${domain}.yaml 从 C 提到 B/A。`);
    process.exit(code ?? 0);
  });
})();
