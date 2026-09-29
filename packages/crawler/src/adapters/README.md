# 代码型站点适配器（adapters/）

> 加性、不替换：YAML 是主力与真相源；代码适配器只补 YAML 表达不了的东西。

## 1. 什么时候需要代码适配器

绝大多数站点**只用 `config/sites/<domain>.yaml` 就能跑**（FieldSpec 覆盖文本/属性/regex/list/map/number/json/$self 五种取值）。
只有以下情况才需要写代码适配器（`adapters/<domain>.ts`）：

| 钩子 | 场景 | 说明 |
|---|---|---|
| `preflight` | 过 WAF / 设 Cookie | 每站整轮一次；返回的请求头（如 `{ cookie: 'X-REDIRECT=1' }`）合并进后续 ssr 请求 |
| `buildPageUrl` | 需计算的翻页 URL | 仅 `pagination-url` 策略生效；返回空值走默认模板拼装 |
| `postParseList` | 列表解析后二次加工 | 过滤非产品页、补 raw、改写 detailUrl |
| `postParseDetail` | 详情解析后二次加工 | 同义归一、跨节点拼接、补算派生字段（在 api 源/模型兜底之前） |

## 2. 文件命名与发现

- 文件：`packages/crawler/src/adapters/<domain>.ts`，**与 `config/sites/<domain>.yaml` 同名**。
- 发现：`config/loader.ts` 的 `hasCodeAdapter(domain)` 检查文件是否存在；
  `adapter/adapterLoader.ts` 的 `loadCodeAdapter(domain)` 加载默认导出并按域名缓存。
  ⚠️ **新增适配器须同时在 `adapterLoader.ts` 的 `registry` 补一行登记**
  （不用变量动态导入：vitest/vite 静态分析不支持；一致性测试会拦截漏登记）。
- **已接线（docs/16 🔴-2）**：crawl 管线在「列表抓取前 / 翻页拼 URL / 列表解析后 / 详情解析后」
  四个点调用钩子；preflight 失败或加载失败只告警，按「无适配器」继续（纯 YAML 零回归）。
- 以 `_` 开头的文件（如 `_example.ts`）不会被任何真实 domain 命中，可作模板常驻仓库。

## 3. 契约（唯一真相源）

`./types.ts` 的 `CodeAdapter`——全部钩子可选：

```ts
export interface CodeAdapter {
  preflight?(ctx: { domain: string }): MaybePromise<Record<string, string> | void>;
  buildPageUrl?(base: string, template: string, page: number, ctx: CodeAdapterCtx): string | null | undefined;
  postParseList?(items: ListItem[], ctx: CodeAdapterCtx): MaybePromise<ListItem[]>;
  postParseDetail?(np: NormalizedProduct, html: string, ctx: CodeAdapterCtx): MaybePromise<NormalizedProduct>;
}
```

- 同步/异步口径：除 preflight 外可同步可异步（`MaybePromise<T>`），管线统一 `await`。
- `ListItem` / `NormalizedProduct`：`@competitor-crawler/shared`。
- 解析细节仍优先写进 YAML；代码只做 YAML 表达不了的那一层。

## 4. 最小模板

见 `_example.ts`。骨架：

```ts
import type { CodeAdapter } from './types.js';

export default {
  async preflight({ domain }) { /* 拿 Cookie 等；返回附加请求头 */ },
  postParseList(items) { return items; },
  postParseDetail(np, html) { return np; },
} satisfies CodeAdapter;
```

历史注：早期评审（docs/16 🔴-2）讨论过的 `SiteAdapter`（match/listTraversal/parseList/parseDetail
全量解析器）与 YAML 引擎不兼容且无人消费，已从 `shared/types.ts` 移除；最终采用上面的
「加性钩子」契约。
