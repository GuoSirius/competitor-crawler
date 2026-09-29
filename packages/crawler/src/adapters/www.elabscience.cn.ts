/**
 * elabscience.cn · preflight 适配器（docs/16 C5）
 * ================================================
 *
 * 背景（2026-09-28 实测）：该站首次请求会下发会话 Cookie（PHPSID；部分路径历史上
 * 走 /redirect/ 中转 → 302 + Set-Cookie: X-REDIRECT=1，带 Cookie 才直接 200）。
 * 本适配器在整轮爬取前用 manual 模式预热一次，把下发的全部 Cookie 原样带回，
 * 附加到该站点后续所有 ssr 请求（fetchPage headers 合并），绕开中转/无会话拦截。
 *
 * 站点状态（与金斯瑞/近岸/R&D 同批「暂挂起」）：列表页静态 HTML 无产品网格，
 * 产品卡片由 XHR 异步挂载（形态 E）——按项目规则不主动逆向接口，待业务确认优先级
 * 后再补 config/sites/www.elabscience.cn.yaml；届时本文件与 YAML 同名即自动生效。
 */
import type { CodeAdapter } from './types.js';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export default {
  async preflight({ domain }: { domain: string }) {
    // manual：不跟随 302，直接读响应头的 Set-Cookie（PHPSID / X-REDIRECT=1 等）
    const res = await fetch(`https://www.${domain}/`, {
      redirect: 'manual',
      headers: { 'user-agent': UA },
    }).catch(() => null);
    const setCookies = res?.headers.getSetCookie?.() ?? [];
    const pairs = setCookies.map((c) => c.split(';')[0].trim()).filter(Boolean);
    return pairs.length > 0 ? { cookie: pairs.join('; ') } : undefined;
  },
} satisfies CodeAdapter;
