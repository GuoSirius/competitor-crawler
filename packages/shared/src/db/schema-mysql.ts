import { mysqlTable, int, double, text, json, index, uniqueIndex } from 'drizzle-orm/mysql-core';

// MySQL 方言 schema —— 结构与 SQLite 完全一致，仅列类型换成语方言等价物：
//   integer PK autoincrement → int autoincrement PK
//   real(price)             → double
//   text(mode:'json')       → json（mysql2 自动序列化/反序列化）
//   integer(时间/外键)        → int
// 表名、列名、唯一/普通索引、默认值 三方言保持同名同语义，保证切换无歧义、查询零改动。

export const companies = mysqlTable('companies', {
  id: int('id').autoincrement().primaryKey(),
  name: text('name').notNull().unique(),
  website: text('website'),
  competitorType: text('competitor_type'),
  role: text('role').notNull().default('competitor'),
  sourceRow: json('source_row'),
  removedAt: int('removed_at'),
  createdAt: int('created_at').notNull(),
  updatedAt: int('updated_at').notNull(),
}, (t) => [
  index('idx_company_role').on(t.role),
]);

export const categories = mysqlTable('categories', {
  id: int('id').autoincrement().primaryKey(),
  companyId: int('company_id').notNull().references(() => companies.id),
  productLine: text('product_line'),
  name: text('name').notNull(),
  url: text('url').notNull(),
  sourceRow: json('source_row'),
  removedAt: int('removed_at'),
  createdAt: int('created_at').notNull(),
  updatedAt: int('updated_at').notNull(),
}, (t) => [
  uniqueIndex('uniq_cat').on(t.companyId, t.productLine, t.name),
]);

export const products = mysqlTable('products', {
  id: int('id').autoincrement().primaryKey(),
  companyId: int('company_id').notNull().references(() => companies.id),
  categoryId: int('category_id').references(() => categories.id),
  sourceProductId: text('source_product_id'),
  sku: text('sku'),
  dedupeKey: text('dedupe_key').notNull(),
  sectionKey: text('section_key').notNull().default('default'),
  name: text('name'),
  englishName: text('english_name'),
  brand: text('brand'),
  detailUrl: text('detail_url'),
  price: double('price'),
  currency: text('currency'),
  priceText: text('price_text'),
  specText: text('spec_text'),
  description: text('description'),
  specs: json('specs'),
  introMedia: json('intro_media'),
  cloneNumber: text('clone_number'),
  applications: json('applications'),
  row: json('row'),
  status: text('status').notNull().default('active'),
  firstSeenAt: int('first_seen_at').notNull(),
  lastSeenAt: int('last_seen_at').notNull(),
  missingSince: int('missing_since'),
  createdAt: int('created_at').notNull(),
  updatedAt: int('updated_at').notNull(),
}, (t) => [
  uniqueIndex('uniq_product').on(t.companyId, t.dedupeKey, t.sectionKey),
  index('idx_company_cat_status').on(t.companyId, t.categoryId, t.status),
  index('idx_company_sku').on(t.companyId, t.sku),
]);

export const crawls = mysqlTable('crawls', {
  id: int('id').autoincrement().primaryKey(),
  trigger: text('trigger').notNull(),
  status: text('status').notNull(),
  modelMode: text('model_mode'),
  summary: json('summary'),
  startedAt: int('started_at').notNull(),
  finishedAt: int('finished_at'),
});

export const priceHistory = mysqlTable('price_history', {
  id: int('id').autoincrement().primaryKey(),
  productId: int('product_id').notNull().references(() => products.id),
  price: double('price'),
  currency: text('currency'),
  priceText: text('price_text'),
  specText: text('spec_text'),
  crawlId: int('crawl_id').references(() => crawls.id),
  capturedAt: int('captured_at').notNull(),
}, (t) => [index('idx_price_history_product_time').on(t.productId, t.capturedAt)]);

export const alerts = mysqlTable('alerts', {
  id: int('id').autoincrement().primaryKey(),
  crawlId: int('crawl_id').references(() => crawls.id),
  type: text('type').notNull(),
  severity: text('severity').notNull(),
  companyId: int('company_id').references(() => companies.id),
  categoryId: int('category_id').references(() => categories.id),
  productId: int('product_id').references(() => products.id),
  message: text('message').notNull(),
  payload: json('payload'),
  status: text('status').notNull().default('open'),
  createdAt: int('created_at').notNull(),
});

// 泛型内容（非产品采集：新闻 / 公告 / 活动等）。结构与 schema-sqlite.ts 完全一致，仅列类型换 MySQL 等价物。
export const contents = mysqlTable('contents', {
  id: int('id').autoincrement().primaryKey(), // 自增主键
  companyId: int('company_id').notNull().references(() => companies.id), // 所属公司
  contentType: text('content_type').notNull().default('news'), // 内容类型：news / announcement / event…（= section.contentType）
  sectionKey: text('section_key').notNull().default('default'), // 栏目维度（参与去重键）
  dedupeKey: text('dedupe_key').notNull(), // 去重键 = COALESCE(source_id, canonical(detail_url))
  sourceId: text('source_id'), // 站点自身的内容 id
  title: text('title').notNull(), // 标题
  summary: text('summary'), // 摘要
  body: text('body'), // 正文纯文本
  author: text('author'), // 作者 / 来源
  publishedAt: int('published_at'), // 发布时间（Unix 秒，可空）
  detailUrl: text('detail_url'), // 原文链接
  row: json('row'), // 兜底原始抽取快照（JSON）
  status: text('status').notNull().default('active'), // 状态：active / removed
  firstSeenAt: int('first_seen_at').notNull(), // 首次发现时间（Unix 秒）
  lastSeenAt: int('last_seen_at').notNull(), // 最近出现时间（Unix 秒）
  missingSince: int('missing_since'), // 首次缺失时间（Unix 秒）
  createdAt: int('created_at').notNull(), // 创建时间（Unix 秒）
  updatedAt: int('updated_at').notNull(), // 更新时间（Unix 秒）
}, (t) => [
  uniqueIndex('uniq_content').on(t.companyId, t.dedupeKey, t.sectionKey), // 组合唯一（同 products 口径）
  index('idx_content_company_type').on(t.companyId, t.contentType, t.status), // 按公司/类型筛选
  index('idx_content_published').on(t.publishedAt), // 按发布时间排序
]);

export const mysqlSchema = { companies, categories, products, crawls, priceHistory, alerts, contents };
export type MysqlSchema = typeof mysqlSchema;
