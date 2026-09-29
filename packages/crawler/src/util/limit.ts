/**
 * 详情抓取并发数（CRAWL_DETAIL_CONCURRENCY，docs/16 P5）：
 * - 合法正整数（>0）→ 直接使用；
 * - 0 / 未设 / 非法值 → 按 **CPU 核心数** 动态设定（不同机器自适应，抓取是 IO 密集，
 *   核数只是保守起点；想更高在 .env 显式调大即可）。
 *
 * 并发执行本身交由第三方 `p-limit`（docs/16 P5：用户明确要求「能复用现成就直接用，不重复造轮子」）。
 * crawl.ts 内 `pLimit(detailConcurrency())` 即可获得限流器。
 */
import os from 'node:os';

export function detailConcurrency(): number {
  const raw = Number(process.env.CRAWL_DETAIL_CONCURRENCY);
  if (Number.isInteger(raw) && raw > 0) return raw;
  return Math.max(1, os.cpus().length);
}
