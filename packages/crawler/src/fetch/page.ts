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

async function spaFetch(url: string, progress?: Progress): Promise<string> {
  progress?.update(`GET ${url} (spa/playwright)`);
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle' });
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
    await page.goto(url, { waitUntil: 'networkidle' });
    return await page.screenshot({ fullPage: true, type: 'jpeg', quality: 70 });
  } finally {
    await browser.close();
  }
}
