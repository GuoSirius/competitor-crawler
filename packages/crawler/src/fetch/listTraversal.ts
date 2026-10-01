import type { ListTraversalConfig } from '../config/types.js';
import { fetchPage, waitForSpaSettle, type RenderMode } from './page.js';
import { stealthArgs, stealthContextOptions, stealthInitSource } from './antiBot.js';
import { humanClick, humanPause } from './human.js';
import { Progress } from '../util/progress.js';

export interface TraverseOpts {
  /** 列表页入口 */
  url: string;
  /** 翻页策略（见 docs/05 §5.4） */
  traversal: ListTraversalConfig;
  /** 列表页渲染模式：ssr=不启浏览器（仅单页）；spa/auto=用 Playwright 翻页 */
  listMode: RenderMode;
  /** 最大翻页数（含首页） */
  maxPages: number;
  /**
   * 终止页码（闭区间，含本页）；缺省不限。仅 pagination-url 策略生效
   * （ssr 单页 / spa UI 点击无法按页码跳页，语义不成立故忽略）。
   */
  pageEnd?: number;
  progress?: Progress;
  /**
   * 每页回调：解析该页 HTML，返回本页解析出的条目数（供翻页终止判断）。
   * 返回 0 视为「本页无条目 → 终止翻页」。
   */
  onPage: (html: string, pageNo: number, pageUrl: string) => number | Promise<number>;
  /**
   * 附加到每页 ssr 请求的头（如代码适配器 preflight 拿到的 Cookie，docs/16 🔴-2）。
   * spa（Playwright）模式由浏览器自管 Cookie，此参数忽略。
   */
  headers?: Record<string, string>;
  /**
   * 自定义翻页 URL 拼装（代码适配器 buildPageUrl 钩子）：返回 null/undefined/空串时
   * 走默认 buildPageUrl 逻辑。仅 pagination-url 策略生效。
   */
  buildPageUrlFn?: (base: string, template: string, page: number) => string | null | undefined;
}

export interface TraverseResult {
  pages: number;
  items: number;
  /** pagination-url 策略下抓取失败（重试耗尽）被跳过的页码列表；其它策略恒为空 */
  missingPages: number[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * 拼装第 `page` 页的 URL（pagination-url 策略用）。
 *
 * @param base 当前正在翻页的入口 URL（traverseList 对 startUrls 数组逐个调用，
 *             每个入口各自以自己为 base 翻页——不是只用首个 startUrl）
 * @param template 含 `{page}` 占位符的模板，按**模板开头**字符判定写法：
 *   - 完整 URL（http(s):// 开头）：`https://x.com/a/b/{page}?cat=5` → 全局替换占位符，其余（含 ?query）原样保留
 *   - 绝对路径（/ 开头）：`/c/{page}` → 取 base 的 origin + 替换后的模板串（模板里的 ?query 同样保留）
 *   - 查询串后缀（? / & 开头）：`?page={page}` → 参数并进 base 的 query（覆盖同名参数，保留 base 其余参数）
 */
export function buildPageUrl(base: string, template: string, page: number): string {
  // hash/fragment 翻页防御：HTTP 协议不发送 # 之后的部分，服务器永远只收到第一页 URL，
  // 表现为「每页内容相同/0 条」的静默失败。早失败优于静默翻不动。
  if (template.includes('#')) {
    throw new Error(
      `urlTemplate 含 '#'（hash 翻页不被支持）：${template}` +
        ` —— HTTP 请求不发送 # 之后的部分，逐页 fetch 拿到的永远是第一页。` +
        `hash 路由站点请改用 render spa + pagination-html（UI 点击翻页），或改用等效的 ?query 翻页参数。`,
    );
  }
  const pageStr = String(page);
  // 1) 完整 URL：直接替换占位符
  if (/^https?:\/\//i.test(template)) {
    return template.replace(/\{page\}/g, pageStr);
  }
  // 2) 绝对路径：origin + 路径
  if (template.startsWith('/')) {
    const u = new URL(base);
    return `${u.origin}${template.replace(/\{page\}/g, pageStr)}`;
  }
  // 3) 查询串后缀：合并进 base 的 query（覆盖同名参数，不丢 base 原有参数）
  const merged = new URL(base);
  const qs = template.replace(/^[?&]/, '');
  const params = new URLSearchParams(qs);
  for (const [k, v] of params) {
    merged.searchParams.set(k, v.replace(/\{page\}/g, pageStr));
  }
  return merged.toString();
}

/**
 * 列表翻页驱动：统一在 listTraversal 声明，Fetch 层据此驱动浏览器。
 *
 * 设计原则（见 docs/05 §5.4）：默认**优先用浏览器渲染内容，不主动逆向接口**；
 * pagination-api / model-generic 当前同样走 UI 驱动（click / scroll），
 * 接口逆向仅作为后续「稳定、无签名站点」的性能优化。
 *
 * - ssr 模式：不启浏览器，仅抓单页（无 JS 翻页能力）。
 * - spa/auto 模式：用 Playwright 翻页；Playwright 不可用时回退单页 fetchPage。
 * - pagination-url 模式：不改写 HTML、不启浏览器，按 maxPages 顺序拼 URL 逐页抓取。
 */
export async function traverseList(opts: TraverseOpts): Promise<TraverseResult> {
  const { url, traversal, listMode, maxPages } = opts;
  // 翻页上限语义（「显式意图放行」）：
  // - 显式配置（YAML traversal.maxPages / CLI --pages，二者取小）→ 尊重配置，不受 500 限制；
  // - 两边都没显式配置（YAML 未写 maxPages 且 CLI 未传 --pages）→ 500 硬兜底，
  //   防配置失误导致的意外无限翻页（静默写入海量数据）。
  const explicit = Math.min(traversal.maxPages ?? Number.POSITIVE_INFINITY, maxPages);
  const max = Math.max(1, Number.isFinite(explicit) ? explicit : 500);

  // URL 模板翻页：不改写 HTML、不启浏览器，按 maxPages 顺序拼 URL 逐页抓取。
  // pageStart/pageEnd 仅本策略支持（URL 可精确定位页码；ssr 单页 / spa UI 点击无法跳页）
  if (traversal.strategy === 'pagination-url') {
    if (!traversal.urlTemplate) {
      throw new Error('pagination-url 策略必须提供 urlTemplate（含 {page} 占位）');
    }
    const pageStart = traversal.pageStart ?? 1;
    const pageEnd = opts.pageEnd;
    // 单页抓取失败重试次数（docs/16 规模化兜底）：默认 1（首次失败后再试 1 次）；
    // 0 = 不重试。重试耗尽仍失败 → 跳过该页、记缺失页、继续翻下一页（不再静默终止整轮，避免「个别失败前功尽弃」）。
    const listRetry = Math.max(0, traversal.listRetry ?? 1);
    let pages = 0;
    let items = 0;
    const missingPages: number[] = [];
    for (let p = pageStart; p < pageStart + max; p++) {
      if (pageEnd !== undefined && p > pageEnd) break; // 终止页（闭区间）已翻过
      // 适配器钩子优先（返回空值走默认拼装逻辑，docs/16 🔴-2）
      const pageUrl =
        opts.buildPageUrlFn?.(url, traversal.urlTemplate, p) || buildPageUrl(url, traversal.urlTemplate, p);
      opts.progress?.log(`[traverse] 列表 第${p}页 ${pageUrl}`);
      // 重试：首次失败后再试 listRetry 次；全部失败才跳过该页继续
      let html: string | null = null;
      let lastErr = '';
      for (let attempt = 0; attempt <= listRetry; attempt++) {
        try {
          html = await fetchPage(pageUrl, listMode, opts.progress, opts.headers);
          break;
        } catch (e) {
          lastErr = (e as Error).message;
          if (attempt < listRetry) {
            opts.progress?.log(`[traverse] 第 ${p} 页抓取失败，重试 ${attempt + 1}/${listRetry}：${lastErr}`);
            await sleep(800 * (attempt + 1)); // 简单线性退避，避免瞬时抖动连续失败
          }
        }
      }
      if (html === null) {
        // 重试耗尽仍失败：记录缺失页、强告警、跳到下一页（不终止整轮翻页）
        missingPages.push(p);
        opts.progress?.log(`[traverse] 第 ${p} 页抓取失败（重试 ${listRetry} 次仍失败），跳过该页继续：${lastErr}`);
        continue;
      }
      const n = await opts.onPage(html, p, pageUrl);
      pages++;
      items += n;
      if (n === 0) break; // 本页无条目 → 视为末页
    }
    return { pages, items, missingPages };
  }

  // none：显式禁用翻页 —— 只抓第一页（按 listMode 渲染：spa 走浏览器、ssr 直接 fetch），
  // 不进入任何翻页循环。用于「站点级配了 pagination-url，但本栏目一次请求全量返回」的局部关停。
  if (traversal.strategy === 'none') {
    const html = await fetchPage(url, listMode, opts.progress, opts.headers);
    const n = await opts.onPage(html, 1, url);
    return { pages: 1, items: n, missingPages: [] };
  }

  // ssr：无浏览器，单页
  if (listMode === 'ssr') {
    const html = await fetchPage(url, 'ssr', opts.progress, opts.headers);
    const n = await opts.onPage(html, 1, url);
    return { pages: 1, items: n, missingPages: [] };
  }

  let browser: import('playwright').Browser | null = null;
  try {
    const { chromium } = await import('playwright');
    // 与 spaFetch 同口径 stealth：旧实现这里用的是裸 launch（无 initScript、无 timezone/locale），
    // 「点下一页」比「取 HTML」更像真人操作，反而反检测最弱 —— 补上。
    const headless = process.env['CRAWL_BROWSER_HEADLESS'] === 'true' || process.env['CRAWL_BROWSER_HEADLESS'] === '1';
    browser = await chromium.launch({ args: stealthArgs({ headless }), headless });
  } catch (e) {
    // Playwright 不可用（未安装内核等）→ 回退单页，保证不整轮失败
    opts.progress?.log(`[traverse] Playwright 不可用，回退单页抓取：${(e as Error).message}`);
    const html = await fetchPage(url, 'ssr', opts.progress, opts.headers);
    const n = await opts.onPage(html, 1, url);
    return { pages: 1, items: n, missingPages: [] };
  }

  let pages = 0;
  let items = 0;
  try {
    const ctx = await browser.newContext(stealthContextOptions());
    await ctx.addInitScript(stealthInitSource('mid'));
    const page = await ctx.newPage();
    await humanPause([400, 1400]);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    // SPA 首屏异步挂载（ATCC/Coveo 等在 load 后才渲染结果卡）：DOM 稳定自适应等待，
    // 否则首次 page.content() 拿到空壳 → 解析 0 条直接终止
    await waitForSpaSettle(page);

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

  return { pages, items, missingPages: [] };
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

    // 拟人点击：贝塞尔轨迹 + 元素内随机落点 + 前后随机停顿（替代原生瞬移点击）
    await humanClick(loc);
    // 等待重渲染：networkidle 可能不触发，兜底用随机停顿（固定 1200ms 也是机器特征）
    await Promise.race([
      page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {}),
      humanPause([900, 2600]),
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
