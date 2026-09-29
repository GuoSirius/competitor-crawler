/**
 * 零依赖并发限制（docs/16 P5）：语义同 p-limit 的 map 场景，
 * 项目原则「优先不新增依赖」，用 worker 池即可满足。
 *
 * - 结果按输入顺序返回（results[i] 对应 items[i]），与并发先后无关；
 * - limit <= 0 或 NaN → 按 1（串行）处理，不会失控；
 * - fn 抛错会整体 reject（调用方需要单条容错就在 fn 内部 catch，与 crawl 详情循环的用法一致）。
 */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  const n = Math.max(1, Math.min(Number.isFinite(limit) ? Math.floor(limit) : 1, items.length));
  let next = 0;
  const workers = Array.from({ length: Math.max(1, n) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}
