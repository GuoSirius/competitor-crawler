/**
 * 代码型站点适配器 · 示例模板（非真实站点，仅供开发参考）
 * =============================================================
 *
 * 作用（docs/05 §5.3「加性、不替换」）：
 *   YAML 是主力与真相源；代码适配器只补 YAML 表达不了的东西，例如：
 *     · 过 WAF / 设置 Cookie / 自定义 UA 的前置动作（preflight）
 *     · 需要浏览器交互才能拿到数据的分页 / 懒加载（点击 Tab、滚动）
 *     · 解析后二次加工（同义字段归一、补算价格、跨节点拼接）
 *
 * 文件命名约定：
 *   adapters/<domain>.ts —— 与 config/sites/<domain>.yaml 同名。
 *   loader.hasCodeAdapter(domain) 据此判断「某站点是否有代码适配器」。
 *   本文件以「_」开头，不会被任何真实 domain 命中（hasCodeAdapter('_example')
 *   查的是 _example.ts，而没有任何站点叫 _example），可安全留在仓库里当模板。
 *
 * 契约（唯一真相源：packages/shared/src/types.ts:SiteAdapter）：
 *   export interface SiteAdapter {
 *     match(url: string): boolean;                                  // 该适配器是否负责此 URL
 *     listTraversal(page: PageHandle): Promise<ListItem[]>;          // 列表遍历（带前置动作+翻页）
 *     parseList(node: NodeHandle): ListItem;                         // 单条列表项抽取
 *     parseDetail(page: PageHandle): Promise<NormalizedProduct>;     // 详情页抽取
 *   }
 *
 * ⚠️ 接线状态：当前 crawl 管线尚未按 match(url) 分发到代码适配器（见 docs/16 🔴-2）。
 *   本文件先把「契约长什么样」固定下来；未来在 fetch/解析管线里 import() 并调用即可，
 *   本示例无需改动即符合接口。
 *
 * 设计提示：适配器应当「薄」——优先把能写进 YAML 的抽取规则写进 YAML，
 *           代码只做 YAML 做不到的那一层；解析细节尽量复用 ../adapter/yamlAdapter.ts 的
 *           parseListWithConfig / parseDetailWithConfig，保持与纯 YAML 站点同口径。
 */

import type {
  SiteAdapter,
  PageHandle,
  NodeHandle,
  ListItem,
  NormalizedProduct,
  FieldSpec,
} from '@competitor-crawler/shared';
import {
  parseListWithConfig,
  parseDetailWithConfig,
  type ListConfig,
} from '../adapter/yamlAdapter.js';

// 与 config/sites/example-biocom.yaml 同名的 domain（仅示例）
export const domain = 'example-biocom';

/** 该适配器负责哪些 URL。其它域一律走 YAML，零回归。 */
export const match = (url: string): boolean =>
  /https?:\/\/(www\.)?example-biocom\.com/.test(url);

/**
 * 列表遍历：前置 WAF/cookie 处理 + 复用 YAML 解析器。
 * PageHandle 由 Fetch 层提供：html() 取整页 HTML、click/scroll/waitFor 做交互。
 */
export async function listTraversal(page: PageHandle): Promise<ListItem[]> {
  // ① 前置动作（YAML 表达不了的）：例如带 Cookie 过 WAF、自定义 UA。
  //    真实代码里可在 fetch 阶段用 preflight 钩子完成，这里仅示意。
  // await page.waitFor('table.product-grid'); // 等列表区渲染

  // ② 取 HTML，交给 YAML 驱动的解析器（保持与纯 YAML 站点同口径）。
  const html = await page.html();

  // ③ 列表解析配置：实际应来自 config/sites/<domain>.yaml 的 parseList，
  //    此处就地写一个最小示例，复杂结构直接读 yaml 更直观。
  const listCfg: ListConfig = {
    itemSelector: '.product-item',
    fields: {
      detailUrl: { sel: 'a', attr: 'href' },
      name: { sel: '.title', text: true },
    } satisfies Record<string, FieldSpec>,
  };

  // ④ 翻页：多为「点下一页 / 拼 ?page=N」。若需 JS 计算页码，在此循环。
  const items = parseListWithConfig(html, listCfg, 'default');

  // ⑤ 返回前可二次加工（与 postParseList 钩子同义），例如去空白、补全 sectionKey。
  return items.map((it) => ({ ...it, sectionKey: it.sectionKey ?? 'default' }));
}

/** 单条列表项抽取（NodeHandle 提供 text/attr/list，语义与 cheerio 一致）。 */
export function parseList(node: NodeHandle): ListItem {
  const detailUrl = node.attr('href', 'a') ?? '';
  const name = node.text('.title') ?? undefined;
  // raw 携带列表阶段能拿到的货号/规格/价格，详情页缺时用于兜底（mergeListFallback）。
  const raw: Record<string, unknown> = {
    sku: node.text('.sku'),
    priceText: node.text('.price'),
  };
  return { detailUrl, name, raw };
}

/**
 * 详情页抽取：可能要先点击规格 Tab、滚动加载参数表，再解析。
 * 同样优先复用 parseDetailWithConfig，只在「YAML 做不到」处补逻辑。
 *
 * ⚠️ 契约注意：shared/types.ts 的 SiteAdapter.parseDetail 当前声明为「同步」返回 NormalizedProduct，
 *    但 PageHandle.html() 是异步的（Promise<string>）。两种接线口径待定（见 docs/16 🔴-2 落地时统一）：
 *      (a) 把接口改成 parseDetail(page): Promise<NormalizedProduct>；或
 *      (b) 管线在调用前先 await page.html()，把 HTML 字符串传进来（适配器保持纯同步，推荐）。
 *    本示例按当前接口写「同步」形状；HTML 由管线预取后传入（示意用空串占位，请勿直接上线）。
 */
export function parseDetail(page: PageHandle): NormalizedProduct {
  // 真实代码里，下面的 html 应由管线预取后传入，或本函数改为 async 并 await page.html()。
  const html = '' /* 由管线预取的 HTML */;
  const fields: Record<string, FieldSpec> = {
    name: { sel: '.p-name', text: true },
    price: { sel: '.p-price', text: true, number: true },
    specText: { sel: '.p-spec', text: true },
  };
  const product = parseDetailWithConfig(html, fields);

  // 后置加工示例：YAML 抽不到的跨节点拼接 / 同义字段归一。
  // product.row['克隆号'] = deriveCloneNumber(product);
  return product;
}

// 组合成 SiteAdapter 形状。未来 crawl 管线按此接口调用：先 match(url)，命中则走本适配器。
export default { match, listTraversal, parseList, parseDetail } satisfies SiteAdapter;
