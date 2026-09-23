import type { ListTraversalConfig } from '../config/types.js';
import { fetchPage, type RenderMode } from './page.js';
import { Progress } from '../util/progress.js';

export interface TraverseOpts {
  /** 列表页入口 */
  url: string;
  /** 翻页策略（见 docs/05 §5.4） */
  traversal: ListTraversalConfig;
  /** 渲染模式：ssr=不启浏览器（仅单页）；spa/auto=用 Playwright 翻页 */
  mode: RenderMode;
  /** 最大翻页数（含首页） */
  maxPages: number;
  progress?: Progress;
  /**
   * 每页回调：解析该页 HTML，返回本页解析出的条目数（供翻页终止判断）。
   * 返回 0 视为「本页无条目 → 终止翻页」。
   */
  onPage: (html: string, pageNo: number, pageUrl: string) => number | Promise<number>;
}

export interface TraverseResult {
  pages: number;
  items: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * 列表翻页驱动：统一在 listTraversal 声明，Fetch 层据此驱动浏览器。
 *
 * 设计原则（见 docs/05 §5.4）：默认**优先用浏览器渲染内容，不主动逆向接口**；
 * pagination-api / model-generic 当前同样走 UI 驱动（click / scroll），
 * 接口逆向仅作为后续「稳定、无签名站点」的性能优化。
 *
 * - ssr 模式：不启浏览器，仅抓单页（无 JS 翻页能力）。
 * - spa/auto 模式：用 Playwright 翻页；Playwright 不可用时回退单页 fetchPage。
 */
export async function traverseList(opts: TraverseOpts): Promise<TraverseResult> {
  const { url, traversal, mode, maxPages } = opts;
  // 取「调用方上限 / 配置上限 / 硬上限 500」三者最小，防意外无限翻页
  const configured = traversal.maxPages ?? maxPages;
  const max = Math.max(1, Math.min(configured, maxPages, 500));

  // ssr：无浏览器，单页
  if (mode === 'ssr') {
    const html = await fetchPage(url, 'ssr', opts.progress);
    const n = await opts.onPage(html, 1, url);
    return { pages: 1, items: n };
  }

  let browser: import('playwright').Browser | null = null;
  try {
    const { chromium } = await import('playwright');
    browser = await chromium.launch();
  } catch (e) {
    // Playwright 不可用（未安装内核等）→ 回退单页，保证不整轮失败
    opts.progress?.update(`[traverse] Playwright 不可用，回退单页抓取：${(e as Error).message}`);
    const html = await fetchPage(url, 'ssr', opts.progress);
    const n = await opts.onPage(html, 1, url);
    return { pages: 1, items: n };
  }

  let pages = 0;
  let items = 0;
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    while (pages < max) {
      const html = await page.content();
      const pageUrl = page.url();
      const n = await opts.onPage(html, pages + 1, pageUrl);
      pages++;
      items += n;

      if (n === 0) break; // 本页无条目 → 视为结束
      if (pages >= max) break;

      const strategy = traversal.strategy;
      if (strategy === 'scroll-api') {
        const grown = await scrollOnce(page);
        if (!grown) break; // 高度不再增长 → 到底
        continue;
      }

      // pagination-html / pagination-api / model-generic：UI 点击下一页
      const clicked = await clickNext(page, traversal.nextSelector);
      if (!clicked) break;
    }
  } finally {
    await browser.close().catch(() => {});
  }

  return { pages, items };
}

/** 点下一页；成功返回 true，找不到/不可点/异常返回 false（终止翻页） */
async function clickNext(page: import('playwright').Page, nextSelector?: string): Promise<boolean> {
  if (!nextSelector) return false;
  try {
    const loc = page.locator(nextSelector).first();
    if ((await loc.count()) === 0) return false;
    // 禁用态判定：class 含 disabled / aria-disabled="true" / 无 href 的 <a>
    const disabled = await loc.evaluate((el: Element) => {
      const cls = (el.getAttribute('class') || '').toLowerCase();
      const aria = (el.getAttribute('aria-disabled') || '').toLowerCase();
      const isAnchor = el.tagName.toLowerCase() === 'a';
      const href = el.getAttribute('href');
      return cls.includes('disabled') || aria === 'true' || (isAnchor && (!href || href === '#'));
    });
    if (disabled) return false;

    await loc.click({ timeout: 15000 });
    // 等待重渲染：networkidle 可能不触发，兜底固定短延时
    await Promise.race([
      page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {}),
      sleep(1200),
    ]);
    return true;
  } catch {
    return false;
  }
}

/** 滚动一次到底，返回页面高度是否较上次增长 */
async function scrollOnce(page: import('playwright').Page): Promise<boolean> {
  const before = await page.evaluate(() => document.body.scrollHeight);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await Promise.race([
    page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {}),
    sleep(1200),
  ]);
  const after = await page.evaluate(() => document.body.scrollHeight);
  return after > before;
}
