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

export const mysqlSchema = { companies, categories, products, crawls, priceHistory, alerts };
export type MysqlSchema = typeof mysqlSchema;
