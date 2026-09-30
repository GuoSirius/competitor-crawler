import type { FieldSpec, ListStrategy } from '@competitor-crawler/shared';
import type { RenderMode } from '../fetch/page.js';

/**
 * 翻页策略（与 docs/05 §5.4、_template.yaml 保持一致）。
 *
 * 单一事实源在 `@competitor-crawler/shared`（跨 crawler / web / 模型层共用）；此处仅**转出**，
 * 不再各写一份——曾出现 shared 版本漏掉 `'pagination-url'` 的漂移。
 */
export type { ListStrategy };

/** 列表页解析规则 */
export interface ListParseConfig {
  /** 每个产品条目容器的选择器 */
  itemSelector: string;
  fields: Record<string, FieldSpec>;
}

/**
 * 详情页「异步接口」数据源（形态 D，见 docs/05 §5.3.4）。
 *
 * 使用场景：规格/价格在下拉框选中后才由 XHR 返回，静态 HTML 里拿不到。
 * 处理原则：**不主动逆向接口**——由 probe 检测出该形态并告警，人工在浏览器
 * Network 面板找到接口后，把地址填到本配置块，即可让 crawl 直接取数。
 */
export interface ApiSourceConfig {
  /**
   * 结果写到哪个字段：
   * - `specs` / `introMedia` → 写入对应内置字段（做数组校验）
   * - 其他名字 → 写入 `row[target]`（不污染 products 列）
   */
  target: string;
  /**
   * 接口地址。支持 `{字段名}` 占位，取值来自**详情页已抽到的字段**（含内置字段与 row）。
   * 例：`https://x.com/api/goods/{sku}/skus`、`https://x.com/api/p?goodsId={sourceProductId}`。
   * 也可用 `{detailUrl}` 拿详情页地址。
   */
  url: string;
  /** 默认 GET */
  method?: string;
  /** 额外请求头（如 Referer / X-Requested-With） */
  headers?: Record<string, string>;
  /** 请求体模板（POST 用）；同样支持 `{字段}` 占位 */
  body?: string;
  /** 从响应 JSON 里定位数组/对象，如 `data.list`；省略则用响应根 */
  rootPath?: string;
  /** 键重命名 `{ 我方键: 站点键 }`，如 `{ spec: "specName", priceNow: "price" }` */
  pick?: Record<string, string>;
}

/**
 * 形态 E「前端计算」的模型兜底配置（docs/04 §4.3、docs/05 §5.3.5）。
 *
 * 触发条件：静态选择器 + 异步接口都取不到规格/价格时，才让模型从**页面可见文本**
 * （可选 + 截图）里抽结构化结果。模型只**补空**，绝不覆盖已抽到的值。
 *
 * 模型自身的选择完全走配置（`MODEL_MODE` / `config/model.yaml`），见 docs/04 §4.2——
 * 换本地/云端、换厂商都不需要改这里。
 *
 * 可直接写简写 `modelFallback: true`，等价于 `{ enabled: true }`。
 */
export interface ModelFallbackConfig {
  /** 是否启用（缺省视为启用；显式写 false 可临时关掉） */
  enabled?: boolean;
  /**
   * 只让模型抽这些目标：`specs` / `introMedia` / 其他内置标量字段名（如 `sku`）。
   * 省略 = 全部（specs + introMedia + 模型给出的标量）。
   */
  targets?: string[];
  /**
   * 是否附带**整页截图**给多模态模型（需 `MODEL_*` 指向视觉模型，如 `qwen2.5-vl:7b`）。
   * 开启后会额外用 Playwright 截一次图，成本更高；仅当「可见文本不足以判断」时才开。
   */
  screenshot?: boolean;
}

/** 详情页解析规则 */
export interface DetailParseConfig {
  fields: Record<string, FieldSpec>;
  /** 未声明的字段全量进 row 兜底 */
  captureRest?: boolean;
  /** 异步接口数据源（形态 D）；由 probe 告警后人工回填 */
  api?: ApiSourceConfig[];
  /** 模型兜底（形态 E）：`true` 或配置对象；省略/`false` 则完全不调模型 */
  modelFallback?: boolean | ModelFallbackConfig;
}

/** 翻页遍历配置 */
export interface ListTraversalConfig {
  strategy: ListStrategy;
  /** 翻页按钮选择器（pagination-* 类必填；pagination-url 不需要） */
  nextSelector?: string;
  /**
   * 最多翻页数（含首页）。默认 1000：实际翻页终止主要靠「本页解析 0 条」，
   * 本值只是防呆上限（1000 页 × 每页约 20 条 ≈ 2 万条，覆盖目标站点量级）。
   * CLI --pages 与本值**取小**（安全护栏语义，见 traverseList）。
   */
  maxPages?: number;
  /** 接口模式失败自动回退 UI 驱动（pagination-url 不使用） */
  fallbackToUi?: boolean;
  /**
   * URL 模板翻页（strategy='pagination-url' 时必填）。
   * 基于该 section 的**首个 startUrl** 拼装每页 URL，把 `{page}` 替换为页码。
   * 支持三种写法（见 docs/05 §5.4）：
   *   - 完整 URL：`https://x.com/list?page={page}` → 直接用
   *   - 查询串后缀：`?page={page}` / `&p={page}` → 合并进 base 的 query（覆盖同名参数）
   *   - 绝对路径：`/c/{page}` → 取 base 的 origin + 该路径
   */
  urlTemplate?: string;
  /** 起始页码（默认 1；部分站点从 0 或 2 起算）。仅 pagination-url 支持（UI 点击无法跳页） */
  pageStart?: number;
  /** 终止页码（闭区间，含本页）。缺省不限。仅 pagination-url 支持 */
  pageEnd?: number;
  /**
   * 每页条目起始偏移（0 起）：每页解析出的条目先跳过前 offset 条再取。
   * 语义对齐「页面上从第 offset+1 个条目开始看」。所有翻页策略生效；
   * 缺省 0。CLI --offset 可临时覆盖。
   */
  offset?: number;
  /**
   * 每页最多取条目数：offset 之后连取 limit 条，缺省取到页尾。
   * 与 CLI --limit（详情抓取总数上限）语义不同：本值作用于**每一页**的条目截取。
   * CLI --per-page 可临时覆盖。
   */
  limit?: number;
}

/**
 * 面包屑动态分类（categoryFromPage）：从详情页 HTML 抽「根→叶」分类路径，
 * 爬取时经 upsertCategoryPath 动态建树，产品挂到叶子分类。
 * 优先级：categoryFromPage（动态，最准）> categoryPath（YAML 静态）> category 单名兜底。
 */
export interface CategoryFromPageConfig {
  /** 面包屑条目选择器（按文档顺序依次取文本，如 `.breadcrumb li` / `#crumb a`） */
  itemSelector: string;
  /** 剔除的段（站点名 / 首页 / 产品中心 等固定词），精确匹配 */
  strip?: string[];
  /** 保留末段（默认 false：末段通常是产品名本身，不是分类） */
  keepLast?: boolean;
  /** 最多取前 N 段（防异常页面超长），缺省 4 */
  maxDepth?: number;
}

/**
 * 栏目级规则（多规则站点）。
 *
 * 同一站点可有多个列表页 + 对应详情页、但爬取规则不同：
 * 每个 section 自带 startUrls + match + listTraversal + parseList + parseDetail；
 * 列表阶段给条目打上 sectionKey，详情阶段按 sectionKey 选规则（零歧义）。
 * 同 SKU 出现在不同 section 时按去重口径 B 分开为两条（section_key 并入去重键）。
 */
export interface SectionConfig {
  /** 栏目标识：写入 products.section_key / contents.section_key，参与去重键。单规则站点固定为 'default' */
  key: string;
  /**
   * 采集内容类型（路由落库表，与 contents.content_type 同名对应）：
   * - 'products'（缺省，特殊值）：产品采集 → products 表（价格/规格等完整管线）
   * - 其他值（如 'news' / 'announcement'）：泛型内容采集 → contents 表（content_type=该值）
   * 同一站点 YAML 的多规则 sections 可混排产品与资讯栏目。
   * 兼容：曾短暂用名 collects，读取时回落。
   */
  contentType?: string;
  /** @deprecated 旧名，等价 contentType */
  collects?: string;
  /**
   * 绑定的种子品类名（对应 categories.name）。
   * 种子里的「品类链接」多为站点首页，无法直接当列表页用，故用本字段把栏目挂到对应品类下。
   * 缺省时按域名兜底（该域名只有一个品类就用它，否则 category_id 记空）。
   */
  category?: string;
  /**
   * 品类面包屑路径（从根到本栏目的各层级名，如 `['试剂', '抗体']`）。
   * 用于构建通用分类表的无限层级树（parent_id + path）；省略时回退为单层级 `[category]`。
   */
  categoryPath?: string[];
  /** 面包屑动态分类：从详情页抽分类路径建树（优先于 categoryPath/category） */
  categoryFromPage?: CategoryFromPageConfig;
  /**
   * 产品线（对应 categories.product_line）。可选；用于 `crawl --product-line` 过滤。
   * 缺省该栏目不绑定产品线；指定 --product-line 时仅跑 productLine 命中的栏目。
   */
  productLine?: string;
  /** 该栏目的列表页入口（可多个）。省略则回退顶层 startUrl */
  startUrls?: string[];
  /**
   * 命中判定（可选，供 crawl 按 URL 路由到对应 section）：
   * 列表 / 详情 URL 包含任一子串即认为属于本栏目。
   */
  match?: {
    listUrlIncludes?: string[];
    detailUrlIncludes?: string[];
  };
  /** 该栏目单独的翻页策略；省略则回退顶层 listTraversal */
  listTraversal?: ListTraversalConfig;
  /** 该栏目单独的列表页规则；省略则回退顶层 parseList */
  parseList?: ListParseConfig;
  /** 该栏目单独的详情页规则；省略则回退顶层 parseDetail */
  parseDetail?: DetailParseConfig;
  /**
   * 该栏目单独的渲染模式（覆盖站点级 render）：ssr/spa/auto。
   * 用于 Hybrid 站点：同站内不同栏目用不同渲染模式（如产品列表 ssr、新闻列表 spa）。
   * 列表/详情分别指定见 renderList / renderDetail（更细粒度）。
   */
  render?: RenderMode;
  /**
   * 该栏目列表页单独渲染模式（覆盖本栏目 render）：适用「列表页 ssr、详情页 csr」等
   * 列表与详情不一致的站点。省略则回退 本栏目 render → 站点级 render → auto。
   */
  renderList?: RenderMode;
  /** 该栏目详情页单独渲染模式（覆盖本栏目 render）；省略回退逻辑同 renderList */
  renderDetail?: RenderMode;
}

/**
 * 站点适配器配置（config/sites/<domain>.yaml 的结构化类型）。
 * 与 _template.yaml 一一对应；model 生成的 YAML 也会解析成该类型。
 *
 * 两种写法（resolveSections 统一归一化）：
 *   1) 单规则：直接写顶层 startUrl + listTraversal + parseList + parseDetail → 包成 key='default' 的一个 section
 *   2) 多规则：写 sections: [...]，每 section 独立规则；顶层字段作为公共默认值（可省）
 */
export interface SiteConfig {
  domain: string;
  /**
   * 站点归属公司名（写入 companies.name）。省略时 config 驱动模式回退为 domain。
   * 用于「config 目录即爬取范围真相源」（crawl --source config）时，自动 upsert 公司 / 品类进库；
   * 若公司已由种子 Excel 入库（website 命中域名或 name 命中本值），会复用而非新建，避免重复。
   */
  company?: string;
  /**
   * 竞品类型（写入 companies.competitor_type）。可选；供筛选/分组。
   * YAML 显式声明时以 YAML 为准：复用已有公司时若值不同则更新；未声明时不动库中现有值。
   */
  competitorType?: string;
  /**
   * 公司角色（写入 companies.role）：own=我方 / competitor=竞品。缺省 competitor。
   * YAML 显式声明时以 YAML 为准（规则同 competitorType）。
   */
  role?: string;
  /**
   * 站点级默认产品线（对应 categories.product_line）。缺省回退到各 section 自己的 productLine；
   * 用于 config 驱动模式（`crawl --source config`）按产品线 upsert / 过滤品类。
   */
  productLine?: string;
  /**
   * 站点币种（一个站点一种，如 CNY / USD）。缺省按 CNY。
   * 写入 products.currency，供跨站点比价时做币种区分。
   */
  currency?: string;
  /**
   * 抓取渲染模式（写入 YAML 顶层，供 gen-site / probe / crawl 统一复用）：ssr=静态抓取 / spa=Playwright 渲染 / auto=先 ssr，内容过少回退 spa。
   * 命令行 --render 仍可临时覆盖。批量站点混合 ssr/spa 时，逐站写在 YAML 即可，无需每次指定。
   */
  render?: RenderMode;
  /**
   * 站点级列表页渲染模式（单规则站点可直接写顶层让列表页用指定模式；section 未指定 renderList 时继承）。
   * 回退链：section.renderList → section.render → 顶层 render → auto。
   */
  renderList?: RenderMode;
  /**
   * 站点级详情页渲染模式（单规则站点可直接写顶层让详情页用指定模式；section 未指定 renderDetail 时继承）。
   * 回退链同 renderList，仅作用于详情页。
   */
  renderDetail?: RenderMode;
  /**
   * 站点级默认采集类型（section 未指定 contentType 时继承）。缺省 'products'。
   * 整站只做资讯采集的站点可直接在顶层写 contentType: news，sections 无需逐个声明。
   * 兼容：曾短暂用名 collects，读取时回落。
   */
  contentType?: string;
  /** @deprecated 旧名，等价 contentType */
  collects?: string;
  /** 列表页入口 URL（单规则写法用；多规则时作为各 section 的默认起点） */
  startUrl?: string;
  /**
   * 站点级默认品类面包屑路径（section 未指定 categoryPath 时继承；见 SectionConfig.categoryPath）。
   */
  categoryPath?: string[];
  /** 站点级默认面包屑动态分类（section 未指定 categoryFromPage 时继承） */
  categoryFromPage?: CategoryFromPageConfig;
  /** 站点级默认品类名（section 未指定 category 时继承；见 SectionConfig.category） */
  category?: string;
  /** 顶层默认翻页策略（section 未单独指定时继承） */
  listTraversal?: ListTraversalConfig;
  /** 顶层默认列表规则（单规则站点直接写这里；section 未指定时继承） */
  parseList?: ListParseConfig;
  /** 顶层默认详情规则（单规则站点直接写这里；section 未指定时继承） */
  parseDetail?: DetailParseConfig;
  /** 多规则站点：一组栏目，每个栏目自带列表 + 详情规则 */
  sections?: SectionConfig[];
}

/**
 * 归一化后的栏目规则：顶层默认值已合并到每个 section，消费方（probe / crawl）
 * 只需面向 resolveSections 的返回值，无需再关心单规则 / 多规则差异。
 */
export interface ResolvedSection {
  key: string;
  /** 采集内容类型（透传自 SectionConfig.contentType，缺省回退顶层/ 'products'） */
  contentType: string;
  /** 绑定的种子品类名（透传自 SectionConfig.category） */
  category?: string;
  /** 品类面包屑路径（透传自 SectionConfig.categoryPath，缺省由 category 推断为单层级） */
  categoryPath?: string[];
  /** 面包屑动态分类（透传自 SectionConfig/SiteConfig.categoryFromPage） */
  categoryFromPage?: CategoryFromPageConfig;
  /** 产品线（透传自 SectionConfig.productLine，缺省回退 SiteConfig.productLine） */
  productLine?: string;
  /** 站点币种（透传自 SiteConfig.currency，缺省 CNY） */
  currency: string;
  startUrls: string[];
  listTraversal: ListTraversalConfig;
  parseList: ListParseConfig;
  parseDetail: DetailParseConfig;
  match?: SectionConfig['match'];
  /**
   * 该栏目最终生效的渲染模式（已合并顶层 render：section.render ?? 站点 render）。
   * 列表/详情分别指定见 renderList / renderDetail（更细粒度，覆盖本字段）。
   */
  render?: RenderMode;
  /** 该栏目列表页渲染模式（已合并顶层 renderList）；回退链 renderList → render → auto */
  renderList?: RenderMode;
  /** 该栏目详情页渲染模式（已合并顶层 renderDetail）；回退链 renderDetail → render → auto */
  renderDetail?: RenderMode;
}
