import { pgTable, serial, integer, doublePrecision, text, jsonb, index, uniqueIndex, type AnyPgColumn } from 'drizzle-orm/pg-core';

// PostgreSQL 方言 schema —— 结构与 SQLite/MySQL 完全一致，仅列类型换成语方言等价物：
//   integer PK autoincrement → serial PK；real(price) → doublePrecision；
//   text(mode:'json') → jsonb；integer(时间/外键) → integer。
// 表名、列名、索引名、默认值三方言保持同名同语义，切换无歧义、查询零改动。

export const companies = pgTable('companies', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  website: text('website'),
  competitorType: text('competitor_type'), // 竞品类型（YAML 顶层 competitorType 可声明，YAML 声明为准）
  role: text('role').notNull().default('competitor'), // own=我方 / competitor=竞品（YAML 顶层 role 可声明）
  sourceRow: jsonb('source_row'),
  removedAt: integer('removed_at'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (t) => [
  index('idx_company_role').on(t.role),
]);

// 通用分类表：结构同 schema-sqlite.ts，仅列类型换 PG 等价物。
export const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id').notNull().references(() => companies.id),
  contentType: text('content_type').notNull().default('products'),
  // 自引用外键必须显式标注 AnyPgColumn，否则 TS 循环推断报 TS7022
  parentId: integer('parent_id').references((): AnyPgColumn => categories.id), // 父节点；NULL=根
  path: text('path').notNull(), // 面包屑全路径（业务主键的一部分）
  name: text('name').notNull(),
  level: integer('level').notNull().default(0),
  productLine: text('product_line'), // 产品线（根节点写入，向下冗余；= path 根节点的镜像，语义以 path 首段为准）
  url: text('url'), // 列表页 URL（可空）
  sourceRow: jsonb('source_row'),
  removedAt: integer('removed_at'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (t) => [
  uniqueIndex('uniq_cat').on(t.companyId, t.contentType, t.path),
  index('idx_cat_parent').on(t.companyId, t.contentType, t.parentId),
  index('idx_cat_pline').on(t.companyId, t.contentType, t.productLine),
]);

export const products = pgTable('products', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id').notNull().references(() => companies.id),
  categoryId: integer('category_id').references(() => categories.id),
  contentType: text('content_type').notNull().default('products'),
  sourceProductId: text('source_product_id'),
  sku: text('sku'),
  identityKey: text('identity_key').notNull(),
  sectionKey: text('section_key').notNull().default('default'),
  name: text('name'),
  englishName: text('english_name'),
  brand: text('brand'),
  detailUrl: text('detail_url'),
  listUrl: text('list_url'),
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
  uniqueIndex('uniq_product').on(t.companyId, t.identityKey, t.sectionKey),
  index('idx_product_section').on(t.companyId, t.sectionKey, t.status),
  index('idx_product_cat').on(t.companyId, t.categoryId, t.status),
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

// 泛型内容（非产品采集）。结构与 schema-sqlite.ts 一致，仅列类型换 PG 等价物。
export const contents = pgTable('contents', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id').notNull().references(() => companies.id),
  categoryId: integer('category_id').references(() => categories.id),
  contentType: text('content_type').notNull().default('news'),
  sectionKey: text('section_key').notNull().default('default'),
  identityKey: text('identity_key').notNull(),
  sourceId: text('source_id'),
  title: text('title').notNull(),
  summary: text('summary'),
  body: text('body'),
  author: text('author'),
  publishedAt: integer('published_at'),
  detailUrl: text('detail_url'),
  listUrl: text('list_url'),
  row: jsonb('row'),
  status: text('status').notNull().default('active'),
  firstSeenAt: integer('first_seen_at').notNull(),
  lastSeenAt: integer('last_seen_at').notNull(),
  missingSince: integer('missing_since'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (t) => [
  uniqueIndex('uniq_content').on(t.companyId, t.identityKey, t.sectionKey),
  index('idx_content_section').on(t.companyId, t.sectionKey, t.status),
  index('idx_content_type').on(t.companyId, t.contentType, t.categoryId, t.status),
  index('idx_content_published').on(t.publishedAt),
]);

export const pgSchema = { companies, categories, products, crawls, priceHistory, alerts, contents };
export type PgSchema = typeof pgSchema;
