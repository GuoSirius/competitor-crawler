import { canonicalizeUrl, type ListItem } from '@competitor-crawler/shared';

/**
 * 按 key 唯一化（保留首个出现的元素，保持原顺序）。
 * 与 SQL 的 ON CONFLICT 语义一致：**先到者胜**。
 */
export function uniqueBy<T>(items: readonly T[], keyOf: (item: T) => string): T[] {
  const seen = new Set<string>();
  const kept: T[] = [];
  for (const item of items) {
    const key = keyOf(item);
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(item);
  }
  return kept;
}

/**
 * 列表阶段去重：按 `canonical(detailUrl)` 唯一化，返回去重结果与被丢弃的重复条数。
 *
 * 为什么必须做：列表页常把**同一个产品渲染两次**——
 *   · 双套模板：`<div class="pc">` + `<div class="web">` 各渲染一份相同的商品块；
 *   · 同一条目里有「图片链接」+「标题链接」两个 `<a href>`。
 * itemSelector 会把两条都命中，于是：
 *   1. 同一详情页被**抓取两次**（纯浪费，站点越大越明显）；
 *   2. `新增` 计数**虚高**（去重键相同，最终只落一行，日志却报两个）。
 * 去重键口径见 docs/03 §3.4：无站点产品 id 时即 `canonical(detailUrl)`，故此处按它去重与落库口径天然一致。
 *
 * 无 `detailUrl` 的条目直接丢弃（它们本就在详情阶段被 `filter` 掉，不计入 duplicates）。
 */
export function dedupeListItems(items: readonly ListItem[]): {
  items: ListItem[];
  duplicates: number;
} {
  const withUrl = items.filter((it) => (it.detailUrl ?? '') !== '');
  const kept = uniqueBy(withUrl, (it) => canonicalizeUrl(it.detailUrl));
  return { items: kept, duplicates: withUrl.length - kept.length };
}
