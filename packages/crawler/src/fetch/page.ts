import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { repoRoot } from '@competitor-crawler/shared';
import { Progress } from '../util/progress.js';
import {
  DEFAULT_STEALTH_ENV,
  detectChallenge,
  stealthArgs,
  stealthContextOptions,
  stealthInitSource,
  type ChallengeKind,
  type ChallengeHit,
  type StealthEnv,
} from './antiBot.js';
import { humanPause } from './human.js';

/**
 * 默认 UA：用桌面 Chrome 标识。早期用 `CompetitorCrawler/0.1` Bot UA，
 * 实测部分 SSR 站（如江莱 www.jonln.com）会据此返回被剥离的空壳列表（0 条），
 * 换成浏览器 UA 后才返回完整产品列表。浏览器 UA 是抓取场景最被接受的标识，
 * 不会比 Bot UA 更易触发 WAF，故作为默认。
 */
export const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// 反爬/指纹绕过：裸 fetch 或普通 Playwright 会被 CloudFront / 阿里云滑块等按
// `navigator.webdriver`、缺失的 sec-ch-ua、非浏览器 UA 等指纹拦截（返回 403/挑战页）。
// 这里统一加 stealth：禁 AutomationControlled 标志 + 覆盖 webdriver/plugins +
// 补齐真实浏览器的 UA 与 sec-ch-ua 系列请求头。实测可过绝大多数 WAF。
const STEALTH_ARGS = stealthArgs();

/** 风控/挑战页错误：与「抓取失败（网络/404）」区分开，供上层记 SITE_CHALLENGED。 */
export class ChallengeError extends Error {
  kind: ChallengeKind;
  constructor(kind: ChallengeKind, url: string, matched: string) {
    super(`CHALLENGED[${kind}] ${matched} @ ${url}`);
    this.name = 'ChallengeError';
    this.kind = kind;
  }
}

type Browser = import('playwright').Browser;
type Page = import('playwright').Page;

/** 开一个带 stealth 的页面（复用浏览器实例，跨站点调用降低启动开销）。 */
async function newStealthPage(
  browser: Browser,
  viewport?: { width: number; height: number },
  env: StealthEnv = DEFAULT_STEALTH_ENV,
): Promise<Page> {
  const ctx = await browser.newContext({
    ...stealthContextOptions(env),
    ...(viewport ? { viewport } : {}),
  });
  const page = await ctx.newPage();
  const profile = env.profile ?? 'mid';
  if (profile !== 'none') await page.addInitScript(stealthInitSource(profile));
  return page;
}

/** 渲染模式：ssr=静态 fetch；spa=Playwright 渲染；auto=先 ssr，内容过少回退 spa */
export type RenderMode = 'ssr' | 'spa' | 'auto';

/**
 * 统一页面抓取：按渲染模式取 HTML。
 * - ssr 用 Node 原生 fetch（轻量、快）；
 * - spa 动态 import playwright，仅需要时加载，避免无谓依赖开销；
 * - auto 在 ssr 返回内容偏少时自动回退 Playwright，提升复杂站点的成功率。
 *
 * `headers`：附加请求头（如代码适配器 preflight 拿到的 Cookie，docs/16 🔴-2），
 * 合并进 ssr 默认浏览器头（同名键覆盖）；spa 模式由浏览器自管 Cookie，此参数忽略。
 */
export interface FetchOpts {
  /** 隐身/指纹环境（默认 DEFAULT_STEALTH_ENV：mid + Asia/Shanghai + zh-CN） */
  stealth?: Partial<StealthEnv>;
  /** 覆盖 headless（默认取 env CRAWL_BROWSER_HEADLESS，未设=有头，本机桌面更隐蔽） */
  headless?: boolean;
}

export async function fetchPage(
  url: string,
  mode: RenderMode = 'auto',
  progress?: Progress,
  headers?: Record<string, string>,
  opts: FetchOpts = {},
): Promise<string> {
  if (mode === 'spa') return spaFetch(url, progress, opts);
  let html: string;
  try {
    html = await ssrFetch(url, progress, headers);
  } catch (e) {
    // auto：静态被拦（403/挑战页）通常是 WAF 首包拦截，直接上浏览器比重试更划算
    if (mode === 'auto' && !(e instanceof ChallengeError)) {
      progress?.log('静态抓取被拦，回退 Playwright 渲染…');
      return spaFetch(url, progress, opts);
    }
    throw e;
  }
  if (mode === 'ssr') return html;
  if (html.length < 800) {
    progress?.log('静态抓取内容偏少，回退 Playwright 渲染…');
    return spaFetch(url, progress, opts);
  }
  return html;
}

async function ssrFetch(
  url: string,
  progress?: Progress,
  headers?: Record<string, string>,
): Promise<string> {
  progress?.log(`GET ${url} (ssr)`);
  // 与 SPA 分支对齐补齐浏览器头（docs/16 C4）：部分 WAF 对缺 sec-ch-ua / Accept 头的请求直接拦截
  const res = await fetch(url, {
    headers: {
      'user-agent': DEFAULT_UA,
      'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'accept-language': 'en-US,en;q=0.9',
      'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'upgrade-insecure-requests': '1',
      ...headers,
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} @ ${url}`);
  const html = await res.text();
  // 挑战页常返回 200：不识别就会被当成「正常页但 0 锚点」→ 静默数据缺失
  const hit = detectChallenge(html);
  if (hit) throw new ChallengeError(hit.kind, url, hit.matched);
  return html;
}

// ── spa 渲染稳定检测（自适应，替代固定延时）─────────────────────────────
// 背景：不少站（ATCC/Coveo、ptglab 等）在 load 之后才异步挂载结果卡，过早 page.content()
// 只能拿到空壳。固定 sleep 要么浪费（快站白等）、要么不够（慢站 0 条）。
// 方案：轮询 DOM 签名（outerHTML 长度），连续 STABLE_CHECKS 次不增长即视为稳定。
// 不用「重试+指数退避」：解析 0 条在本系统是合法语义（空栏目自动停页），
// 重试层无法区分「没渲染完」和「真的没有」，会翻倍耗时甚至死循环。
const SPA_POLL_MS = 400; // 轮询间隔
const SPA_STABLE_CHECKS = 2; // 连续 N 次签名不变 → 稳定
const SPA_MIN_WAIT_MS = 800; // 最短观察窗：防初始空壳直接返回
// 上限可用 env 放宽（慢站/弱网）：视觉上「还在转圈」多数是图片/字体在拖，
// DOM+XHR 数据早已就位；但首屏 XHR 特别慢的站确实需要更长观察窗。
// 注意：必须以 process.env.X 点号访问（envContract 契约测试静态扫描此形态）。
function envMs(raw: string | undefined, fallback: number): number {
  const v = Number(raw);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}
const SPA_MAX_WAIT_MS = envMs(process.env.CRAWL_SPA_MAX_WAIT, 30_000); // 硬上限：长连接/时钟类页面兜底，防无限等
const SPA_NETWORK_WAIT_MS = envMs(process.env.CRAWL_SPA_NETWORK_WAIT, 18_000); // networkidle 未发生时，至少观察这么久才准提前返回
const CHALLENGE_WAIT_ROUNDS = 5; // 挑战页自动放行轮数（CF 5 秒盾通常 3~8s 放行）
const CHALLENGE_WAIT_MS = 6_000; // 每轮等待
/** goto 超时可调（跨境慢站 45s 可能不够）：CRAWL_GOTO_TIMEOUT */
export const GOTO_TIMEOUT_MS = envMs(process.env.CRAWL_GOTO_TIMEOUT, 45_000);

/** 无头开关（默认有头：本机桌面更隐蔽、过盾率高；CI/无显示环境 CRAWL_BROWSER_HEADLESS=true） */
export function headlessEnv(): boolean {
  return process.env.CRAWL_BROWSER_HEADLESS === 'true' || process.env.CRAWL_BROWSER_HEADLESS === '1';
}

/**
 * 等待页面「网络 + DOM」双稳定，快站 ~2-3s 返回，慢站自动多等。
 *
 * ATCC 实测教训（两层缺一不可）：
 * - 仅 DOM 签名检测会**假稳定**：SPA 的 DOM 分块爆发式挂载，两波之间静默 >1s 很常见；
 * - 仅 networkidle 会**等不到**：埋点长轮询让 networkidle 永不触发（超时）。
 * 放行条件：DOM 连续稳定 且（networkidle 已发生 或 已观察满 NETWORK_WAIT）。
 * 不用「重试+指数退避」：解析 0 条在本系统是合法语义（空栏目自动停页），
 * 重试层无法区分「没渲染完」和「真的没有」，会翻倍耗时甚至死循环。
 */
export async function waitForSpaSettle(page: import('playwright').Page): Promise<void> {
  const start = Date.now();
  let networkSettled = false;
  page
    .waitForLoadState('networkidle', { timeout: SPA_NETWORK_WAIT_MS })
    .then(() => {
      networkSettled = true;
    })
    .catch(() => {}); // 埋点长轮询站永不 networkidle：由观察窗兜底

  let lastSig = -1;
  let stable = 0;
  while (Date.now() - start < SPA_MAX_WAIT_MS) {
    let sig: number;
    try {
      sig = await page.evaluate(() => document.documentElement.outerHTML.length);
    } catch {
      return; // 页面已关闭/导航中：交给上层处理
    }
    stable = sig === lastSig ? stable + 1 : 0;
    lastSig = sig;

    const elapsed = Date.now() - start;
    const quiet = stable >= SPA_STABLE_CHECKS && elapsed >= SPA_MIN_WAIT_MS;
    const networkOk = networkSettled || elapsed >= SPA_NETWORK_WAIT_MS;
    if (quiet && networkOk) return;

    await page.waitForTimeout(SPA_POLL_MS);
  }
}

/**
 * 挑战页处理（三层递进）：
 * 1. 非交互型挑战（CF「Just a moment」）：轮询等待自动放行（5 轮×6s）——
 *    sweep 实测教训：reCAPTCHA / PerimeterX / Imperva / IP-ban 属交互型，等多久都不放行；
 * 2. 交互型挑战 + 有头 + CRAWL_INTERACTIVE≠false：**等待人工过盾**（最长 180s）——
 *    用户在弹出的浏览器窗口里点一次验证码/滑块，程序检测到挑战消失即通过；
 * 3. 过盾成功（自动或人工）→ **storageState 持久化**到 `.runtime/state/<host>.json`，
 *    后续所有轮次自动加载 cookie，不再触发挑战（人工过盾一次、长期复用）。
 */
function isAutoPassableChallenge(hit: ChallengeHit): boolean {
  if (hit.kind !== 'cloudflare') return false; // 其余类型（captcha/px/imperva/aliyun）均需人工交互
  return /just a moment|checking your browser|enable javascript and cookies/i.test(hit.matched);
}

function interactive(): boolean {
  return process.env.CRAWL_INTERACTIVE !== 'false' && process.env.CRAWL_INTERACTIVE !== '0';
}

/** 会话持久化路径：按站点 host 一档（人工过盾成果长期复用的载体） */
function statePathOf(url: string): string {
  const host = new URL(url).hostname;
  return join(repoRoot, '.runtime', 'state', `${host}.json`);
}

const HUMAN_WAIT_ROUNDS = 36; // 人工过盾等待：36 × 5s = 180s
const HUMAN_WAIT_MS = 5_000;

async function waitForChallengePass(
  page: import('playwright').Page,
  ctx: import('playwright').BrowserContext,
  url: string,
  progress?: Progress,
): Promise<string> {
  let html = await page.content();
  let hit = detectChallenge(html);
  for (let i = 0; hit && isAutoPassableChallenge(hit) && i < CHALLENGE_WAIT_ROUNDS; i++) {
    progress?.log(`挑战页[${hit.kind}] 等待自动放行 ${i + 1}/${CHALLENGE_WAIT_ROUNDS}（${hit.matched}）`);
    await page.waitForTimeout(CHALLENGE_WAIT_MS);
    await waitForSpaSettle(page);
    html = await page.content();
    hit = detectChallenge(html);
  }
  // 交互型挑战：有头 + 允许交互时，等用户在浏览器窗口里人工过盾
  if (hit && interactive() && !headlessEnv()) {
    const sp = statePathOf(url);
    progress?.log(`挑战页[${hit.kind}] 请在弹出的浏览器窗口完成人机验证（最长 ${Math.round((HUMAN_WAIT_ROUNDS * HUMAN_WAIT_MS) / 1000)}s），通过后会话将持久化`);
    for (let i = 0; hit && i < HUMAN_WAIT_ROUNDS; i++) {
      await page.waitForTimeout(HUMAN_WAIT_MS);
      html = await page.content();
      hit = detectChallenge(html);
    }
    if (!hit) {
      try {
        mkdirSync(dirname(sp), { recursive: true });
        await ctx.storageState({ path: sp });
        progress?.log(`人工过盾成功，会话已持久化 → ${sp}（后续轮次自动复用，不再弹盾）`);
      } catch { /* 持久化失败不影响本次结果 */ }
      await waitForSpaSettle(page);
      return await page.content();
    }
  }
  if (hit) throw new ChallengeError(hit.kind, url, hit.matched);
  return html;
}

async function spaFetch(url: string, progress?: Progress, opts: FetchOpts = {}): Promise<string> {
  progress?.log(`GET ${url} (spa/playwright)`);
  const { chromium } = await import('playwright');
  const headless = opts.headless ?? headlessEnv();
  const browser = await chromium.launch({ args: stealthArgs({ headless }), headless });
  try {
    const env: StealthEnv = { ...DEFAULT_STEALTH_ENV, ...(opts.stealth ?? {}) };
    // 会话复用：曾人工过盾的站点直接带 cookie 进场（.runtime/state/<host>.json）
    const sp = statePathOf(url);
    const ctx = await browser.newContext({
      ...stealthContextOptions(env),
      ...(existsSync(sp) ? { storageState: sp } : {}),
    });
    const page = await ctx.newPage();
    const profile = env.profile ?? 'mid';
    if (profile !== 'none') await page.addInitScript(stealthInitSource(profile));
    // 进站前留一点"读页面"的时间，避免 goto 即操作这种机器节奏
    await humanPause([350, 1200]);
    // 不用 networkidle 等待：ATCC/Coveo 这类站有长连接/埋点轮询，networkidle 永远等不到（超时）。
    // domcontentloaded + DOM 稳定检测即可覆盖「异步挂载后内容不再变化」的判定。
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: GOTO_TIMEOUT_MS });
    await waitForSpaSettle(page);
    return await waitForChallengePass(page, ctx, url, progress);
  } finally {
    await browser.close().catch(() => {});
  }
}

/**
 * 截取整页截图（JPEG，质量 70）——只给「模型兜底」在 `modelFallback.screenshot: true` 时用。
 *
 * 为何单独一个函数而不并要求 fetchPage 一起返回：截图需要真实渲染，成本远高于取 HTML，
 * 且只有少部分站点需要「读图」；让不需要的站点零成本。
 */
export async function fetchScreenshot(url: string, progress?: Progress): Promise<Buffer> {
  progress?.log(`PLAYWRIGHT 截图 ${url}`);
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ args: STEALTH_ARGS });
  try {
    const page = await newStealthPage(browser, { width: 1440, height: 900 });
    // SPA 站截图同样需要等渲染完成，否则截到的是空壳（与 spaFetch 同一套稳定检测）
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: GOTO_TIMEOUT_MS });
    await waitForSpaSettle(page);
    return await page.screenshot({ fullPage: true, type: 'jpeg', quality: 70 });
  } finally {
    await browser.close();
  }
}
