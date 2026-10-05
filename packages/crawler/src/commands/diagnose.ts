/**
 * `pnpm diagnose —— 站点可达性/反爬归因对照诊断`
 *
 * 解决的是什么问题（2026-10-05 用户诉求）：
 * 「代码说这个站被 WAF 拦了，我实际打开明明能开」——两边各执一词时，靠**可复现的对照表**说话，
 * 而不是靠谁的经验。同一 URL 依次走多套「浏览器通道」，把每套的 HTTP 状态、正文长度、
 * 挑战页命中、产品锚点数、耗时、风控响应头摊在同一张表里，一眼就能看出：
 * - 某几套通、某几套不通 → **姿势问题**（无头/有头、内置 Chromium vs 系统 Chrome、缺 cookie）
 * - 全部同样失败且响应头是 `cf-mitigated: challenge` / 封禁页 → **IP/指纹级**，重试无意义
 * 再附「指纹体检」，把「站点凭什么判我是 bot」的答案直接列出来（mimeTypes=0、时区不自洽…）。
 *
 * 通道说明：
 * | 通道 | 含义 | 什么时候有用 |
 * |---|---|---|
 * | `ssr` | Node 原生 fetch | 先看最轻的姿势能不能通，通了就不用开浏览器 |
 * | `chromium-headless` | Playwright 内置 Chromium 无头 | 最容易触发无头检测（逸漠实测 403） |
 * | `chromium-headful` | 内置 Chromium 有头（**引擎默认**） | 与正式抓取同口径，结论可直接使用 |
 * | `chrome-headful` | 系统真实 Chrome 有头 | 指纹最接近真人，过盾率最高 |
 * | `chrome-headless` | 系统真实 Chrome 无头 | 服务器/CI 环境 |
 * | `cdp:<url>` | 连**你自己开着**的 Chrome（需 `--remote-debugging-port=9222`） | 100% 复现「用户视角」，且能带走已过盾的 cookie |
 *
 * 零副作用：只读页面、不落库、不写站点配置。
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from '@competitor-crawler/shared';
import { loadSiteConfig, resolveSections } from '../config/loader.js';
import type { StealthEnv } from '../fetch/antiBot.js';
import {
  auditFingerprint, auditStealthSource, maximizeWindow,
  stealthArgs, stealthContextOptions, DEFAULT_STEALTH_ENV,
} from '../fetch/antiBot.js';

/** 一条通道跑出来的结果 */
export interface DiagRow {
  channel: string;
  status?: number;
  len?: number;
  title?: string;
  challenge?: string;
  items?: number;
  ms: number;
  server?: string;
  error?: string;
}

/** 产品锚点启发式（与 sweep 同口径，保证历史可比；只看数不看内容） */
function countItems(html: string): number {
  const m = html.match(/href=(["'])[^"']*(\/product|\/goods|\/p\/|\/item|\/detail|\/sku)[^"']*\1/gi);
  return m ? new Set(m.map((s) => s.toLowerCase())).size : 0;
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/** 会话持久化路径：与 fetch/page.ts 的 statePathOf 保持一致（同一份载体，不能各写各的） */
function statePathOf(url: string): string {
  return join(repoRoot, '.runtime', 'state', `${new URL(url).hostname}.json`);
}

/**
 * 起一套通道并拿到 page；返回 handle 由调用方负责 close（避免 ctx 被提前关掉）。
 *
 * 关键：**带上了会话持久化**（`storageState`），与正式 crawl 走 browserFetch 的行为一致。
 * 否则诊断会对「人工已过盾、cookie 存在 `.runtime/state/<host>.json`」的站点报 403，
 * 而正式抓取其实能通 —— 又变成「代码说不行、你明明能开」的死循环。
 */
async function openChannel(
  channel: string,
  url: string,
): Promise<{ page: import('playwright').Page; close: () => Promise<void> }> {
  const { chromium } = await import('playwright');
  const args = stealthArgs({ headless: false });
  if (channel.startsWith('cdp:')) {
    // 连用户自己开着的 Chrome：100% 复现「用户视角」，且天然带着他过盾后的 cookie
    const browser = await chromium.connectOverCDP(channel.slice(4));
    const ctx = browser.contexts()[0] ?? (await browser.newContext());
    const page = (await ctx.pages())[0] ?? (await ctx.newPage());
    // 注意：CDP 场景不能关浏览器（那是用户自己的窗口），只断开连接
    return { page, close: () => browser.close().catch(() => {}) };
  }
  const [kind, mode] = channel.split('-');
  const headless = mode === 'headless';
  const browser = await chromium.launch({
    args,
    ...(kind === 'chrome' ? { channel: 'chrome' as const } : {}),
    headless,
  });
  const env: StealthEnv = { ...DEFAULT_STEALTH_ENV, userAgent: UA, maximize: !headless };
  const sp = statePathOf(url);
  const ctx = await browser.newContext({
    ...stealthContextOptions(env, { headless }),
    userAgent: UA,
    ...(existsSync(sp) ? { storageState: sp } : {}),
  });
  const page = await ctx.newPage();
  if (!headless) await maximizeWindow(page);
  return { page, close: () => browser.close().catch(() => {}) };
}

async function runChannel(
  channel: string,
  url: string,
  opts: { rounds?: number; waitMs?: number } = {},
): Promise<DiagRow> {
  const t0 = Date.now();
  const row: DiagRow = { channel, ms: 0 };
  let close: (() => Promise<void>) | null = null;
  try {
    const h = await openChannel(channel, url);
    close = h.close;
    const { page } = h;
    const { assessChallenge } = await import('../fetch/challenge.js');
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    let html = await page.content();
    row.status = resp?.status();
    row.len = html.length;
    row.title = (await page.title()).slice(0, 40);
    row.items = countItems(html);
    const innerText = await page.evaluate(() => document.body?.innerText ?? '').catch(() => '');
    const a = assessChallenge({
      status: resp?.status(),
      html,
      innerText,
      headers: resp ? await resp.allHeaders().catch(() => ({})) : undefined,
    });
    row.challenge = a.hit ? `${a.hit.kind}:${a.hit.matched.slice(0, 40)}` : '-';
    // 托管挑战（CF「Just a moment」）值得再重试几轮看能否放行，而不是一刀切判死。
    // 关键：**每轮必须带 cookie 重新 goto**，CF 过盾后不会自动重放原请求（实测原地等 12 轮仍 403）。
    if (a.hit?.kind === 'cloudflare' && opts.rounds) {
      for (let i = 0; i < opts.rounds; i++) {
        await new Promise((r) => setTimeout(r, opts.waitMs ?? 5000));
        const retry = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => null);
        html = await page.content();
        const t = await page.evaluate(() => document.body?.innerText ?? '').catch(() => '');
        const a2 = assessChallenge({
          status: retry?.status(),
          html,
          innerText: t,
          headers: retry ? await retry.allHeaders().catch(() => ({})) : undefined,
        });
        if (!a2.hit) {
          row.challenge = `-（第 ${i + 1} 轮重试后放行）`;
          row.status = retry?.status();
          row.len = html.length;
          row.items = countItems(html);
          break;
        }
        if (i === opts.rounds - 1) {
          row.challenge = `${a2.hit.kind}:${a2.hit.matched.slice(0, 40)}`;
          row.status = retry?.status();
        }
      }
    }
  } catch (e) {
    row.error = (e as Error).message.split('\n')[0]?.slice(0, 90);
  } finally {
    row.ms = Date.now() - t0;
    await close?.().catch(() => {});
  }
  return row;
}

/**
 * 从站点 YAML 取候选 URL：走 resolveSections 拿**每个栏目**的入口（多规则站会有多个），
 * 顶层 startUrl 作为兜底。没有 YAML 时退回首页。
 *
 * 必须走 loader —— `pnpm --filter` 下 CWD 是包目录，自己 join('config',...) 读不到
 * 仓库根的 YAML（路径统一由 shared/paths.ts 提供，见 loader 顶部注释）。
 */
function candidateUrls(domain: string, explicit?: string): string[] {
  if (explicit) return [explicit];
  const home = `https://${domain}`;
  let cfg: ReturnType<typeof loadSiteConfig> | null = null;
  try {
    cfg = loadSiteConfig(domain);
  } catch {
    return [home];
  }
  const urls = new Set<string>();
  // resolveSections 对「多规则站缺 parseList」会抛（那是 validate 该报的错，不该让诊断崩掉）→ 单独兜
  try {
    for (const s of resolveSections(cfg)) for (const u of s.startUrls) urls.add(u);
  } catch { /* 退回顶层 startUrl */ }
  if (cfg.startUrl) urls.add(cfg.startUrl);
  return urls.size > 0 ? [...urls] : [home];
}

export interface DiagnoseOpts {
  domain: string;
  url?: string;
  modes?: string[];
  rounds?: number;
  fingerprint?: boolean;
  json?: boolean;
}

/**
 * 跑一遍对照诊断并打印。
 *
 * 打印顺序刻意做成「先给结论表，再给指纹，最后给处置建议」：
 * 结论表让人一眼看到差在哪，指纹解释「为什么被判 bot」，建议直接可抄进 YAML。
 */
export async function runDiagnose(opts: DiagnoseOpts): Promise<void> {
  const urls = candidateUrls(opts.domain, opts.url);
  const modes = opts.modes?.length ? opts.modes : ['ssr', 'chromium-headless', 'chromium-headful', 'chrome-headful', 'chrome-headless'];
  const rows: DiagRow[] = [];

  for (const url of urls) {
    console.log(`\n▸ ${url}`);
    for (const ch of modes) {
      const row = await runChannel(ch, url, { rounds: opts.rounds ?? 0 });
      rows.push(row);
      if (opts.json) continue;
      const cells = [
        row.channel.padEnd(18),
        String(row.status ?? row.error ?? '-').padEnd(24),
        `${row.len ?? '-'}B`.padEnd(10),
        `items=${String(row.items ?? '-')}`.padEnd(11),
        `${row.ms}ms`.padEnd(9),
        row.challenge ?? '',
      ];
      console.log(cells.join(''));
    }
  }

  // ── 指纹体检：单独开一次浏览器读运行时值（不复用已关闭的通道）──
  let fp: Record<string, unknown> | null = null;
  if (opts.fingerprint !== false) {
    const issues = auditStealthSource(DEFAULT_STEALTH_ENV);
    let close: (() => Promise<void>) | null = null;
    try {
      const h = await openChannel('chromium-headful', urls[0]!);
      close = h.close;
      await h.page.goto(urls[0]!, { waitUntil: 'domcontentloaded', timeout: 45_000 }).catch(() => null);
      fp = await auditFingerprint(h.page);
    } catch (e) {
      fp = { error: (e as Error).message.slice(0, 80) };
    } finally {
      await close?.().catch(() => {});
    }
    if (opts.json) console.log(JSON.stringify({ fingerprint: fp, sourceIssues: issues }));
    else {
      console.log('\n指纹体检（与真值不符的，就是「站点凭什么判我是 bot」）：');
      for (const [k, v] of Object.entries(fp ?? {})) console.log(`  ${k.padEnd(20)} ${String(v)}`);
      console.log(`  ${'配置自洽性'.padEnd(20)} ${issues.length ? issues.join(' / ') : '通过'}`);
    }
  }

  const verdict = conclude(rows);
  if (opts.json) console.log(JSON.stringify({ rows, verdict }));
  else console.log(`\n结论：${verdict}`);
}

/**
 * 处置建议：把对照表压成一句人能照着做的事（该换 IP / 该用有头 / 该配 YAML）。
 *
 * 判读顺序是刻意的——**先看"有没有通的"**（有通的就是姿势问题，最容易解决），
 * 再看**风控特征**（封禁页 = IP 级 / 托管挑战 = 需重试过盾），最后才看网络层错误。
 * 顺序反过来会得出「让用户先查指纹」这种帮不上忙的结论（实测踩过：BioLegend 全通道
 * `cf-mitigated: challenge` 却被归到"先排查指纹自洽性"，而指纹体检其实全绿）。
 */
function conclude(rows: DiagRow[]): string {
  const ok = rows.filter((r) => r.status === 200);
  if (ok.length > 0) {
    const best = ok.sort((a, b) => (b.items ?? 0) - (a.items ?? 0))[0]!;
    const bad = rows.filter((r) => r.status !== 200);
    return (
      `✅ 可达（${ok.length}/${rows.length} 通道通）→ 属**姿势问题**而非封锁。` +
      `最佳通道 ${best.channel}（items=${best.items ?? '?'}），` +
      (bad.length > 0 ? `不通的是 ${bad.map((r) => `${r.channel}=${r.status ?? r.error}`).join('、')}，` : '') +
      `把 ${best.channel.split('-')[0]}${best.channel.includes('headless') ? '（无头）' : '（有头）'} 写进站点 YAML 的 antiBot，再下钻列表页`
    );
  }
  const blocked = rows.filter((r) => r.status !== undefined && r.status >= 400);
  const netErr = rows.filter((r) => r.error);
  if (blocked.length > 0 && blocked.length === rows.length - netErr.length && blocked.length > 0) {
    const sig = blocked.map((r) => r.challenge ?? '').join(' | ');
    // Cloudflare 封禁页 = 明确的 IP 级拒绝（"Attention Required! | Cloudflare"）
    if (/attention required|you have been blocked/i.test(sig)) {
      return `⛔ 全通道一致命中 **Cloudflare 封禁页**（${sig.trim()}）→ IP 级拦截，换指纹/重试无效：需换出口 IP（YAML 站点级 \`proxy: '\${CRAWL_PROXY}'\`）或放弃该站`;
    }
    // cf-mitigated 头 / "Just a moment" 标题 = 托管挑战：盾本身可能过，但需要过盾后的 cookie 重放
    if (/challenge|just a moment|checking your browser/i.test(sig)) {
      return `🟡 全通道一致命中 **托管挑战**（${sig.trim()}）→ 不是 IP 封禁，是过盾没被采纳。处置：① 调大 \`CRAWL_CHALLENGE_ROUNDS\`（默认 8）让引擎带 cookie 重新导航多试几轮；② 无头必被拒，确认走有头（引擎默认）；③ 仍不过再换出口 IP。改动后用本命令复验`;
    }
    return `⛔ 全通道一致 ${blocked[0]!.status} → 先确认是 WAF 拦截还是站点自身错误：看响应头与页面文案。`;
  }
  if (netErr.length === rows.length) {
    return `🔌 全通道一致网络层失败（${[...new Set(netErr.map((r) => r.error))].join(' / ')}）→ **不是反爬问题**：查 DNS/证书/出口连通性；用 \`pnpm diagnose --domain <d> --mode 'cdp:http://127.0.0.1:9222'\` 连你自己开着的 Chrome 复现「用户视角」对照`;
  }
  const parts = rows.map((r) => `${r.channel}=${r.status ?? r.error ?? '?'}`).join(', ');
  return `⚠️ 结果不一致（${parts}）→ 混合原因：先按上面指纹体检核对自洽性，再对不通的通道逐个看 challenge 列`;
}
