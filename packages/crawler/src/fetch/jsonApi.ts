// 异步 JSON 接口抓取（形态 D 用，见 docs/05 §5.3.4）。
//
// 设计原则：**不主动逆向接口**。本模块只在用户把接口地址人工填进
// config/sites/<domain>.yaml 的 `parseDetail.api` 之后才被调用。

export interface JsonFetchOpts {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  /** 超时毫秒，默认 15000 */
  timeoutMs?: number;
}

/**
 * 请求一个 JSON 接口并返回解析后的值。
 * - 非 2xx 抛错（带状态码与响应片段，便于人工排查）
 * - 超时用 AbortController 中断
 */
export async function fetchJson(opts: JsonFetchOpts): Promise<unknown> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), opts.timeoutMs ?? 15_000);
  try {
    const res = await fetch(opts.url, {
      method: opts.method ?? 'GET',
      headers: {
        Accept: 'application/json, text/plain, */*',
        ...(opts.headers ?? {}),
      },
      body: opts.body,
      signal: ac.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}：${text.slice(0, 200)}`);
    }
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new Error(`响应不是合法 JSON（前 200 字符）：${text.slice(0, 200)}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 把模板里的 `{字段名}` 替换为上下文中的值（取不到替换为空串）。
 * 例：`https://x/api/goods/{sku}/skus` + `{ sku: 'ZQ1273' }` → `.../goods/ZQ1273/skus`
 */
export function interpolate(tpl: string, ctx: Record<string, unknown>): string {
  return tpl.replace(/\{([\w.]+)\}/g, (_m, key: string) => {
    const v = ctx[key];
    return v == null ? '' : String(v);
  });
}
