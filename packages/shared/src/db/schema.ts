import { sqliteTable, integer, text, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

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
}, (t) => ({
  // 业务主键：同一公司下的「产品线 + 品类名」唯一
  uniqCat: uniqueIndex('uniq_cat').on(t.companyId, t.productLine, t.name),
}));

// 产品（归一化 + 兜底）
export const products = sqliteTable('products', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  companyId: integer('company_id').notNull().references(() => companies.id),
  categoryId: integer('category_id').references(() => categories.id),
  sourceProductId: text('source_product_id'),
  dedupeKey: text('dedupe_key').notNull(),
  // 栏目维度：同一 SKU 出现在不同 section（如「全部产品」「促销」）时分开存为两条（去重口径 B）。
  // 单规则站点的产品统一写 'default'，保证旧数据与旧配置零感知。
  sectionKey: text('section_key').notNull().default('default'),
  name: text('name'),
  detailUrl: text('detail_url'),
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
}, (t) => ({
  // ★ 组合唯一索引：一个产品在公司内、按栏目唯一（去重口径 B：section_key 并入去重键）
  // 同一 SKU 出现在不同 section 时分开为两条，适合「同 SKU 在不同栏目详情内容确实不同」的场景。
  uniqProduct: uniqueIndex('uniq_product').on(t.companyId, t.dedupeKey, t.sectionKey),
  idxCompanyCatStatus: index('idx_company_cat_status').on(t.companyId, t.categoryId, t.status),
}));

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

export const schema = { companies, categories, products, crawls, alerts };
export type Schema = typeof schema;
