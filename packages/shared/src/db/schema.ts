import { sqliteTable, integer, real, text, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

// 竞对公司（Excel 一行公司维度）。name 为业务主键。
export const companies = sqliteTable('companies', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  website: text('website'),
  competitorType: text('competitor_type'),
  sourceRow: text('source_row', { mode: 'json' }),
  removedAt: integer('removed_at'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

// 品类（Excel 一行：公司 + 产品线 + 品类名 + 品类链接）
//
// ⚠️ 索引回调用**数组**而非对象：drizzle-orm 0.45+ 已弃用对象回调（ts6387），
// 数组写法才会命中新签名，避免函数重载回落到已弃用的旧签名。
export const categories = sqliteTable('categories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  companyId: integer('company_id').notNull().references(() => companies.id),
  productLine: text('product_line'),
  name: text('name').notNull(),
  url: text('url').notNull(),
  sourceRow: text('source_row', { mode: 'json' }),
  removedAt: integer('removed_at'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (t) => [
  // 业务主键：同一公司下的「产品线 + 品类名」唯一
  uniqueIndex('uniq_cat').on(t.companyId, t.productLine, t.name),
]);

// 产品（归一化 + 兜底）
//
// 字段分层（判据：要跨站点比价 / 报告筛选 / 排序 → 拍成列；仅单站点特有 → 留在 row JSON）：
//   ① 身份：companyId / categoryId / sectionKey / dedupeKey / sourceProductId / sku / name / detailUrl
//   ② 可比：price / currency / priceText / specText / brand / englishName
//   ③ 描述：description（纯文本）、introMedia（图文富文本）
//   ④ 扩展：row(J) 兜底原始抽取快照、specs(J) 多规格价、applications(J) 应用
export const products = sqliteTable('products', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  companyId: integer('company_id').notNull().references(() => companies.id),
  categoryId: integer('category_id').references(() => categories.id),
  /**
   * 站点自身的产品 id（有则写，无则留空）。
   *
   * ⚠️ **不用货号兜底**：货号是「产品级」唯一，同货号常对应多个规格/多张页面
   * （如 ZQ1273 的 100μL 与 1mL 各自成页），拿它当去重键会误合并多条、造成数据丢失。
   * 去重键应是「页面级」唯一 → 由 dedupe_key = COALESCE(source_product_id, canonical(detail_url)) 表达。
   * 货号的用途是**跨公司对齐 / 比价**，即 sku 列。
   */
  sourceProductId: text('source_product_id'),
  /** 货号（catalog number）。有则必写，无则空。跨公司比价 / 对齐的首选键。 */
  sku: text('sku'),
  dedupeKey: text('dedupe_key').notNull(),
  // 栏目维度：同一 SKU 出现在不同 section（如「全部产品」「促销」）时分开存为两条（去重口径 B）。
  // 单规则站点的产品统一写 'default'，保证旧数据与旧配置零感知。
  sectionKey: text('section_key').notNull().default('default'),
  name: text('name'),
  /** 英文名（生物试剂普遍中英文双名，检索用） */
  englishName: text('english_name'),
  /** 品牌（同一公司可能多品牌，如 Elabscience / Procell） */
  brand: text('brand'),
  detailUrl: text('detail_url'),
  /** 价格数值（去千分位/币种后），用于排序与涨跌计算；取默认规格价 */
  price: real('price'),
  /** 币种（站点级，如 CNY / USD） */
  currency: text('currency'),
  /** 价格原文保真（如「￥1,280.00 / 100μL」） */
  priceText: text('price_text'),
  /** 规格原文（如 100μL / 1mg），**比价必须同规格** */
  specText: text('spec_text'),
  /** 纯文本描述（introMedia 是图文富文本，二者互补） */
  description: text('description'),
  specs: text('specs', { mode: 'json' }),
  introMedia: text('intro_media', { mode: 'json' }),
  cloneNumber: text('clone_number'),
  applications: text('applications', { mode: 'json' }),
  row: text('row', { mode: 'json' }),
  status: text('status').notNull().default('active'),
  firstSeenAt: integer('first_seen_at').notNull(),
  lastSeenAt: integer('last_seen_at').notNull(),
  missingSince: integer('missing_since'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (t) => [
  // ★ 组合唯一索引：一个产品在公司内、按栏目唯一（去重口径 B：section_key 并入去重键）
  // 同一 SKU 出现在不同 section 时分开为两条，适合「同 SKU 在不同栏目详情内容确实不同」的场景。
  uniqueIndex('uniq_product').on(t.companyId, t.dedupeKey, t.sectionKey),
  index('idx_company_cat_status').on(t.companyId, t.categoryId, t.status),
  // 按货号查（同公司内对齐 / 去重用）
  index('idx_company_sku').on(t.companyId, t.sku),
]);

// 爬取批次
export const crawls = sqliteTable('crawls', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  trigger: text('trigger').notNull(),
  status: text('status').notNull(),
  modelMode: text('model_mode'),
  summary: text('summary', { mode: 'json' }),
  startedAt: integer('started_at').notNull(),
  finishedAt: integer('finished_at'),
});

// 价格历史：供后期做「价格走势 / 涨跌告警」。
// 写入口径：每轮 crawl 中，该产品**首次入库**或**价格发生变化**时追加一行（新旧价格全空则不记）。
// 目前只写入、不消费——消费端（report / alerts）待后续接入，不影响现有逻辑。
// 多规格明细价仍由 products.specs(JSON) 承载，二者并存：specs=明细，本表=默认规格价的时序。
export const priceHistory = sqliteTable('price_history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  productId: integer('product_id').notNull().references(() => products.id),
  /** 本次抓到的价格数值（可能为空：页面未展示价格） */
  price: real('price'),
  currency: text('currency'),
  priceText: text('price_text'),
  /** 当次规格快照（比价须同规格） */
  specText: text('spec_text'),
  crawlId: integer('crawl_id').references(() => crawls.id),
  capturedAt: integer('captured_at').notNull(),
}, (t) => [index('idx_price_history_product_time').on(t.productId, t.capturedAt)]);

// 告警
export const alerts = sqliteTable('alerts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  crawlId: integer('crawl_id').references(() => crawls.id),
  type: text('type').notNull(),
  severity: text('severity').notNull(),
  companyId: integer('company_id').references(() => companies.id),
  categoryId: integer('category_id').references(() => categories.id),
  productId: integer('product_id').references(() => products.id),
  message: text('message').notNull(),
  payload: text('payload', { mode: 'json' }),
  status: text('status').notNull().default('open'),
  createdAt: integer('created_at').notNull(),
});

export const schema = { companies, categories, products, crawls, priceHistory, alerts };
export type Schema = typeof schema;
