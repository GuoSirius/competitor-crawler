import { sqliteTable, integer, real, text, index, uniqueIndex, type AnySQLiteColumn } from 'drizzle-orm/sqlite-core';

// 竞对公司（Excel 一行公司维度）。name 为业务主键。
export const companies = sqliteTable('companies', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  website: text('website'),
  competitorType: text('competitor_type'),
  role: text('role').notNull().default('competitor'), // own=我方 / competitor=竞品
  sourceRow: text('source_row', { mode: 'json' }),
  removedAt: integer('removed_at'), // 软删时间（Unix 秒，NULL=未删除）
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (t) => [
  index('idx_company_role').on(t.role),
]);

// 通用分类表：产品 / 新闻 / 公告 / 活动… 共用一张，靠 contentType 分区。
// 无限分类用「parent_id 串联 + path 面包屑」反范式存储：
//   - parent_id：取某节点的直接子节点用
//   - path：从根到本节点的全名链（'/' 分隔，不含 content_type 前缀），兼作唯一键与子树前缀查询
//   - level：深度（根=0），便于排序与限制层级
//   - product_line：冗余写在每个节点上，供 --product-line 整树筛选
// 唯一键 (company_id, content_type, path) 决定 upsert / 软删 / 去重口径。
export const categories = sqliteTable('categories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  companyId: integer('company_id').notNull().references(() => companies.id),
  contentType: text('content_type').notNull().default('products'), // 分区：products / news / announcement…
  // 自引用外键必须显式标注 AnySQLiteColumn，否则 TS 循环推断报 TS7022
  parentId: integer('parent_id').references((): AnySQLiteColumn => categories.id), // 父节点；NULL=根
  path: text('path').notNull(), // 面包屑全路径（业务主键的一部分）
  name: text('name').notNull(), // 本节点名（= path 末段）
  level: integer('level').notNull().default(0), // 深度
  productLine: text('product_line'), // 产品线（根节点写入，向下冗余）
  url: text('url'), // 分类列表页 URL（可空：中间/根节点可能无独立页）
  sourceRow: text('source_row', { mode: 'json' }),
  removedAt: integer('removed_at'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (t) => [
  uniqueIndex('uniq_cat').on(t.companyId, t.contentType, t.path), // upsert 键 + 子树前缀扫描
  index('idx_cat_parent').on(t.companyId, t.contentType, t.parentId), // 取直接子节点
  index('idx_cat_pline').on(t.companyId, t.contentType, t.productLine), // --product-line 筛选
]);

// 产品（归一化 + 兜底）。
// content_type 恒为 'products'：与 contents 表统一语义，便于下游按 content_type 联合分组统计。
// list_url 记录本条出自哪个列表页，便于溯源。
export const products = sqliteTable('products', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  companyId: integer('company_id').notNull().references(() => companies.id),
  categoryId: integer('category_id').references(() => categories.id),
  contentType: text('content_type').notNull().default('products'), // 统一语义：恒 'products'
  sourceProductId: text('source_product_id'), // 站点自身产品 id（有则写，无则空）
  sku: text('sku'), // 主货号 = 默认规格的货号；一品多货号（形态C）全量在 specs[].sku
  identityKey: text('identity_key').notNull(), // 身份键 = 站点产品id，无则规范化详情URL（COALESCE）
  sectionKey: text('section_key').notNull().default('default'), // 同 SKU 跨栏目分开；默认 default
  name: text('name'),
  englishName: text('english_name'),
  brand: text('brand'),
  detailUrl: text('detail_url'), // 详情页地址
  listUrl: text('list_url'), // 列表页地址（溯源）
  price: real('price'), // 默认规格现价（=specs[0].priceNow；无规格=唯一价），排序/涨跌/历史统一口径
  currency: text('currency'), // 币种（CNY / USD）
  priceText: text('price_text'), // 价格原文保真
  specText: text('spec_text'), // 默认规格文本（与 price 成对：¥price / specText）；比价须同规格
  description: text('description'),
  specs: text('specs', { mode: 'json' }), // 多规格明细 [{spec, sku?, priceNow, priceOriginal?, priceActivity?, pricePromo?}]（全量真相；形态C各规格自带 sku）
  introMedia: text('intro_media', { mode: 'json' }), // 图文富文本（JSON）
  cloneNumber: text('clone_number'),
  applications: text('applications', { mode: 'json' }),
  row: text('row', { mode: 'json' }), // 兜底原始抽取快照（JSON）
  status: text('status').notNull().default('active'), // active / delisted
  firstSeenAt: integer('first_seen_at').notNull(),
  lastSeenAt: integer('last_seen_at').notNull(),
  missingSince: integer('missing_since'), // 首次缺失时间（NULL=在售）
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (t) => [
  // upsert 键：公司内按 (去重键, 栏目) 唯一（去重口径 B）
  uniqueIndex('uniq_product').on(t.companyId, t.identityKey, t.sectionKey),
  index('idx_product_section').on(t.companyId, t.sectionKey, t.status), // 软删 / 按栏目加载
  index('idx_product_cat').on(t.companyId, t.categoryId, t.status), // 按品类 / 状态筛选
  index('idx_company_sku').on(t.companyId, t.sku), // 跨公司按货号对齐
]);

// 爬取批次
export const crawls = sqliteTable('crawls', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  trigger: text('trigger').notNull(), // manual / schedule
  status: text('status').notNull(), // running / success / partial / failed
  modelMode: text('model_mode'),
  summary: text('summary', { mode: 'json' }),
  startedAt: integer('started_at').notNull(),
  finishedAt: integer('finished_at'),
});

// 价格历史：供后期「价格走势 / 涨跌告警」。每轮 crawl 中产品首次入库或价格变化追加一行（新旧价全空不记）。
export const priceHistory = sqliteTable('price_history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  productId: integer('product_id').notNull().references(() => products.id),
  price: real('price'),
  currency: text('currency'),
  priceText: text('price_text'),
  specText: text('spec_text'),
  crawlId: integer('crawl_id').references(() => crawls.id),
  capturedAt: integer('captured_at').notNull(),
}, (t) => [index('idx_price_history_product_time').on(t.productId, t.capturedAt)]);

// 告警
export const alerts = sqliteTable('alerts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  crawlId: integer('crawl_id').references(() => crawls.id),
  type: text('type').notNull(),
  severity: text('severity').notNull(), // info / warning / critical
  companyId: integer('company_id').references(() => companies.id),
  categoryId: integer('category_id').references(() => categories.id),
  productId: integer('product_id').references(() => products.id),
  message: text('message').notNull(),
  payload: text('payload', { mode: 'json' }),
  status: text('status').notNull().default('open'), // open / resolved
  createdAt: integer('created_at').notNull(),
});

// 泛型内容（新闻 / 公告 / 活动等），结构与 products 对齐。
// category_id 指向通用分类表（content_type 同本行）；list_url 记录列表页溯源。
export const contents = sqliteTable('contents', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  companyId: integer('company_id').notNull().references(() => companies.id),
  categoryId: integer('category_id').references(() => categories.id), // 通用分类表外键（content_type 同本行）
  contentType: text('content_type').notNull().default('news'), // = section.contentType
  sectionKey: text('section_key').notNull().default('default'),
  identityKey: text('identity_key').notNull(), // 身份键 = 站点内容id，无则规范化详情URL（COALESCE）
  sourceId: text('source_id'), // 站点自身内容 id（如文章 id）
  title: text('title').notNull(),
  summary: text('summary'),
  body: text('body'),
  author: text('author'),
  publishedAt: integer('published_at'), // 发布时间（Unix 秒，可空）
  detailUrl: text('detail_url'),
  listUrl: text('list_url'), // 列表页地址（溯源）
  row: text('row', { mode: 'json' }),
  status: text('status').notNull().default('active'), // active / removed
  firstSeenAt: integer('first_seen_at').notNull(),
  lastSeenAt: integer('last_seen_at').notNull(),
  missingSince: integer('missing_since'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (t) => [
  uniqueIndex('uniq_content').on(t.companyId, t.identityKey, t.sectionKey),
  index('idx_content_section').on(t.companyId, t.sectionKey, t.status), // 软删 / 按栏目加载
  index('idx_content_type').on(t.companyId, t.contentType, t.categoryId, t.status), // 按类型 / 分类筛选
  index('idx_content_published').on(t.publishedAt), // 按发布时间排序
]);

export const schema = { companies, categories, products, crawls, priceHistory, alerts, contents };
export type Schema = typeof schema;
