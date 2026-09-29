import { pgTable, serial, integer, doublePrecision, text, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';

// PostgreSQL 方言 schema —— 结构与 SQLite/MySQL 完全一致，仅列类型换成语方言等价物：
//   integer PK autoincrement → serial PK
//   real(price)             → doublePrecision
//   text(mode:'json')       → jsonb（可 GIN 索引）
//   integer(时间/外键)        → integer
// 表名、列名、唯一/普通索引、默认值 三方言保持同名同语义，保证切换无歧义、查询零改动。

export const companies = pgTable('companies', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  website: text('website'),
  competitorType: text('competitor_type'),
  role: text('role').notNull().default('competitor'),
  sourceRow: jsonb('source_row'),
  removedAt: integer('removed_at'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (t) => [
  index('idx_company_role').on(t.role),
]);

export const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id').notNull().references(() => companies.id),
  productLine: text('product_line'),
  name: text('name').notNull(),
  url: text('url').notNull(),
  sourceRow: jsonb('source_row'),
  removedAt: integer('removed_at'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (t) => [
  uniqueIndex('uniq_cat').on(t.companyId, t.productLine, t.name),
]);

export const products = pgTable('products', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id').notNull().references(() => companies.id),
  categoryId: integer('category_id').references(() => categories.id),
  sourceProductId: text('source_product_id'),
  sku: text('sku'),
  dedupeKey: text('dedupe_key').notNull(),
  sectionKey: text('section_key').notNull().default('default'),
  name: text('name'),
  englishName: text('english_name'),
  brand: text('brand'),
  detailUrl: text('detail_url'),
  price: doublePrecision('price'),
  currency: text('currency'),
  priceText: text('price_text'),
  specText: text('spec_text'),
  description: text('description'),
  specs: jsonb('specs'),
  introMedia: jsonb('intro_media'),
  cloneNumber: text('clone_number'),
  applications: jsonb('applications'),
  row: jsonb('row'),
  status: text('status').notNull().default('active'),
  firstSeenAt: integer('first_seen_at').notNull(),
  lastSeenAt: integer('last_seen_at').notNull(),
  missingSince: integer('missing_since'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (t) => [
  uniqueIndex('uniq_product').on(t.companyId, t.dedupeKey, t.sectionKey),
  index('idx_company_cat_status').on(t.companyId, t.categoryId, t.status),
  index('idx_company_sku').on(t.companyId, t.sku),
]);

export const crawls = pgTable('crawls', {
  id: serial('id').primaryKey(),
  trigger: text('trigger').notNull(),
  status: text('status').notNull(),
  modelMode: text('model_mode'),
  summary: jsonb('summary'),
  startedAt: integer('started_at').notNull(),
  finishedAt: integer('finished_at'),
});

export const priceHistory = pgTable('price_history', {
  id: serial('id').primaryKey(),
  productId: integer('product_id').notNull().references(() => products.id),
  price: doublePrecision('price'),
  currency: text('currency'),
  priceText: text('price_text'),
  specText: text('spec_text'),
  crawlId: integer('crawl_id').references(() => crawls.id),
  capturedAt: integer('captured_at').notNull(),
}, (t) => [index('idx_price_history_product_time').on(t.productId, t.capturedAt)]);

export const alerts = pgTable('alerts', {
  id: serial('id').primaryKey(),
  crawlId: integer('crawl_id').references(() => crawls.id),
  type: text('type').notNull(),
  severity: text('severity').notNull(),
  companyId: integer('company_id').references(() => companies.id),
  categoryId: integer('category_id').references(() => categories.id),
  productId: integer('product_id').references(() => products.id),
  message: text('message').notNull(),
  payload: jsonb('payload'),
  status: text('status').notNull().default('open'),
  createdAt: integer('created_at').notNull(),
});

// 泛型内容（非产品采集：新闻 / 公告 / 活动等）。结构与 schema-sqlite.ts 完全一致，仅列类型换 PG 等价物。
export const contents = pgTable('contents', {
  id: serial('id').primaryKey(), // 自增主键
  companyId: integer('company_id').notNull().references(() => companies.id), // 所属公司
  contentType: text('content_type').notNull().default('news'), // 内容类型：news / announcement / event…（= section.contentType）
  sectionKey: text('section_key').notNull().default('default'), // 栏目维度（参与去重键）
  dedupeKey: text('dedupe_key').notNull(), // 去重键 = COALESCE(source_id, canonical(detail_url))
  sourceId: text('source_id'), // 站点自身的内容 id
  title: text('title').notNull(), // 标题
  summary: text('summary'), // 摘要
  body: text('body'), // 正文纯文本
  author: text('author'), // 作者 / 来源
  publishedAt: integer('published_at'), // 发布时间（Unix 秒，可空）
  detailUrl: text('detail_url'), // 原文链接
  row: jsonb('row'), // 兜底原始抽取快照（JSON）
  status: text('status').notNull().default('active'), // 状态：active / removed
  firstSeenAt: integer('first_seen_at').notNull(), // 首次发现时间（Unix 秒）
  lastSeenAt: integer('last_seen_at').notNull(), // 最近出现时间（Unix 秒）
  missingSince: integer('missing_since'), // 首次缺失时间（Unix 秒）
  createdAt: integer('created_at').notNull(), // 创建时间（Unix 秒）
  updatedAt: integer('updated_at').notNull(), // 更新时间（Unix 秒）
}, (t) => [
  uniqueIndex('uniq_content').on(t.companyId, t.dedupeKey, t.sectionKey), // 组合唯一（同 products 口径）
  index('idx_content_company_type').on(t.companyId, t.contentType, t.status), // 按公司/类型筛选
  index('idx_content_published').on(t.publishedAt), // 按发布时间排序
]);

export const pgSchema = { companies, categories, products, crawls, priceHistory, alerts, contents };
export type PgSchema = typeof pgSchema;
