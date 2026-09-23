// 统一领域类型：跨 crawler / web / 模型层共用，单一事实源

export type ModelMode = 'local' | 'cloud' | 'hybrid';

export type AlertType =
  | 'MISSING_FIELD'
  | 'FIELD_CHANGED'
  | 'BULK_DRIFT'
  | 'SITE_UNREACHABLE'
  | 'NEEDS_API_HINT'
  | 'MODEL_FAILURE';

export type AlertSeverity = 'info' | 'warning' | 'error';
export type AlertStatus = 'open' | 'ack' | 'resolved' | 'auto_fixed';
export type ProductStatus = 'active' | 'delisted';
export type CrawlStatus = 'running' | 'success' | 'partial' | 'failed';
export type CrawlTrigger = 'schedule' | 'manual';
export type ListStrategy = 'pagination-html' | 'pagination-api' | 'scroll-api' | 'model-generic';

export interface SpecItem {
  spec?: string | null;
  priceNow?: string | null;
  priceActivity?: string | null;
  pricePromo?: string | null;
}

export interface IntroMedia {
  image?: string | null;
  description?: string | null;
}

export interface NormalizedProduct {
  sourceProductId?: string | null;
  detailUrl?: string | null;
  name?: string | null;
  specs: SpecItem[];
  introMedia: IntroMedia[];
  cloneNumber?: string | null;
  applications?: string[] | null;
  row: Record<string, unknown>;
}

// 种子源（xlsx-to-seeds 产出）
export interface CategorySeed {
  companyName: string;
  website?: string;
  competitorType?: string;
  productLine?: string;
  categoryName: string;
  categoryUrl: string;
  sourceRow: Record<string, unknown>;
}

// 适配器统一接口（Fetch 层提供页面句柄）
export interface PageHandle {
  html(): Promise<string>;
  screenshot(): Promise<Buffer>;
  click(selector: string): Promise<void>;
  scroll(): Promise<void>;
  waitFor(selector: string): Promise<void>;
}

export interface NodeHandle {
  html(): string;
  text(selector: string): string | null;
  attr(selector: string, name: string): string | null;
  list(selector: string): NodeHandle[];
}

export interface ListItem {
  detailUrl: string;
  name?: string;
}

export interface SiteAdapter {
  match(url: string): boolean;
  listTraversal(page: PageHandle): Promise<ListItem[]>;
  parseList(node: NodeHandle): ListItem;
  parseDetail(page: PageHandle): NormalizedProduct;
}
