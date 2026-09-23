import type { FieldSpec } from '@competitor-crawler/shared';

/** 翻页策略（与 docs/05、_template.yaml 保持一致） */
export type ListStrategy = 'pagination-html' | 'pagination-api' | 'scroll-api' | 'model-generic';

/** 列表页解析规则 */
export interface ListParseConfig {
  /** 每个产品条目容器的选择器 */
  itemSelector: string;
  fields: Record<string, FieldSpec>;
}

/** 详情页解析规则 */
export interface DetailParseConfig {
  fields: Record<string, FieldSpec>;
  /** 未声明的字段全量进 row 兜底 */
  captureRest?: boolean;
}

/** 翻页遍历配置 */
export interface ListTraversalConfig {
  strategy: ListStrategy;
  /** 翻页按钮选择器（pagination 类必填） */
  nextSelector?: string;
  maxPages?: number;
  /** 接口模式失败自动回退 UI 驱动 */
  fallbackToUi?: boolean;
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
  /** 栏目标识：写入 products.section_key，参与去重键。单规则站点固定为 'default' */
  key: string;
  /**
   * 绑定的种子品类名（对应 categories.name）。
   * 种子里的「品类链接」多为站点首页，无法直接当列表页用，故用本字段把栏目挂到对应品类下。
   * 缺省时按域名兜底（该域名只有一个品类就用它，否则 category_id 记空）。
   */
  category?: string;
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
   * 站点币种（一个站点一种，如 CNY / USD）。缺省按 CNY。
   * 写入 products.currency，供跨站点比价时做币种区分。
   */
  currency?: string;
  /** 列表页入口 URL（单规则写法用；多规则时作为各 section 的默认起点） */
  startUrl?: string;
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
  /** 绑定的种子品类名（透传自 SectionConfig.category） */
  category?: string;
  /** 站点币种（透传自 SiteConfig.currency，缺省 CNY） */
  currency: string;
  startUrls: string[];
  listTraversal: ListTraversalConfig;
  parseList: ListParseConfig;
  parseDetail: DetailParseConfig;
  match?: SectionConfig['match'];
}
