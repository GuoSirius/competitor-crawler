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
  /**
   * 代理服务器（如 VPN 本地端口 `http://127.0.0.1:7890`）。
   * 原生 fetch 不认 http_proxy 环境变量、且本项目未引入 undici（无 ProxyAgent），
   * 故设了 proxy 就改走 Playwright 的 APIRequestContext（与 ssr 代理同口径），
   * 复现「用户开 VPN 能开」的视角。缺省直连。
   */
  proxy?: string;
}

// 代理请求上下文按 proxy 缓存：proxy 在创建 context 时即固定，不同 proxy 必须不同 context。
const proxyReqCache = new Map<string, import('playwright').APIRequestContext>();
let proxyBrowser: import('playwright').Browser | null = null;

async function proxyRequestContext(proxy: string): Promise<import('playwright').APIRequestContext> {
  let ctx = proxyReqCache.get(proxy);
  if (!ctx) {
    if (!proxyBrowser || !proxyBrowser.isConnected()) {
      const { chromium } = await import('playwright');
      proxyBrowser = await chromium.launch({ headless: true });
    }
    ctx = await (await proxyBrowser.newContext({ proxy: { server: proxy } })).request;
    proxyReqCache.set(proxy, ctx);
  }
  return ctx;
}

/**
 * 请求一个 JSON 接口并返回解析后的值。
 * - 非 2xx 抛错（带状态码与响应片段，便于人工排查）
 * - 超时用 AbortController 中断
 * - 设了 proxy 则走 Playwright APIRequestContext（原生 fetch 不支持代理）
 */
export async function fetchJson(opts: JsonFetchOpts): Promise<unknown> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), opts.timeoutMs ?? 15_000);
  const reqHeaders = {
    Accept: 'application/json, text/plain, */*',
    ...(opts.headers ?? {}),
  };
  try {
    let text: string;
    let status: number;
    let statusText: string;
    if (opts.proxy) {
      const req = await proxyRequestContext(opts.proxy);
      const res = await req.fetch(opts.url, {
        method: opts.method ?? 'GET',
        headers: reqHeaders,
        data: opts.body,
        signal: ac.signal,
      });
      status = res.status();
      statusText = await res.statusText();
      text = await res.text();
    } else {
      const res = await fetch(opts.url, {
        method: opts.method ?? 'GET',
        headers: reqHeaders,
        body: opts.body,
        signal: ac.signal,
      });
      status = res.status;
      statusText = res.statusText;
      text = await res.text();
    }
    if (status < 200 || status >= 300) {
      throw new Error(`HTTP ${status} ${statusText}：${text.slice(0, 200)}`);
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
