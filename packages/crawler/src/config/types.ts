import type { FieldSpec } from '@competitor-crawler/shared';

/** 翻页策略（与 docs/05、_template.yaml 保持一致） */
export type ListStrategy = 'pagination-html' | 'pagination-api' | 'scroll-api' | 'model-generic';

/**
 * 站点适配器配置（config/sites/<domain>.yaml 的结构化类型）。
 * 与 _template.yaml 一一对应；model 生成的 YAML 也会解析成该类型。
 */
export interface SiteConfig {
  domain: string;
  /** 列表页入口 URL（probe / crawl 的抓取起点；gen-site 会自动写入） */
  startUrl?: string;
  listTraversal: {
    strategy: ListStrategy;
    /** 翻页按钮选择器（pagination 类必填） */
    nextSelector?: string;
    maxPages?: number;
    /** 接口模式失败自动回退 UI 驱动 */
    fallbackToUi?: boolean;
  };
  parseList: {
    /** 每个产品条目容器的选择器 */
    itemSelector: string;
    fields: Record<string, FieldSpec>;
  };
  parseDetail: {
    fields: Record<string, FieldSpec>;
    /** 未声明的字段全量进 row 兜底 */
    captureRest?: boolean;
  };
}
