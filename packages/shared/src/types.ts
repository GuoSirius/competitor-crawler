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
/** 列表翻页策略（单一事实源；crawler 的 config/types.ts 直接转出本类型，勿再各写一份） */
export type ListStrategy =
  | 'pagination-html'
  | 'pagination-api'
  | 'scroll-api'
  | 'model-generic'
  | 'pagination-url';

export interface SpecItem {
  spec?: string | null;
  /** 现价 / 售价 */
  priceNow?: string | null;
  /** 原价 / 划线价 / 市场价 */
  priceOriginal?: string | null;
  /** 活动价（限时活动、秒杀） */
  priceActivity?: string | null;
  /** 优惠价 / 券后价 */
  pricePromo?: string | null;
}

export interface IntroMedia {
  image?: string | null;
  description?: string | null;
}

export interface NormalizedProduct {
  /**
   * 站点自身的产品 id。有就写，没有留空（**不用货号兜底**）。
   * 去重键 dedupe_key = COALESCE(source_product_id, canonical(detail_url)) —— 货号不参与去重，
   * 因为同货号可能对应多个规格的多张页面（详见 schema.ts 注释）。
   */
  sourceProductId?: string | null;
  /** 货号（catalog number）。有则必写，无则空。用于跨公司对齐 / 比价。 */
  sku?: string | null;
  detailUrl?: string | null;
  name?: string | null;
  /** 英文名 */
  englishName?: string | null;
  /** 品牌 */
  brand?: string | null;
  /** 价格数值（默认规格价），用于排序 / 涨跌计算 */
  price?: number | null;
  /** 币种（站点级） */
  currency?: string | null;
  /** 价格原文保真 */
  priceText?: string | null;
  /** 规格原文（如 100μL），比价须同规格 */
  specText?: string | null;
  /** 纯文本描述（与 introMedia 图文互补） */
  description?: string | null;
  specs: SpecItem[];
  introMedia: IntroMedia[];
  cloneNumber?: string | null;
  applications?: string[] | null;
  /**
   * 兜底原始快照：详情页抽取到的**全部**声明字段（含已提升为一等公民的那些）。
   * 站点特有的属性（种属/宿主/反应性/偶联物…）放这里，避免把表拍成十几列常空字段。
   */
  row: Record<string, unknown>;
}

// 种子源（xlsx-to-seeds 产出）
export interface CategorySeed {
  companyName: string;
  website?: string;
  competitorType?: string;
  /** 公司属性：own=我方品牌，competitor=竞品。缺省按 competitor 处理。 */
  role?: string;
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
  /**
   * 栏目标识（多规则站点用）。列表阶段写入，详情阶段据此选对应 section 的抽取规则；
   * 同时参与 products 去重键（company_id, dedupe_key, section_key，见去重口径 B）。
   * 单规则站点为空/省略，落库时统一为 'default'。
   */
  sectionKey?: string;
  /**
   * 列表阶段抽取到的全部声明字段（原始快照）。
   * 详情页常常缺价格/规格/货号，而列表页有 → 落库时以「详情优先、列表兜底」合并，提升字段覆盖率。
   */
  raw?: Record<string, unknown>;
}

export interface SiteAdapter {
  match(url: string): boolean;
  listTraversal(page: PageHandle): Promise<ListItem[]>;
  parseList(node: NodeHandle): ListItem;
  parseDetail(page: PageHandle): NormalizedProduct;
}
