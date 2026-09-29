/**
 * 代码型站点适配器 · 示例模板（非真实站点，仅供开发参考）
 * =============================================================
 *
 * 作用（docs/05 §5.3「加性、不替换」）：
 *   YAML 是主力与真相源；代码适配器只补 YAML 表达不了的东西：
 *     · 过 WAF / 换 Cookie / 校验可达性的前置动作（preflight）
 *     · 需要计算的翻页 URL（buildPageUrl，仅 pagination-url 策略生效）
 *     · 列表/详情解析后的二次加工（postParseList / postParseDetail）
 *
 * 契约（唯一真相源：./types.ts 的 CodeAdapter）：全部钩子可选，按需实现若干即可。
 * 接线状态（docs/16 🔴-2 已落地）：crawl 管线按域名动态加载 `adapters/<domain>.ts`
 * 的默认导出，在「列表前 / 翻页拼 URL / 列表解析后 / 详情解析后」四个点调用钩子。
 *
 * 文件命名约定：
 *   adapters/<domain>.ts —— 与 config/sites/<domain>.yaml 同名。
 *   本文件以「_」开头，不会被任何真实 domain 命中（hasCodeAdapter 查的是 _example.ts，
 *   而没有任何站点叫 _example），可安全留在仓库里当模板。
 *
 * 同步/异步口径：除 preflight 外的钩子可同步可异步（返回 MaybePromise<T>），管线统一 await。
 */

import type { CodeAdapter } from './types.js';
import type { ListItem, NormalizedProduct } from '@competitor-crawler/shared';

export default {
  /**
   * ① preflight：每站点整轮爬取前执行一次。
   * 返回的请求头会合并进该站点后续所有 ssr 请求（如 `{ cookie: 'X-REDIRECT=1' }`）。
   * 典型场景：elabscience.cn 的 /redirect/ 中转——先 manual 拿 302 的 Set-Cookie，
   * 后续带上该 Cookie 才直接 200。抛错只记日志，不中断整轮。
   */
  async preflight({ domain }) {
    const res = await fetch(`https://www.${domain}/`, { redirect: 'manual' }).catch(() => null);
    const setCookie = res?.headers.get('set-cookie') ?? '';
    const pair = setCookie.split(';')[0]?.trim(); // 取第一个 cookie 对
    return pair ? { cookie: pair } : undefined;
  },

  /**
   * ② buildPageUrl：覆盖默认翻页拼装（返回 null/undefined 走默认模板逻辑）。
   * 示例：第 1 页用入口 URL 本身，之后走 `/list/p/N` 路径式翻页。
   */
  buildPageUrl(base: string, _template: string, page: number) {
    if (page === 1) return base;
    return `${base.replace(/\/$/, '')}/p/${page}`;
  },

  /**
   * ③ postParseList：YAML parseList + detailUrl 补全之后、去重之前的二次加工。
   * 示例：排除联系/关于/资讯等非产品页（与遍历导航的排除口径一致）。
   */
  postParseList(items: ListItem[]): ListItem[] {
    return items.filter((it) => it.detailUrl && !/\/(contact|about|news|faq)\//i.test(it.detailUrl));
  },

  /**
   * ④ postParseDetail：YAML parseDetail + 列表兜底合并之后的二次加工。
   * 在 api 源（形态 D）/ 模型兜底（形态 E）之前调用——它们只补空，不会覆盖这里的产出。
   * 示例：跨节点派生字段归一（此处以品牌缺省为例）。
   */
  async postParseDetail(np: NormalizedProduct): Promise<NormalizedProduct> {
    if (!np.brand) np.brand = 'ExampleBio';
    return np;
  },
} satisfies CodeAdapter;
