import { Progress } from '../util/progress.js';

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
const STEALTH_ARGS = [
  '--no-sandbox',
  '--disable-blink-features=AutomationControlled',
  '--disable-dev-shm-usage',
];

type Browser = import('playwright').Browser;
type Page = import('playwright').Page;

/** 开一个带 stealth 的页面（复用浏览器实例，跨站点调用降低启动开销）。 */
async function newStealthPage(browser: Browser, viewport?: { width: number; height: number }): Promise<Page> {
  const ctx = await browser.newContext({
    userAgent: DEFAULT_UA,
    locale: 'en-US',
    viewport,
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'Upgrade-Insecure-Requests': '1',
    },
  });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    try { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); } catch {}
    try { Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] as unknown as PluginArray }); } catch {}
    try { Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] }); } catch {}
  });
  return page;
}

/** 渲染模式：ssr=静态 fetch；spa=Playwright 渲染；auto=先 ssr，内容过少回退 spa */
export type RenderMode = 'ssr' | 'spa' | 'auto';

/**
 * 统一页面抓取：按渲染模式取 HTML。
 * - ssr 用 Node 原生 fetch（轻量、快）；
 * - spa 动态 import playwright，仅需要时加载，避免无谓依赖开销；
 * - auto 在 ssr 返回内容偏少时自动回退 Playwright，提升复杂站点的成功率。
 */
export async function fetchPage(url: string, mode: RenderMode = 'auto', progress?: Progress): Promise<string> {
  if (mode === 'spa') return spaFetch(url, progress);
  const html = await ssrFetch(url, progress);
  if (mode === 'ssr') return html;
  if (html.length < 800) {
    progress?.update('静态抓取内容偏少，回退 Playwright 渲染…');
    return spaFetch(url, progress);
  }
  return html;
}

async function ssrFetch(url: string, progress?: Progress): Promise<string> {
  progress?.update(`GET ${url} (ssr)`);
  const res = await fetch(url, { headers: { 'user-agent': DEFAULT_UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} @ ${url}`);
  return res.text();
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
const SPA_MAX_WAIT_MS = 20000; // 硬上限：长连接/时钟类页面兜底，防无限等
const SPA_NETWORK_WAIT_MS = 15000; // networkidle 未发生时，至少观察这么久才准提前返回

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

async function spaFetch(url: string, progress?: Progress): Promise<string> {
  progress?.update(`GET ${url} (spa/playwright)`);
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ args: STEALTH_ARGS });
  try {
    const page = await newStealthPage(browser);
    // 不用 networkidle 等待：ATCC/Coveo 这类站有长连接/埋点轮询，networkidle 永远等不到（超时）。
    // domcontentloaded + DOM 稳定检测即可覆盖「异步挂载后内容不再变化」的判定。
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await waitForSpaSettle(page);
    return await page.content();
  } finally {
    await browser.close();
  }
}

/**
 * 截取整页截图（JPEG，质量 70）——只给「模型兜底」在 `modelFallback.screenshot: true` 时用。
 *
 * 为何单独一个函数而不并要求 fetchPage 一起返回：截图需要真实渲染，成本远高于取 HTML，
 * 且只有少部分站点需要「读图」；让不需要的站点零成本。
 */
export async function fetchScreenshot(url: string, progress?: Progress): Promise<Buffer> {
  progress?.update(`PLAYWRIGHT 截图 ${url}`);
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ args: STEALTH_ARGS });
  try {
    const page = await newStealthPage(browser, { width: 1440, height: 900 });
    // SPA 站截图同样需要等渲染完成，否则截到的是空壳（与 spaFetch 同一套稳定检测）
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await waitForSpaSettle(page);
    return await page.screenshot({ fullPage: true, type: 'jpeg', quality: 70 });
  } finally {
    await browser.close();
  }
}
