// URL 规范化与去重键（单一事实源，见 docs/03 §3.4）
//
// 统一规则（站点间共用，保证「有站点产品 id 用 id、无 id 用 canonical(detail_url)」都不重复）：
//   1) 相对链接 → 绝对链接（基于列表页 URL 解析）
//   2) canonical：去 # 锚点 → 去 utm_* / gclid / fbclid 等追踪参数 → 去末尾 / → 转小写
//   3) dedupe_key = COALESCE(source_product_id, canonical(detail_url))
//
// ⚠️ 货号（sku）**不参与**去重：货号是产品级唯一，同货号可对应多张规格页，
//    拿它当去重键会误合并。去重键须表达「页面级」唯一。

/** 追踪参数（小写匹配）：不参与去重，canonical 时剔除 */
const TRACKING_PARAM = /^(utm_|gclid$|fbclid$|spm$|scm$|from$|ref$)/i;

/** 把列表页里取到的相对链接解析为绝对链接；失败则原样返回 */
export function absoluteUrl(href: string | null | undefined, base: string): string {
  const h = (href ?? '').trim();
  if (!h) return '';
  try {
    return new URL(h, base).toString();
  } catch {
    return h;
  }
}

/**
 * 规范化 URL 作为去重键（canonical(detail_url)）。
 * 失败（非合法 URL）时退化为「trim + 小写」，保证仍有稳定键。
 */
export function canonicalizeUrl(raw: string | null | undefined): string {
  const s = (raw ?? '').trim();
  if (!s) return '';
  try {
    const u = new URL(s);
    // 去锚点
    u.hash = '';
    // 去追踪参数，保留其余（保持相对顺序）
    const kept: Array<[string, string]> = [];
    u.searchParams.forEach((value, key) => {
      if (!TRACKING_PARAM.test(key)) kept.push([key, value]);
    });
    const path = u.pathname.replace(/\/+$/, '') || '/';
    const query = kept.length ? `?${new URLSearchParams(kept).toString()}` : '';
    return `${u.origin}${path}${query}`.toLowerCase();
  } catch {
    return s.toLowerCase();
  }
}

/** 取域名（hostname）；非法 URL 返回空串 */
export function domainOf(url: string | null | undefined): string {
  try {
    return new URL((url ?? '').trim()).hostname.toLowerCase();
  } catch {
    return '';
  }
}

/** 去重键：优先站点自身 SKU，否则用规范化详情链接（COALESCE，见 docs/03 §3.4） */
export function pickDedupeKey(sourceProductId: string | null | undefined, detailUrl: string | null | undefined): string {
  const pid = (sourceProductId ?? '').trim();
  if (pid) return pid;
  return canonicalizeUrl(detailUrl);
}
