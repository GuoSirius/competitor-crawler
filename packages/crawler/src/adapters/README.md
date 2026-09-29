# 代码型站点适配器（adapters/）

> 加性、不替换：YAML 是主力与真相源；代码适配器只补 YAML 表达不了的东西。

## 1. 什么时候需要代码适配器

绝大多数站点**只用 `config/sites/<domain>.yaml` 就能跑**（FieldSpec 覆盖文本/属性/regex/list/map/number/json/$self 五种取值）。
只有以下情况才需要写代码适配器（`adapters/<domain>.ts`）：

| 场景 | 说明 | 示例 |
|---|---|---|
| 过 WAF / 设 Cookie / 自定义 UA | fetch 阶段前置动作，YAML 无法表达 | 阿里云滑块、ua-bio WAF 挑战壳 |
| JS 计算的分页 / 懒加载 | 页码或内容靠浏览器执行才能拿到 | 点击「下一页」、滚动加载规格表 |
| 解析后二次加工 | 同义字段归一、跨节点拼接、补算 | 克隆号从多处文本拼出 |

## 2. 文件命名与发现

- 文件：`packages/crawler/src/adapters/<domain>.ts`，**与 `config/sites/<domain>.yaml` 同名**。
- 发现：`config/loader.ts` 的 `hasCodeAdapter(domain)` 检查 `adapters/<domain>.ts` 是否存在。
  当前 `crawl` 仅用它统计「哪些站挂了适配器」并打印「钩子生效」提示——**尚未真正 import 并调用**（见 docs/16 🔴-2）。
- 以 `_` 开头的文件（如本目录的 `_example.ts`）不会被任何真实 domain 命中，可作模板常驻仓库。

## 3. 契约（唯一真相源）

实现 `packages/shared/src/types.ts` 导出的 `SiteAdapter` 接口：

```ts
export interface SiteAdapter {
  match(url: string): boolean;                                   // 是否负责此 URL
  listTraversal(page: PageHandle): Promise<ListItem[]>;         // 列表遍历（含前置动作+翻页）
  parseList(node: NodeHandle): ListItem;                         // 单条列表项抽取
  parseDetail(page: PageHandle): Promise<NormalizedProduct>;     // 详情页抽取
}
```

- `PageHandle` / `NodeHandle`：`packages/shared/src/types.ts`（html / click / scroll / waitFor / text / attr / list）。
- 返回值 `ListItem` / `NormalizedProduct`：`packages/shared/src/types.ts`。
- 解析细节**优先复用** `../adapter/yamlAdapter.ts` 的 `parseListWithConfig` / `parseDetailWithConfig`，保持与纯 YAML 站点同口径。

## 4. 最小可运行模板

见 `_example.ts`（含详细伪代码注释）。要点：

```ts
import type { SiteAdapter } from '@competitor-crawler/shared';
import { parseListWithConfig, parseDetailWithConfig } from '../adapter/yamlAdapter.js';

export const match = (url: string) => /https?:\/\/(www\.)?example-biocom\.com/.test(url);

export async function listTraversal(page) {
  const html = await page.html();
  return parseListWithConfig(html, listCfg, 'default');   // 复用 YAML 解析
}

export default { match, listTraversal, parseList, parseDetail } satisfies SiteAdapter;
```

## 5. 接线路线（待 🔴-2 落地）

在 fetch / 解析管线里：对每条 URL 先 `match(url)` 找命中适配器；命中则走代码解析，否则走 YAML。
届时 `_example.ts` 无需改动即符合接口，可删 `_` 前缀、改名成真实 `<domain>.ts` 启用。

> 注意：本目录的「加性钩子」语义与 `docs/05 §5.3` 一致；早期评审（docs/16 🔴-2）提到的
> `preflight/transformList/...` 钩子命名已演进为上面的 `SiteAdapter` 接口，以 `shared/types.ts` 为准。
