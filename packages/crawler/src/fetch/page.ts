import { Progress } from '../util/progress.js';

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
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; CompetitorCrawler/0.1)' } });
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
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
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
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    // SPA 站截图同样需要等渲染完成，否则截到的是空壳（与 spaFetch 同一套稳定检测）
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await waitForSpaSettle(page);
    return await page.screenshot({ fullPage: true, type: 'jpeg', quality: 70 });
  } finally {
    await browser.close();
  }
}
