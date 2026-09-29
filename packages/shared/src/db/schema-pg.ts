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

export const pgSchema = { companies, categories, products, crawls, priceHistory, alerts };
export type PgSchema = typeof pgSchema;
