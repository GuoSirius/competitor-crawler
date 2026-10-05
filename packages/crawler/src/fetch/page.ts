import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { repoRoot } from '@competitor-crawler/shared';
import { Progress } from '../util/progress.js';
import {
  DEFAULT_STEALTH_ENV,
  maximizeWindow,
  stealthArgs,
  stealthContextOptions,
  stealthInitSource,
  type ChallengeKind,
  type ChallengeHit,
  type StealthEnv,
} from './antiBot.js';
import { humanPause, humanScroll } from './human.js';
import { assessChallenge } from './challenge.js';

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

/** 渲染模式：ssr=静态 fetch；browser=Playwright 渲染；auto=先 ssr，内容过少回退 browser */
export type RenderMode = 'ssr' | 'browser' | 'auto';

/**
 * 统一页面抓取：按渲染模式取 HTML。
 * - ssr 用 Node 原生 fetch（轻量、快）；
 * - browser 动态 import playwright，仅需要时加载，避免无谓依赖开销；
 * - auto 在 ssr 返回内容偏少时自动回退 Playwright，提升复杂站点的成功率。
 *
 * `headers`：附加请求头（如代码适配器 preflight 拿到的 Cookie，docs/16 🔴-2），
 * 合并进 ssr 默认浏览器头（同名键覆盖）；browser 模式由浏览器自管 Cookie，此参数忽略。
 */
export interface FetchOpts {
  /** 隐身/指纹环境（默认 DEFAULT_STEALTH_ENV：mid + Asia/Shanghai + zh-CN） */
  stealth?: Partial<StealthEnv>;
  /** 覆盖 headless（默认取 env CRAWL_BROWSER_HEADLESS，未设=有头，本机桌面更隐蔽） */
  headless?: boolean;
  /**
   * 列表容器等待选择器（仅 browser 通道）：goto 后先等其出现再 settle。
   * 接口渲染站（Algolia 等）数据请求晚于 networkidle，settle 会抓到 loading 空壳；
   * 由 listTraversal.waitSelector 透传，见 config/types.ts。
   */
  waitSelector?: string;
}

// 代理使用点：唯一裁决方是**站点/栏目 YAML 的 proxy**（经 loader 展开占位符后落到
// antiBot.proxy）。**配了就走、没配就直连**，代码层不做任何域名/地区黑名单——
// 哪个站该不该走代理是配置决策，写死在代码里会让后来人无从调整（见 docs/14 §5.5）。
// 空串视为未配置（loader 展开 `${CRAWL_PROXY}` 但环境变量没设时就是空串）。

export async function fetchPage(
  url: string,
  mode: RenderMode = 'auto',
  progress?: Progress,
  headers?: Record<string, string>,
  opts: FetchOpts = {},
): Promise<string> {
  if (mode === 'browser') return browserFetch(url, progress, opts);
  // 代理只在 YAML 显式配置时生效（站点/栏目 proxy / antiBot.proxy），默认空=直连。
  const proxy = opts.stealth?.proxy || undefined;
  let html: string;
  try {
    html = await ssrFetch(url, progress, headers, proxy);
  } catch (e) {
    // auto：静态被拦（403/挑战页）通常是 WAF 首包拦截，直接上浏览器比重试更划算
    if (mode === 'auto' && !(e instanceof ChallengeError)) {
      progress?.log('静态抓取被拦，回退 Playwright 渲染…');
      return browserFetch(url, progress, opts);
    }
    throw e;
  }
  if (mode === 'ssr') return html;
  if (html.length < 800) {
    progress?.log('静态抓取内容偏少，回退 Playwright 渲染…');
    return browserFetch(url, progress, opts);
  }
  return html;
}

/**
 * 代理模式下复用的浏览器实例：Node 原生 fetch 不认代理（既不读 http_proxy 环境变量，
 * 也没有 ProxyAgent —— undici 不是本项目依赖），所以走代理的 ssr 请求改用
 * Playwright 的 APIRequestContext（它天然吃 context 的 proxy 配置）。仅在配了代理时创建。
 */
let proxyBrowser: import('playwright').Browser | null = null;

async function ssrFetchViaProxy(
  url: string,
  headers: Record<string, string>,
  proxy: string,
): Promise<{ status: number; headers: Record<string, string>; body: string }> {
  const { chromium } = await import('playwright');
  if (!proxyBrowser || !proxyBrowser.isConnected()) {
    // ssr 通道不执行 JS，headless 更省资源（反爬维度上与浏览器通道无关）
    proxyBrowser = await chromium.launch({ headless: true, args: stealthArgs({ headless: true }) });
  }
  const ctx = await proxyBrowser.newContext({ proxy: { server: proxy } });
  try {
    const res = await ctx.request.get(url, { headers, timeout: GOTO_TIMEOUT_MS });
    return {
      status: res.status(),
      headers: Object.fromEntries(Object.entries(res.headers())),
      body: await res.text().catch(() => ''),
    };
  } finally {
    await ctx.close().catch(() => {});
  }
}

/**
 * 静态通道：Node 原生 fetch 取 HTML（不执行 JS、不开浏览器）。
 *
 * 导出给 `pnpm diagnose` 的 `ssr` 诊断通道复用 —— **必须是同一份实现**，否则诊断结论
 * 与正式抓取对不上（2026-10-05 踩过：diagnose 里自己写了一份裸 fetch，还误开了浏览器，
 * 报出来的 "ssr 403" 其实是有头浏览器的结果，会把结论带偏成「姿势问题」）。
 */
export async function ssrFetch(
  url: string,
  progress?: Progress,
  headers?: Record<string, string>,
  proxy?: string,
): Promise<string> {
  progress?.log(`GET ${url} (ssr${proxy ? ' / proxy' : ''})`);
  // 与 browser 分支对齐补齐浏览器头（docs/16 C4）：部分 WAF 对缺 sec-ch-ua / Accept 头的请求直接拦截
  const reqHeaders: Record<string, string> = {
    'user-agent': DEFAULT_UA,
    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'accept-language': 'en-US,en;q=0.9',
    'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'upgrade-insecure-requests': '1',
    ...headers,
  };

  if (proxy) {
    const r = await ssrFetchViaProxy(url, reqHeaders, proxy);
    const a = assessChallenge({ status: r.status, headers: r.headers, html: r.body });
    if (a.hit && a.confidence !== 'none') throw new ChallengeError(a.hit.kind, url, a.hit.matched);
    return r.body;
  }

  const res = await fetch(url, { headers: reqHeaders });
  const hdrs: Record<string, string> = {};
  res.headers.forEach((v, k) => {
    hdrs[k] = v;
  });
  // 非 2xx 也要读 body：403/412 页面本身常常就是 WAF 挑战页，只看状态码会漏判
  const html = res.ok ? await res.text() : ((await res.text().catch(() => '')) || '');
  // 挑战页常返回 200：不识别就会被当成「正常页但 0 锚点」→ 静默数据缺失
  const a = assessChallenge({ status: res.status, headers: hdrs, html });
  if (a.hit && a.confidence !== 'none') throw new ChallengeError(a.hit.kind, url, a.hit.matched);
  return html;
}

// ── browser 渲染稳定检测（自适应，替代固定延时）─────────────────────────────
// 背景：不少站（ATCC/Coveo、ptglab 等）在 load 之后才异步挂载结果卡，过早 page.content()
// 只能拿到空壳。固定 sleep 要么浪费（快站白等）、要么不够（慢站 0 条）。
// 方案：轮询 DOM 签名（outerHTML 长度），连续 STABLE_CHECKS 次不增长即视为稳定。
// 不用「重试+指数退避」：解析 0 条在本系统是合法语义（空栏目自动停页），
// 重试层无法区分「没渲染完」和「真的没有」，会翻倍耗时甚至死循环。
const BROWSER_POLL_MS = 400; // 轮询间隔
const BROWSER_STABLE_CHECKS = 2; // 连续 N 次签名不变 → 稳定
const BROWSER_MIN_WAIT_MS = 800; // 最短观察窗：防初始空壳直接返回
// 上限可用 env 放宽（慢站/弱网）：视觉上「还在转圈」多数是图片/字体在拖，
// DOM+XHR 数据早已就位；但首屏 XHR 特别慢的站确实需要更长观察窗。
// 注意：必须以 process.env.X 点号访问（envContract 契约测试静态扫描此形态）。
function envMs(raw: string | undefined, fallback: number): number {
  const v = Number(raw);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}
export const BROWSER_MAX_WAIT_MS = envMs(process.env.CRAWL_BROWSER_MAX_WAIT, 30_000); // 硬上限：长连接/时钟类页面兜底，防无限等
const BROWSER_NETWORK_WAIT_MS = envMs(process.env.CRAWL_BROWSER_NETWORK_WAIT, 18_000); // networkidle 未发生时，至少观察这么久才准提前返回
// 挑战页自动放行轮数（CF 托管挑战通常 3~8s 放行）；可用 env 放宽（慢站/跨境重导航耗时）。
// 必须以 process.env.X 点号访问（envContract 契约测试静态扫描此形态）。
export const CHALLENGE_WAIT_ROUNDS = envMs(process.env.CRAWL_CHALLENGE_ROUNDS, 8);
/** 每轮间隔：CF 托管挑战通常 3~8s 落 cookie，跨境/弱网更慢 → CRAWL_CHALLENGE_WAIT_MS */
export const CHALLENGE_WAIT_MS = envMs(process.env.CRAWL_CHALLENGE_WAIT_MS, 6_000);
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
 * - 仅 DOM 签名检测会**假稳定**：前端渲染站 DOM 分块爆发式挂载，两波之间静默 >1s 很常见；
 * - 仅 networkidle 会**等不到**：埋点长轮询让 networkidle 永不触发（超时）。
 * 放行条件：DOM 连续稳定 且（networkidle 已发生 或 已观察满 NETWORK_WAIT）。
 * 不用「重试+指数退避」：解析 0 条在本系统是合法语义（空栏目自动停页），
 * 重试层无法区分「没渲染完」和「真的没有」，会翻倍耗时甚至死循环。
 */
export async function waitForBrowserSettle(page: import('playwright').Page): Promise<void> {
  const start = Date.now();
  let networkSettled = false;
  page
    .waitForLoadState('networkidle', { timeout: BROWSER_NETWORK_WAIT_MS })
    .then(() => {
      networkSettled = true;
    })
    .catch(() => {}); // 埋点长轮询站永不 networkidle：由观察窗兜底

  let lastSig = -1;
  let stable = 0;
  while (Date.now() - start < BROWSER_MAX_WAIT_MS) {
    let sig: number;
    try {
      sig = await page.evaluate(() => document.documentElement.outerHTML.length);
    } catch {
      return; // 页面已关闭/导航中：交给上层处理
    }
    stable = sig === lastSig ? stable + 1 : 0;
    lastSig = sig;

    const elapsed = Date.now() - start;
    const quiet = stable >= BROWSER_STABLE_CHECKS && elapsed >= BROWSER_MIN_WAIT_MS;
    const networkOk = networkSettled || elapsed >= BROWSER_NETWORK_WAIT_MS;
    if (quiet && networkOk) return;

    await page.waitForTimeout(BROWSER_POLL_MS);
  }
}

/**
 * 挑战页处理（三层递进）：
 * 1. 非交互型挑战（CF「Just a moment」）：**重新导航 + 轮询重判**（默认 8 轮×5s）——
 *    ⚠️ 2026-10-05 关键修复：旧实现是「原地 waitForTimeout + settle 干等」，从不重新请求。
 *    但 Cloudflare 托管挑战的过盾机制是**挑战页 JS 写入 cf_clearance 后跳转回原 URL**，
 *    不重新导航就永远停在挑战页（实测 12 轮 60s + cookie 已生成，页面始终 403）。
 *    现在每轮都带 cookie 重新 goto，并在放行后**立即持久化 storageState**；
 * 2. 交互型挑战 + 有头 + CRAWL_INTERACTIVE≠false：**等待人工过盾**（最长 180s）——
 *    用户在弹出的浏览器窗口里点一次验证码/滑块，程序检测到挑战消失即通过；
 * 3. 过盾成功（自动或人工）→ **storageState 持久化**到 `.runtime/state/<host>.json`，
 *    后续所有轮次自动加载 cookie，不再触发挑战（人工过盾一次、长期复用）。
 */
/**
 * 这个挑战页能不能「等它自己过」。
 *
 * ⚠️ 2026-10-05 修的真实流程 bug：旧实现只按文案判
 * （`just a moment|checking your browser|...`），而 `assessChallenge` 的**响应头分支优先级最高**——
 * Cloudflare 托管挑战最稳的证据是 `cf-mitigated: challenge` 头，实测 BioLegend 就是这一档：
 * 命中头时 `matched` 形如 `cf-mitigated: challenge`，不含任何文案关键词 →
 * 旧判据返回 false → **整个重试循环被跳过，直接抛 ChallengeError 判死**。
 * 这就是「用户明明能打开、我却一直说被拦」的一个真实成因。
 *
 * 现在两路都认：
 * - 头证据（`cf-mitigated` / `cf-chl-*`）= 托管挑战的权威标记；
 * - 文案证据（`just a moment` 等）覆盖「头被剥掉但页面确实是挑战页」的情况。
 * 其余 kind（captcha/px/imperva/aliyun）默认需人工交互，仍走第 2 层。
 */
export function isAutoPassableChallenge(hit: ChallengeHit): boolean {
  if (hit.kind !== 'cloudflare') return false; // 其余类型（captcha/px/imperva/aliyun）均需人工交互
  return /^cf-mitigated|^cf-chl|cf_clearance|just a moment|checking your browser|enable javascript and cookies/i.test(
    hit.matched,
  );
}

function interactive(): boolean {
  return process.env.CRAWL_INTERACTIVE !== 'false' && process.env.CRAWL_INTERACTIVE !== '0';
}

/** 可见文本（排除 script/style）——检测挑战文案的干净信号源，比整页 HTML 准得多 */
async function pageInnerText(page: import('playwright').Page): Promise<string> {
  try {
    return await page.evaluate(() => document.body?.innerText ?? '');
  } catch {
    return ''; // 页面已跳转/关闭时退回整页 HTML 判定
  }
}

/** 页面里是否存在**真实可交互**的人机验证控件（DOM 侧判定，补正则之不足） */
async function hasCaptchaWidget(page: import('playwright').Page): Promise<boolean> {
  try {
    const n = await page
      .locator(
        [
          '#rc-anchor', // reCAPTCHA v2 checkbox
          'iframe[src*="recaptcha/anchor"]',
          'iframe[src*="recaptcha/frames"]',
          'iframe[src*="hcaptcha.com"]',
          '#px-captcha',
          'iframe[src*="perimeterx"]',
          '#h-captcha',
          'iframe[src*="turnstile"]',
        ].join(', '),
      )
      .count();
    return n > 0;
  } catch {
    return false; // DOM 查询失败（页面已关等）时不要硬判为误报
  }
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
  resp?: { status?: number; headers?: Record<string, string> },
): Promise<string> {
  let html = await page.content();
  let text = await pageInnerText(page);
  let hit = assessChallenge({ ...resp, html, innerText: text, domWidget: await hasCaptchaWidget(page) }).hit;
  // 兜底：正则可能命中「页面里存在的 reCAPTCHA 组件名」（如富文本编辑器白名单配置）。
  // 浏览器侧再查一次真实控件——页面里没有可点的验证控件就当正常页放行，别干等人工过盾。
  if (hit?.kind === 'captcha' && !(await hasCaptchaWidget(page))) {
    progress?.log(`挑战页[${hit.kind}] 疑似误报（匹配「${hit.matched}」但页面无验证控件），按正常页放行`);
    return html;
  }
  for (let i = 0; hit && isAutoPassableChallenge(hit) && i < CHALLENGE_WAIT_ROUNDS; i++) {
    progress?.log(`挑战页[${hit.kind}] 等待自动放行 ${i + 1}/${CHALLENGE_WAIT_ROUNDS}（${hit.matched}）—— 等盾 JS 落 cookie 后重新请求`);
    // 先在**挑战页上**留时间让它的 JS 跑完（cf_clearance 就是这一步写进 cookie 的）；
    // 立刻重导航会打断 JS 执行，永远等不到 cookie。
    await page.waitForTimeout(CHALLENGE_WAIT_MS);
    // ⚠️ 必须重新导航：不重新请求就永远停在挑战页（见上面函数注释的实测）
    try {
      const retry = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: GOTO_TIMEOUT_MS });
      // 重试后的状态码/风控头纳入判定（cf-mitigated 会在放行后消失）
      if (retry) {
        resp = { ...resp, status: retry.status(), headers: await retry.allHeaders() };
      }
    } catch {
      /* 重试失败按原响应继续判 */
    }
    await waitForBrowserSettle(page);
    html = await page.content();
    text = await pageInnerText(page);
    hit = assessChallenge({ ...resp, html, innerText: text, domWidget: await hasCaptchaWidget(page) }).hit;
    // 盾已过但只拿到软拦空壳（内容 <200 字符、无挑战特征）时给个明确说法，
    // 否则上层会把这个「可疑正常页」当成成功，白跑满轮次。
    if (!hit && !/<\w+/.test(html)) {
      progress?.log(`自动放行后页面仍是空壳（${html.length}B），判定为软风控放行`);
    }
  }
  // 自动放行（包括上面重新导航后不再命中）→ 立刻持久化 cookie，后续轮次免再过盾
  if (!hit) {
    const sp0 = statePathOf(url);
    try {
      mkdirSync(dirname(sp0), { recursive: true });
      await ctx.storageState({ path: sp0 });
      progress?.log(`自动过盾成功，会话已持久化 → ${sp0}（后续轮次自动复用，不再弹盾）`);
    } catch {
      /* 持久化失败不影响本次结果 */
    }
  }
  // 交互型挑战：有头 + 允许交互时，等用户在浏览器窗口里人工过盾
  let waitedHuman = false;
  if (hit && interactive() && !headlessEnv()) {
    waitedHuman = true;
    const sp = statePathOf(url);
    progress?.log(`挑战页[${hit.kind}] 请在弹出的浏览器窗口完成人机验证（最长 ${Math.round((HUMAN_WAIT_ROUNDS * HUMAN_WAIT_MS) / 1000)}s），通过后会话将持久化`);
    for (let i = 0; hit && i < HUMAN_WAIT_ROUNDS; i++) {
      await page.waitForTimeout(HUMAN_WAIT_MS);
      html = await page.content();
      text = await pageInnerText(page);
      hit = assessChallenge({ ...resp, html, innerText: text, domWidget: await hasCaptchaWidget(page) }).hit;
      // 每 30s 复述一次剩余时间：sweep 批量跑时长时间静默会被误认成卡死
      if (hit && (i + 1) % 6 === 0) {
        const left = (HUMAN_WAIT_ROUNDS - i - 1) * HUMAN_WAIT_MS / 1000;
        progress?.log(`  仍在等待人工过盾（剩余 ${left}s）：请在最前面的浏览器窗口点验证/划滑块`);
      }
    }
    if (!hit) {
      try {
        mkdirSync(dirname(sp), { recursive: true });
        await ctx.storageState({ path: sp });
        progress?.log(`人工过盾成功，会话已持久化 → ${sp}（后续轮次自动复用，不再弹盾）`);
      } catch { /* 持久化失败不影响本次结果 */ }
      await waitForBrowserSettle(page);
      return await page.content();
    }
  }
  if (hit) {
    // 失败要说清三件事：等没等到机会、是哪种拦截、下一步该动什么
    // （IP 级封禁与「指纹不过关」的处置完全不同，混为一谈就只能干等）
    const st = resp?.status;
    const ipBlocked = st !== undefined && st >= 400 && /attention required|sorry, you have been blocked/i.test(text);
    const advice = ipBlocked
      ? '返回的是 WAF **封禁页**（Attention Required / blocked），重试与改指纹都无效 → 换出口 IP（YAML 配 proxy）或放弃该站'
      : waitedHuman
        ? '人工过盾等满仍未通过（多为交互型滑块）→ 换出口 IP 或隔时段再试'
        : '未进入人工过盾（headless=true 或 CRAWL_INTERACTIVE=false）→ 用 CRAWL_BROWSER_HEADLESS=false 重跑';
    progress?.log(`挑战页[${hit.kind}] 未通过（${hit.matched}）${st ? ` HTTP ${st}` : ''}：${advice}`);
    throw new ChallengeError(hit.kind, url, hit.matched);
  }
  return html;
}

async function browserFetch(url: string, progress?: Progress, opts: FetchOpts = {}): Promise<string> {
  progress?.log(`GET ${url} (browser/playwright)`);
  const { chromium } = await import('playwright');
  const headless = opts.headless ?? headlessEnv();
  const env: StealthEnv = { ...DEFAULT_STEALTH_ENV, ...(opts.stealth ?? {}) };
  const browser = await chromium.launch({ args: stealthArgs({ headless, maximize: env.maximize }), headless });
  try {
    // 会话复用：曾人工过盾的站点直接带 cookie 进场（.runtime/state/<host>.json）
    const sp = statePathOf(url);
    const ctx = await browser.newContext({
      ...stealthContextOptions(env, { headless }),
      ...(existsSync(sp) ? { storageState: sp } : {}),
    });
    const page = await ctx.newPage();
    // 有头模式补一次最大化（--start-maximized 只对启动窗口生效，新上下文不一定继承）
    if (!headless && env.maximize !== false) await maximizeWindow(page);
    const profile = env.profile ?? 'mid';
    if (profile !== 'none') await page.addInitScript(stealthInitSource(profile));
    // 进站前留一点"读页面"的时间，避免 goto 即操作这种机器节奏
    await humanPause([350, 1200]);
    // 不用 networkidle 等待：ATCC/Coveo 这类站有长连接/埋点轮询，networkidle 永远等不到（超时）。
    // domcontentloaded + DOM 稳定检测即可覆盖「异步挂载后内容不再变化」的判定。
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: GOTO_TIMEOUT_MS });
    // 只取检测要用的几个头（playwright 的 headers() 返回标准 Headers，逐个 headerValue 更省事）
    const hdrs: Record<string, string> = {};
    if (resp) {
      for (const n of ['cf-mitigated', 'cf-chl-lb', 'x-px-class', 'x-px-content-type', 'x-captcha', 'server']) {
        const v = await resp.headerValue(n);
        if (v) hdrs[n] = v;
      }
    }
    const status = resp?.status();
    // 站点级等待：接口渲染站（Algolia 等）数据请求晚于 networkidle / DOM 稳定，
    // 先等列表容器真出现。超时**抛错**（上层 pagination-url 分支按 listRetry 重试、
    // 仍失败记缺失页继续）——接口渲染站偶发空壳率高，静默 0 条会被「0 条=末页」
    // 语义误判为翻页终止，整轮漏抓。
    if (opts.waitSelector) {
      const hit = await page
        .waitForSelector(opts.waitSelector, { state: 'visible', timeout: BROWSER_MAX_WAIT_MS })
        .catch(() => null);
      if (!hit) throw new Error(`waitSelector 未出现（${opts.waitSelector}，等满 ${BROWSER_MAX_WAIT_MS}ms）——接口渲染失败/空壳页`);
      if (process.env.CRAWL_DEBUG_DUMP) {
        const dbgInfo = await page
          .evaluate(() => ({
            url: location.href,
            items: document.querySelectorAll('li.ais-InfiniteHits-item').length,
            titles: document.querySelectorAll('li.ais-InfiniteHits-item .result-title').length,
            first: document.querySelector('li.ais-InfiniteHits-item .result-title')?.textContent?.trim().slice(0, 40) ?? null,
          }))
          .catch((e) => ({ err: String(e) }));
        progress?.log(`[browser][debug] 命中时页面状态: ${JSON.stringify(dbgInfo)}`);
      }
    }
    await waitForBrowserSettle(page);
    // 两阶段渲染复查（Bio X Cell / Algolia 实测）：列表容器会「先挂内容 → 随后整块重挂载」，
    // 上面 waitForSelector 命中的是**第一波**，settle 期间被清空 → 拿回 0 条空壳。
    // 现象是同站同配置时好时坏（首屏 XHR 快的轮次正常、慢的轮次 0 条）。
    // 判据用「选择器还在不在」而不是重等固定时长：消失就等它回来，仍不出现由上层 listRetry 兜。
    if (opts.waitSelector && !(await page.$(opts.waitSelector).then((h) => h !== null))) {
      progress?.log(`[browser] waitSelector ${opts.waitSelector} 在 settle 后消失（疑似重挂载），再等一轮`);
      await page
        .waitForSelector(opts.waitSelector, { state: 'visible', timeout: BROWSER_MAX_WAIT_MS })
        .catch(() => null);
    }
    // 懒加载兜底：华安这类站产品卡 loading=lazy，首屏稳定≠内容齐——滚一轮触发 lazyload，
    // 再等一次稳定（内容未增长时第二次 settle 很快，~1s 即放行）
    await humanScroll(page, 4);
    await waitForBrowserSettle(page);
    const htmlOut = await waitForChallengePass(page, ctx, url, progress, { status, headers: hdrs });
    if (process.env.CRAWL_DEBUG_DUMP) {
      const { writeFileSync, mkdirSync } = await import('node:fs');
      mkdirSync('../../.tmp/debug', { recursive: true });
      writeFileSync('../../.tmp/debug/browser-dump.html', htmlOut);
      progress?.log(`[browser][debug] html dumped, len=${htmlOut.length}`);
    }
    return htmlOut;
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
  // 截图只用于「模型读图」，固定视口保证版面稳定（不受 maximize / 显示器尺寸影响）
  const browser = await chromium.launch({ headless: true, args: stealthArgs({ headless: true }) });
  try {
    const page = await newStealthPage(browser, { width: 1440, height: 900 });
    // 浏览器渲染站截图同样需要等渲染完成，否则截到的是空壳（与 browserFetch 同一套稳定检测）
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: GOTO_TIMEOUT_MS });
    await waitForBrowserSettle(page);
    return await page.screenshot({ fullPage: true, type: 'jpeg', quality: 70 });
  } finally {
    await browser.close();
  }
}
