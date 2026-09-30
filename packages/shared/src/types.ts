// 统一领域类型：跨 crawler / web / 模型层共用，单一事实源

export type ModelMode = 'local' | 'cloud' | 'hybrid';

export type AlertType =
  | 'MISSING_FIELD'
  | 'FIELD_CHANGED'
  | 'BULK_DRIFT'
  | 'SITE_UNREACHABLE'
  | 'NEEDS_API_HINT'
  | 'MODEL_FAILURE'
  | 'CRAWL_INTERRUPTED';

/**
 * 告警严重级别（单一事实源，docs/16 M8）。
 * 取值以**实际写入方**为准（crawl.ts 只写 warning/critical）；UI 徽章与 schema 注释与此对齐。
 */
export const ALERT_SEVERITIES = ['info', 'warning', 'critical'] as const;
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];
/** 告警处理状态：open 未处理 / ack 已认领 / resolved 已解决 / auto_fixed 自动修复 */
export const ALERT_STATUSES = ['open', 'ack', 'resolved', 'auto_fixed'] as const;
export type AlertStatus = (typeof ALERT_STATUSES)[number];
export const PRODUCT_STATUSES = ['active', 'delisted'] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];
/** 批次状态：running 进行中 / success 全成 / partial 部分失败 / failed 整轮失败 */
export const CRAWL_STATUSES = ['running', 'success', 'partial', 'failed'] as const;
export type CrawlStatus = (typeof CRAWL_STATUSES)[number];
export const CRAWL_TRIGGERS = ['schedule', 'manual'] as const;
export type CrawlTrigger = (typeof CRAWL_TRIGGERS)[number];
/** 列表翻页策略（单一事实源；crawler 的 config/types.ts 直接转出本类型，勿再各写一份） */
export type ListStrategy =
  | 'pagination-html'
  | 'pagination-api'
  | 'scroll-api'
  | 'model-generic'
  | 'pagination-url';

export interface SpecItem {
  spec?: string | null;
  /** 规格名的补充括注（如「常温/冻存」等储存条件），从规格文本剥离出来单独存；无则省略 */
  condition?: string | null;
  /** 该规格变体的货号（catalog number）。形态 C/D 用 pick 映射（如 WooCommerce 可变产品每个变体各有一个 sku） */
  sku?: string | null;
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
  /** 介绍视频地址（如 B 站播放器 iframe 的 src）；纯图片项省略 */
  video?: string | null;
}

export interface NormalizedProduct {
  /**
   * 站点自身的产品 id。有就写，没有留空（**不用货号兜底**）。
   * 身份键 identity_key = COALESCE(source_product_id, canonical(detail_url)) —— 货号不参与，
   * 因为同货号可能对应多个规格的多张页面（详见 schema.ts 注释）。
   */
  sourceProductId?: string | null;
  /**
   * 货号（catalog number）= **默认规格**的货号；有则必写，无则空。
   * 一品多货号（形态 C：每个规格各一个货号）时存默认/首个规格的货号，全量货号在 specs[].sku。
   */
  sku?: string | null;
  detailUrl?: string | null;
  name?: string | null;
  /** 英文名 */
  englishName?: string | null;
  /** 别称/曾用名（站点页面拼接原样，可能含现用名，分号分隔） */
  aliases?: string | null;
  /** 曾用货号（站点页面拼接原样，可能含现用货号，分号分隔） */
  oldSkus?: string | null;
  /** 品牌 */
  brand?: string | null;
  /** 价格数值 = 默认规格现价（specs 首项 priceNow；无规格时为唯一价）。排序/涨跌/价格历史统一用这个口径 */
  price?: number | null;
  /** 币种（站点级） */
  currency?: string | null;
  /** 价格原文保真 */
  priceText?: string | null;
  /** 规格原文（如 100μL）——与 price 成对的「默认规格」文本；比价须同规格 */
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

export interface ListItem {
  detailUrl: string;
  name?: string;
  /**
   * 栏目标识（多规则站点用）。列表阶段写入，详情阶段据此选对应 section 的抽取规则；
   * 同时参与 products 唯一键（company_id, identity_key, section_key，见去重口径 B）。
   * 单规则站点为空/省略，落库时统一为 'default'。
   */
  sectionKey?: string;
  /**
   * 列表阶段抽取到的全部声明字段（原始快照）。
   * 详情页常常缺价格/规格/货号，而列表页有 → 落库时以「详情优先、列表兜底」合并，提升字段覆盖率。
   */
  raw?: Record<string, unknown>;
  /**
   * 本条出自哪个列表页（翻页后的实际页 URL 优先，回退到 startUrl）。
   * 落库写入 products.list_url / contents.list_url，用于溯源。
   */
  listUrl?: string;
}

// 说明：代码适配器契约不在 shared 定义——全量解析器形态（SiteAdapter）与现有
// YAML 引擎不兼容且无人消费，已移除（docs/16 🔴-2 落地时改为 crawler 侧
// `src/adapters/types.ts` 的「加性钩子」契约 CodeAdapter，见 docs/05 §5.3）。
