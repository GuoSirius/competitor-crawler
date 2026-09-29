import { sqliteTable, integer, real, text, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

// 竞对公司（Excel 一行公司维度）。name 为业务主键。
export const companies = sqliteTable('companies', {
  id: integer('id').primaryKey({ autoIncrement: true }), // 自增主键
  name: text('name').notNull().unique(), // 公司名称（业务主键，唯一）
  website: text('website'), // 官网地址
  competitorType: text('competitor_type'), // 竞品类型（如 reagent / instrument）
  /**
   * 公司属性维度：own=我方品牌（普诺赛/伊莱瑞特），competitor=竞品。
   * 默认 competitor。下游报告按 role 区分「自己 vs 对手」，对标 SQL 零改动（按 role 分组/置顶即可）。
   */
  role: text('role').notNull().default('competitor'), // 公司属性：own=我方 / competitor=竞品（默认 competitor）
  sourceRow: text('source_row', { mode: 'json' }), // 种子 Excel 原始行（JSON 快照）
  removedAt: integer('removed_at'), // 软删除时间（Unix 秒，NULL=未删除）
  createdAt: integer('created_at').notNull(), // 创建时间（Unix 秒）
  updatedAt: integer('updated_at').notNull(), // 更新时间（Unix 秒）
}, (t) => [
  index('idx_company_role').on(t.role), // 按角色筛选/分组
]);

// 品类（Excel 一行：公司 + 产品线 + 品类名 + 品类链接）
//
// ⚠️ 索引回调用**数组**而非对象：drizzle-orm 0.45+ 已弃用对象回调（ts6387），
// 数组写法才会命中新签名，避免函数重载回落到已弃用的旧签名。
export const categories = sqliteTable('categories', {
  id: integer('id').primaryKey({ autoIncrement: true }), // 自增主键
  companyId: integer('company_id').notNull().references(() => companies.id), // 所属公司（外键 → companies.id）
  productLine: text('product_line'), // 产品线（可为空）
  name: text('name').notNull(), // 品类名称
  url: text('url').notNull(), // 品类列表页 URL
  sourceRow: text('source_row', { mode: 'json' }), // 种子 Excel 原始行（JSON 快照）
  removedAt: integer('removed_at'), // 软删除时间（Unix 秒，NULL=未删除）
  createdAt: integer('created_at').notNull(), // 创建时间（Unix 秒）
  updatedAt: integer('updated_at').notNull(), // 更新时间（Unix 秒）
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
  id: integer('id').primaryKey({ autoIncrement: true }), // 自增主键
  companyId: integer('company_id').notNull().references(() => companies.id), // 所属公司（外键 → companies.id）
  categoryId: integer('category_id').references(() => categories.id), // 所属品类（外键 → categories.id，可为空）
  /**
   * 站点自身的产品 id（有则写，无则留空）。
   *
   * ⚠️ **不用货号兜底**：货号是「产品级」唯一，同货号常对应多个规格/多张页面
   * （如 ZQ1273 的 100μL 与 1mL 各自成页），拿它当去重键会误合并多条、造成数据丢失。
   * 去重键应是「页面级」唯一 → 由 dedupe_key = COALESCE(source_product_id, canonical(detail_url)) 表达。
   * 货号的用途是**跨公司对齐 / 比价**，即 sku 列。
   */
  sourceProductId: text('source_product_id'), // 站点自身产品 id（有则写，无则空）
  /** 货号（catalog number）。有则必写，无则空。跨公司比价 / 对齐的首选键。 */
  sku: text('sku'), // 货号 / catalog number（跨公司比价首选键）
  dedupeKey: text('dedupe_key').notNull(), // 去重键 = COALESCE(source_product_id, canonical(detail_url))
  // 栏目维度：同一 SKU 出现在不同 section（如「全部产品」「促销」）时分开存为两条（去重口径 B）。
  // 单规则站点的产品统一写 'default'，保证旧数据与旧配置零感知。
  sectionKey: text('section_key').notNull().default('default'), // 栏目维度（同 SKU 跨栏目分开；默认 default）
  name: text('name'), // 产品名称
  /** 英文名（生物试剂普遍中英文双名，检索用） */
  englishName: text('english_name'), // 英文名
  /** 品牌（同一公司可能多品牌，如 Elabscience / Procell） */
  brand: text('brand'), // 品牌
  detailUrl: text('detail_url'), // 产品详情页 URL
  /** 价格数值（去千分位/币种后），用于排序与涨跌计算；取默认规格价 */
  price: real('price'), // 默认规格价（数值，用于排序/涨跌）
  /** 币种（站点级，如 CNY / USD） */
  currency: text('currency'), // 币种（如 CNY / USD）
  /** 价格原文保真（如「￥1,280.00 / 100μL」） */
  priceText: text('price_text'), // 价格原文保真
  /** 规格原文（如 100μL / 1mg），**比价必须同规格** */
  specText: text('spec_text'), // 规格原文（比价须同规格）
  /** 纯文本描述（introMedia 是图文富文本，二者互补） */
  description: text('description'), // 纯文本描述
  specs: text('specs', { mode: 'json' }), // 多规格价明细（JSON）
  introMedia: text('intro_media', { mode: 'json' }), // 图文富文本（JSON）
  cloneNumber: text('clone_number'), // 克隆号
  applications: text('applications', { mode: 'json' }), // 应用领域（JSON）
  row: text('row', { mode: 'json' }), // 兜底原始抽取快照（JSON）
  status: text('status').notNull().default('active'), // 状态：active / delisted（默认 active）
  firstSeenAt: integer('first_seen_at').notNull(), // 首次发现时间（Unix 秒）
  lastSeenAt: integer('last_seen_at').notNull(), // 最近出现时间（Unix 秒）
  missingSince: integer('missing_since'), // 首次缺失时间（Unix 秒，NULL=在售）
  createdAt: integer('created_at').notNull(), // 创建时间（Unix 秒）
  updatedAt: integer('updated_at').notNull(), // 更新时间（Unix 秒）
}, (t) => [
  // ★ 组合唯一索引：一个产品在公司内、按栏目唯一（去重口径 B：section_key 并入去重键）
  // 同一 SKU 出现在不同 section 时分开为两条，适合「同 SKU 在不同栏目详情内容确实不同」的场景。
  uniqueIndex('uniq_product').on(t.companyId, t.dedupeKey, t.sectionKey),
  index('idx_company_cat_status').on(t.companyId, t.categoryId, t.status), // 按公司/品类/状态筛选
  // 按货号查（同公司内对齐 / 去重用）
  index('idx_company_sku').on(t.companyId, t.sku),
]);

// 爬取批次
export const crawls = sqliteTable('crawls', {
  id: integer('id').primaryKey({ autoIncrement: true }), // 自增主键
  trigger: text('trigger').notNull(), // 触发方式：manual / schedule
  status: text('status').notNull(), // 批次状态：running / done / failed
  modelMode: text('model_mode'), // 模型部署模式（local/cloud/hybrid，可为空）
  summary: text('summary', { mode: 'json' }), // 批次汇总（JSON）
  startedAt: integer('started_at').notNull(), // 开始时间（Unix 秒）
  finishedAt: integer('finished_at'), // 结束时间（Unix 秒，可为空）
});

// 价格历史：供后期做「价格走势 / 涨跌告警」。
// 写入口径：每轮 crawl 中，该产品**首次入库**或**价格发生变化**时追加一行（新旧价格全空则不记）。
// 目前只写入、不消费——消费端（report / alerts）待后续接入，不影响现有逻辑。
// 多规格明细价仍由 products.specs(JSON) 承载，二者并存：specs=明细，本表=默认规格价的时序。
export const priceHistory = sqliteTable('price_history', {
  id: integer('id').primaryKey({ autoIncrement: true }), // 自增主键
  productId: integer('product_id').notNull().references(() => products.id), // 关联产品（外键 → products.id）
  /** 本次抓到的价格数值（可能为空：页面未展示价格） */
  price: real('price'), // 当次价格数值（可为空）
  currency: text('currency'), // 币种
  priceText: text('price_text'), // 价格原文
  /** 当次规格快照（比价须同规格） */
  specText: text('spec_text'), // 当次规格快照
  crawlId: integer('crawl_id').references(() => crawls.id), // 关联爬取批次（外键 → crawls.id，可为空）
  capturedAt: integer('captured_at').notNull(), // 抓取时间（Unix 秒）
}, (t) => [index('idx_price_history_product_time').on(t.productId, t.capturedAt)]); // 按产品+时间查时序

// 告警
export const alerts = sqliteTable('alerts', {
  id: integer('id').primaryKey({ autoIncrement: true }), // 自增主键
  crawlId: integer('crawl_id').references(() => crawls.id), // 关联爬取批次（外键 → crawls.id，可为空）
  type: text('type').notNull(), // 告警类型
  severity: text('severity').notNull(), // 严重级别：info / warning / critical
  companyId: integer('company_id').references(() => companies.id), // 关联公司（外键 → companies.id，可为空）
  categoryId: integer('category_id').references(() => categories.id), // 关联品类（外键 → categories.id，可为空）
  productId: integer('product_id').references(() => products.id), // 关联产品（外键 → products.id，可为空）
  message: text('message').notNull(), // 告警内容
  payload: text('payload', { mode: 'json' }), // 结构化附加信息（JSON，可为空）
  status: text('status').notNull().default('open'), // 状态：open / resolved（默认 open）
  createdAt: integer('created_at').notNull(), // 创建时间（Unix 秒）
});

export const schema = { companies, categories, products, crawls, priceHistory, alerts };
export type Schema = typeof schema;
