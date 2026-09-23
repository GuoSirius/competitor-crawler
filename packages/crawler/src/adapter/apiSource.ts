// 应用「异步接口数据源」（形态 D，见 docs/05 §5.3.4）。
// 由 crawl（落库）与 probe（验证接口是否可通）共用，保证两侧行为一致。

import { renameKeys, walkPath, type NormalizedProduct } from '@competitor-crawler/shared';
import { fetchJson, interpolate } from '../fetch/jsonApi.js';
import type { ApiSourceConfig } from '../config/types.js';

export interface ApiSourceResult {
  target: string;
  url: string;
  ok: boolean;
  /** 数组则为条数；非数组成功为 1 */
  count?: number;
  /** 失败原因 */
  error?: string;
  /** 取到的原始（已定位、已重命名）值，便于 probe 打印样本 */
  picked?: unknown;
}

/**
 * 按配置逐个请求接口 → 定位(rootPath) → 键重命名(pick) → 写入目标字段。
 * - `target` 为 `specs` / `introMedia` 且结果是数组时写入对应内置字段；否则写入 `row[target]`
 * - 单个源失败不影响其他源（错误记在返回值里）
 */
export async function applyApiSources(
  np: NormalizedProduct,
  detailUrl: string,
  sources: ApiSourceConfig[],
): Promise<ApiSourceResult[]> {
  // 插值上下文：详情页已抽到的字段（含 row 兜底）+ 详情链接
  const ctx: Record<string, unknown> = {
    ...np.row,
    detailUrl,
    name: np.name ?? '',
    sku: np.sku ?? '',
    sourceProductId: np.sourceProductId ?? '',
  };

  const out: ApiSourceResult[] = [];
  for (const s of sources) {
    const url = interpolate(s.url, ctx);
    if (!url) {
      out.push({ target: s.target, url: '', ok: false, error: 'url 插值后为空（占位符字段无值）' });
      continue;
    }
    try {
      const json = await fetchJson({
        url,
        method: s.method,
        headers: s.headers,
        body: s.body ? interpolate(s.body, ctx) : undefined,
      });
      const picked = renameKeys(walkPath(json, s.rootPath), s.pick);
      if (picked == null) {
        out.push({
          target: s.target,
          url,
          ok: false,
          error: `rootPath="${s.rootPath ?? '(根)'}" 未取到值`,
        });
        continue;
      }
      if (s.target === 'specs' && Array.isArray(picked)) np.specs = picked as NormalizedProduct['specs'];
      else if (s.target === 'introMedia' && Array.isArray(picked)) {
        np.introMedia = picked as NormalizedProduct['introMedia'];
      } else np.row[s.target] = picked;

      out.push({ target: s.target, url, ok: true, count: Array.isArray(picked) ? picked.length : 1, picked });
    } catch (e) {
      out.push({ target: s.target, url, ok: false, error: (e as Error).message });
    }
  }
  return out;
}
