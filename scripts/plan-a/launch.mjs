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
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import readline from 'node:readline';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..'); // scripts/plan-a -> scripts -> repoRoot

// 解析 pnpm 真实可执行文件。Windows 下裸 `spawn('pnpm')` 会 ENOENT：pnpm 实际是
// `pnpm.cmd`（npm 全局装）或 `pnpm.exe`（standalone），CreateProcess 不做 PATHEXT 扩展名解析，
// 必须给到带扩展名的文件名或完整路径。`where` 在 Windows 上可用，返回 PATH 中首个匹配。
function resolvePnpm() {
  if (process.platform !== 'win32') return 'pnpm';
  for (const cand of ['pnpm.cmd', 'pnpm.exe']) {
    try {
      const r = spawnSync('where', [cand], { windowsHide: true, encoding: 'utf8' });
      const out = (r.stdout || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0];
      if (out) return out;
    } catch { /* ignore */ }
  }
  return 'pnpm.cmd'; // 兜底
}
const PNPM = resolvePnpm();

// 通过 CDP 直接读取已认证 Chrome 里的 cookie（用 Node 内置 WebSocket，无需 playwright），
// 写出 Playwright storageState JSON 供 crawl / diagnose 复用。放到 launch.mjs 里是为了：
//   - 不依赖独立脚本文件（仓库路径含中文时，脚本绝对路径会让 Windows 下 .cmd 包装触发 EINVAL）；
//   - 不依赖 crawler 的 playwright 依赖解析（独立脚本放在 scripts/ 下时，Node 从 scripts/ 向上找不到 packages/crawler 的 playwright）。
function cdpGetCookies(port) {
  return new Promise((resolve, reject) => {
    // 先列目标，挑一个 page target。注意：浏览器级 WS（/json/version 的 webSocketDebuggerUrl）的
    // Network 域不可靠——直接在那上面 Network.getCookies 常常不返回预期响应；必须连到具体 target 的 WS。
    http.get(`http://127.0.0.1:${port}/json`, (r) => {
      let body = '';
      r.on('data', (d) => (body += d));
      r.on('end', () => {
        let targets;
        try { targets = JSON.parse(body); } catch { return reject(new Error('/json 解析失败')); }
        if (!Array.isArray(targets) || targets.length === 0) return reject(new Error('/json 未返回目标'));
        const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
          || targets.find((t) => t.webSocketDebuggerUrl);
        if (!page || !page.webSocketDebuggerUrl) return reject(new Error('找不到可用的 page target'));
        // Node 全局 WebSocket 是浏览器风格（WHATWG）：事件用 onopen/onmessage/onerror/onclose 属性，不是 .on()。
        const ws = new WebSocket(page.webSocketDebuggerUrl);
        let done = false;
        const finish = (cookies) => { done = true; try { ws.close(); } catch { /* ignore */ } resolve(cookies); };
        ws.onopen = () => {
          ws.send(JSON.stringify({ id: 1, method: 'Network.enable' }));
          ws.send(JSON.stringify({ id: 2, method: 'Network.getCookies' }));
        };
        ws.onmessage = (ev) => {
          let msg; try { msg = JSON.parse(ev.data.toString()); } catch { return; }
          if (msg.id === 2 && msg.result && Array.isArray(msg.result.cookies)) finish(msg.result.cookies);
        };
        ws.onerror = () => { if (!done) reject(new Error('CDP WebSocket 连接错误')); };
        ws.onclose = () => { if (!done) reject(new Error('CDP 连接在拿到 cookie 前关闭')); };
        setTimeout(() => { if (!done) { try { ws.close(); } catch { /* ignore */ } reject(new Error('CDP 读取 cookie 超时')); } }, 15000);
      });
    }).on('error', reject);
  });
}

function toPlaywrightCookie(c) {
  const out = {
    name: c.name,
    value: c.value,
    domain: c.domain,
    path: c.path || '/',
    httpOnly: !!c.httpOnly,
    secure: !!c.secure,
  };
  if (typeof c.expires === 'number' && c.expires > 0) out.expires = c.expires;
  if (c.sameSite) out.sameSite = c.sameSite.charAt(0).toUpperCase() + c.sameSite.slice(1);
  return out;
}

// 兼容两种配置方式：
//   ① 系统环境变量 CHROME_BIN（用户原意，配一次即可）
//   ② 项目 .env 文件里的 CHROME_BIN（与 CRAWL_PROXY 同套机制，最稳，不受终端会话/pnpm 透传影响）
// 优先用系统环境变量，缺失时回退读 .env（仅读取本脚本用到的 5 个键，且不覆盖已有变量）。
function loadPlanAEnvFromDotEnv() {
  const envPath = resolve(repoRoot, '.env');
  if (!existsSync(envPath)) return;
  const text = readFileSync(envPath, 'utf8');
  const wanted = ['CHROME_BIN', 'PLAN_A_CHROME', 'PLAN_A_PERSIST', 'CDP_PORT', 'CHROME_USER_DATA_DIR'];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue; // 跳过注释/空行/无 = 的行
    const key = m[1];
    let val = m[2];
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (wanted.includes(key) && process.env[key] === undefined) process.env[key] = val;
  }
}

loadPlanAEnvFromDotEnv();

const CHROME_BIN = process.env.CHROME_BIN || process.env.PLAN_A_CHROME;
const domain = process.argv[2];
const PERSIST = process.argv.includes('--persist') || process.env.PLAN_A_PERSIST === '1';
const PORT = process.env.CDP_PORT || '9222';
const USER_DATA = process.env.CHROME_USER_DATA_DIR || resolve(repoRoot, '.runtime', 'cdp-profile');
const target = domain ? `https://${domain}` : 'about:blank';

if (!CHROME_BIN) {
  console.error('✗ 未读到 CHROME_BIN。两种方式任选其一：');
  console.error('  ① 系统环境变量：先确认当前终端能看到它 ——');
  console.error('     cmd:  echo %CHROME_BIN%        PowerShell:  $env:CHROME_BIN');
  console.error('     若为空：GUI 改完环境变量需【重开终端】才生效（旧会话读不到）；PowerShell 里 $env: 设的仅当前会话有效');
  console.error('  ② 项目 .env 文件（推荐，最稳，与 CRAWL_PROXY 同处）：在仓库根 .env 加一行');
  console.error('     CHROME_BIN=C:/Program Files/Google/Chrome/Application/chrome.exe');
  console.error('  路径示例：C:/Program Files/Google/Chrome/Application/chrome.exe');
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
if (!/^[a-zA-Z0-9.-]+$/.test(domain)) {
  console.error(`✗ domain 非法（仅允许字母/数字/.-）：${domain}`);
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
    try {
      const raw = await cdpGetCookies(PORT);
      const cookies = raw.map(toPlaywrightCookie);
      const stateDir = resolve(repoRoot, '.runtime', 'state');
      mkdirSync(stateDir, { recursive: true });
      const outPath = resolve(stateDir, `${domain}.json`);
      writeFileSync(outPath, JSON.stringify({ cookies, origins: [] }, null, 2), 'utf8');
      const cf = cookies.filter((c) => /^(cf_clearance|__cf_bm|cf_)/i.test(c.name)).map((c) => c.name);
      console.log(`✓ 已持久化 ${cookies.length} 条 cookie → ${outPath}`);
      console.log(cf.length ? `  含 CF 关键 cookie: ${cf.join(', ')}` : '  ⚠️ 未发现 cf_clearance —— 请确认已在该 Chrome 窗口通过 Cloudflare 验证');
    } catch (e) {
      console.error('  ✗ cookie 持久化失败：' + e.message + '；仍继续跑 diagnose 验证。');
    }
  }

  console.log(`\n▸ 通过 CDP 连接该浏览器，对 ${domain} 跑 diagnose（自动复用你过盾的 cookie）…\n`);
  // shell:true 必须：Windows 下 pnpm 实为 pnpm.cmd，Node 裸 spawn 经 cmd /c 包装会因中文路径触发 EINVAL；
  // domain 已用正则校验（仅字母/数字/.-），不存在命令注入。
  const diag = spawn(PNPM, ['--filter', '@competitor-crawler/crawler', 'exec', 'tsx', 'src/cli.ts', 'diagnose', '--domain', domain, '--mode', mode], { cwd: repoRoot, stdio: 'inherit', shell: true });
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
