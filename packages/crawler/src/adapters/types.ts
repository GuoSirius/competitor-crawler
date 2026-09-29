/**
 * 代码型站点适配器 · 契约（唯一真相源）
 * ========================================
 *
 * 定位（docs/05 §5.3「加性、不替换」）：
 *   YAML 是主力与真相源；代码适配器只提供 **可选钩子**，补 YAML 表达不了的东西。
 *   共存时先按 YAML 解析，再用钩子补齐缺口；站点没有适配器文件时行为与
 *   「没有这套机制」完全一致（零回归）。
 *
 * 接线状态（docs/16 🔴-2 已落地）：
 *   `adapter/adapterLoader.ts` 按域名动态加载 `adapters/<domain>.ts` 的默认导出；
 *   `commands/crawl.ts` 在「列表抓取前 / 翻页拼 URL / 列表解析后 / 详情解析后」四个点调用钩子。
 *
 * 同步/异步口径：除 preflight 外的钩子返回 `MaybePromise<T>`——
 *   适配器作者想同步就同步、想异步就异步，管线统一 `await`（await 同步值零开销）。
 */
import type { ListItem, NormalizedProduct } from '@competitor-crawler/shared';

export type MaybePromise<T> = T | Promise<T>;

/** 钩子上下文：标识当前站点与栏目 */
export interface CodeAdapterCtx {
  domain: string;
  /** 当前栏目 key（多规则站点的 sections[].key） */
  sectionKey: string;
  /** 当前栏目内容类型：'products'（产品管线）或 news/announcement 等（内容管线） */
  contentType: string;
}

/**
 * 代码适配器契约：全部钩子可选，按需实现其中若干个即可。
 * 默认导出一个满足本接口的对象（`export default { ... } satisfies CodeAdapter`）。
 */
export interface CodeAdapter {
  /**
   * ① 列表抓取前的前置动作（每站点整轮爬取执行一次）。
   * 典型用途：过 WAF / 换取 Cookie / 校验可达性。
   * 返回的请求头（如 `{ cookie: 'X-REDIRECT=1' }`）会合并进该站点后续所有
   * ssr 静态抓取请求（fetchPage）；返回 undefined/void 表示无附加头。
   * spa（Playwright）模式由浏览器自管 Cookie，附加头不参与。
   * 抛错只记日志不中断整轮（适配器是增强，不是单点）。
   */
  preflight?(ctx: { domain: string }): MaybePromise<Record<string, string> | void>;

  /**
   * ② 自定义翻页 URL 拼装（仅 `listTraversal.strategy: pagination-url` 策略生效）。
   * 返回 null/undefined/空串时走默认 `buildPageUrl` 逻辑（模板占位符替换）。
   */
  buildPageUrl?(
    base: string,
    template: string,
    page: number,
    ctx: CodeAdapterCtx,
  ): string | null | undefined;

  /**
   * ③ 列表解析（YAML parseList + detailUrl 补全）之后的二次加工：
   * 过滤非产品页、补 raw 字段、改写 detailUrl 等。返回加工后的数组（可原样返回）。
   */
  postParseList?(items: ListItem[], ctx: CodeAdapterCtx): MaybePromise<ListItem[]>;

  /**
   * ④ 详情解析（YAML parseDetail + 列表兜底合并）之后的二次加工：
   * 同义字段归一、跨节点拼接、补算派生字段。返回加工后的产品（可原样返回）。
   * 在 api 源（形态 D）/ 模型兜底（形态 E）**之前**调用——它们只补空，不覆盖本钩子的产出。
   */
  postParseDetail?(
    np: NormalizedProduct,
    html: string,
    ctx: CodeAdapterCtx,
  ): MaybePromise<NormalizedProduct>;
}
