/**
 * 行为层拟人：鼠标轨迹、点击偏移、滚动、停顿。
 *
 * 现状基线：翻页/点击用的是 playwright 原生 `locator.click()`——直线瞬移到元素中心，
 * 间隔固定 1200ms，这是行为层最典型的机器特征。这里统一封装成"人样"的交互。
 *
 * 原则（对齐 antiBot.ts 的分层）：
 * - 鼠标走**带抖动的二次贝塞尔**，不是直线 lerp；
 * - 点击点落在元素 30%~70% 区间随机位置，不是永远正中；
 * - 停顿区间随机，偶尔拉长（人不会每页都一个节奏）；
 * - 下载/翻页这类操作前后都要有"读页面"的时间，不能一帧到底。
 */

type PlaywrightPage = import('playwright').Page;
type Locator = import('playwright').Locator;

export type DelayRange = [number, number];

export const DEFAULT_DELAY: DelayRange = [600, 1800];

function rand(range: DelayRange | number): number {
  return typeof range === 'number' ? range : range[0] + Math.random() * (range[1] - range[0]);
}

/** 随机停顿（毫秒） */
export function humanPause(range: DelayRange = DEFAULT_DELAY): Promise<void> {
  return sleep(Math.round(rand(range)));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** 带随机结束抖动的二次贝塞尔曲线插值点 */
function bezier(from: { x: number; y: number }, to: { x: number; y: number }, t: number) {
  const cx0 = from.x + (to.x - from.x) * (0.4 + Math.random() * 0.2);
  const cy0 = from.y + (to.y - from.y) * (0.4 + Math.random() * 0.2) - 20 - Math.random() * 60;
  const inv = 1 - t;
  return {
    x: inv * inv * from.x + 2 * inv * t * cx0 + t * t * to.x,
    y: inv * inv * from.y + 2 * inv * t * cy0 + t * t * to.y,
  };
}

/** 分步移动鼠标到目标点（贝塞尔 + 抖动），模拟真人手抖 */
export async function humanMove(page: PlaywrightPage, to: { x: number; y: number }, steps = 12): Promise<void> {
  // playwright 公开 API 拿不到当前鼠标位：用视口边缘作起点（曲线照样带抖动）
  const from = { x: 0, y: 0 };
  for (let i = 1; i <= steps; i++) {
    const p = bezier(from, to, i / steps);
    await page.mouse.move(p.x, p.y);
    await sleep(8 + Math.random() * 18);
  }
  await page.mouse.move(to.x + (Math.random() - 0.5) * 2, to.y + (Math.random() - 0.5) * 2);
}

/** 拟人滚动：多次、不同步长、中间带停顿（不一次到底） */
export async function humanScroll(page: PlaywrightPage, times = 3): Promise<void> {
  for (let i = 0; i < times; i++) {
    const dy = 300 + Math.random() * 700;
    await page.mouse.wheel(0, dy).catch(() => {});
    await humanPause([180, 620]);
  }
}

/** 拟人点击：滚动到可视 → 随机落点 → 贝塞尔移动 → 停顿 → 带 delay 的按下/抬起 */
export async function humanClick(
  locator: Locator,
  opts: { scroll?: boolean } = {},
): Promise<void> {
  if (opts.scroll !== false) {
    await locator.scrollIntoViewIfNeeded().catch(() => {});
    await humanPause([150, 450]);
  }
  const box = await locator.boundingBox().catch(() => null);
  if (!box) {
    await locator.click({ timeout: 15000 }).catch(() => {});
    return;
  }
  const target = {
    x: box.x + box.width * (0.3 + Math.random() * 0.4),
    y: box.y + box.height * (0.3 + Math.random() * 0.4),
  };
  const viewport = box.y < 0 || box.y + box.height > 1080;
  if (viewport) await humanScroll(locator.page(), 1);
  await humanMove(locator.page(), target);
  await humanPause([120, 380]);
  await locator.click({ position: { x: target.x - box.x, y: target.y - box.y }, timeout: 15000 }).catch(() => {});
}
