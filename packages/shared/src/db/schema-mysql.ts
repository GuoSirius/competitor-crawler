import { mysqlTable, int, double, text, varchar, json, index, uniqueIndex, type AnyMySqlColumn } from 'drizzle-orm/mysql-core';

// MySQL 方言 schema —— 结构与 SQLite 完全一致，仅列类型换成语方言等价物：
//   integer PK autoincrement → int autoincrement PK；real(price) → double；
//   text(mode:'json') → json；integer(时间/外键) → int。
// 表名、列名、索引名、默认值三方言保持同名同语义，切换无歧义、查询零改动。
//
// ⚠️ MySQL 索引字节预算（InnoDB ≤3072 字节，utf8mb4 每字符 4 字节）：
//   凡参与索引的字符串列必须 varchar 定长。本文件唯一键字节核算——
//     uniq_product / uniq_content = int(4) + section_id int(4) + identity_key 700×4=2800 = 2808 ≤ 3072
//     uniq_cat = int(4) + section_id int(4) + path 700×4=2800 = 2808 ≤ 3072
//     uniq_section = int(4) + key 128×4=512 = 516 ≤ 3072
//   非索引字符串列（name/title/url/brand…）同样 varchar 定长、充分预留，杜绝「Data too long」。

export const companies = mysqlTable('companies', {
  id: int('id').autoincrement().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  domain: varchar('domain', { length: 255 }).notNull().unique(), // 唯一判别键：归一化小写、去协议/末尾斜杠
  shortName: varchar('short_name', { length: 255 }), // 市场部简称（YAML companyShort），仅展示
  website: varchar('website', { length: 1024 }),
  competitorType: varchar('competitor_type', { length: 64 }), // 竞品类型（YAML 顶层 competitorType 可声明，YAML 声明为准）
  role: varchar('role', { length: 32 }).notNull().default('competitor'), // own=我方 / competitor=竞品（YAML 顶层 role 可声明）
  sourceRow: json('source_row'),
  removedAt: int('removed_at'),
  createdAt: int('created_at').notNull(),
  updatedAt: int('updated_at').notNull(),
}, (t) => [
  index('idx_company_role').on(t.role),
]);

// 栏目（一等公民）：结构同 schema-sqlite.ts，仅列类型换 MySQL 等价物。
export const sections = mysqlTable('sections', {
  id: int('id').autoincrement().primaryKey(),
  companyId: int('company_id').notNull().references(() => companies.id),
  key: varchar('key', { length: 128 }).notNull(), // 栏目标识（YAML section key，如 cat-1092 / default）
  name: varchar('name', { length: 255 }).notNull(), // 展示名（缺省回退 key）
  contentType: varchar('content_type', { length: 32 }).notNull().default('products'), // 落库表路由：products / news / announcement…
  productLine: varchar('product_line', { length: 255 }), // 该栏目产品线（--product-line 筛选）
  brand: varchar('brand', { length: 255 }), // 该栏目对标品牌（products.brand 缺省回退到这里）
  renderMode: varchar('render_mode', { length: 32 }), // 该栏目生效渲染模式（ssr/browser/auto）
  source: varchar('source', { length: 32 }).notNull().default('config'), // 配置来源：config / seed
  createdAt: int('created_at').notNull(),
  updatedAt: int('updated_at').notNull(),
}, (t) => [
  uniqueIndex('uniq_section').on(t.companyId, t.key),
  index('idx_section_company').on(t.companyId, t.contentType),
]);

// 通用分类表：结构同 schema-sqlite.ts，仅列类型换 MySQL 等价物。
export const categories = mysqlTable('categories', {
  id: int('id').autoincrement().primaryKey(),
  companyId: int('company_id').notNull().references(() => companies.id),
  sectionId: int('section_id').notNull().references(() => sections.id), // 归属栏目（替代 contentType 分区）
  // 自引用外键必须显式标注 AnyMySqlColumn，否则 TS 循环推断报 TS7022
  parentId: int('parent_id').references((): AnyMySqlColumn => categories.id), // 父节点；NULL=根
  path: varchar('path', { length: 700 }).notNull(), // 面包屑全路径（业务主键的一部分）
  idPath: varchar('id_path', { length: 255 }), // id 物化路径 '0-<rootId>-…-<selfId>'：辅助键，改名不动它；子树查询按前缀 LIKE。可空=旧数据待下轮爬取自愈
  name: varchar('name', { length: 255 }).notNull(),
  level: int('level').notNull().default(0),
  url: varchar('url', { length: 1024 }), // 列表页 URL（可空）
  sourceRow: json('source_row'),
  removedAt: int('removed_at'),
  createdAt: int('created_at').notNull(),
  updatedAt: int('updated_at').notNull(),
}, (t) => [
  uniqueIndex('uniq_cat').on(t.companyId, t.sectionId, t.path),
  index('idx_cat_parent').on(t.companyId, t.sectionId, t.parentId),
  index('idx_cat_idpath').on(t.companyId, t.sectionId, t.idPath), // id 子树前缀扫描（改名安全）
]);

export const products = mysqlTable('products', {
  id: int('id').autoincrement().primaryKey(),
  companyId: int('company_id').notNull().references(() => companies.id),
  categoryId: int('category_id').references(() => categories.id),
  sectionId: int('section_id').notNull().references(() => sections.id), // 归属栏目（替代 section_key + contentType）
  sourceProductId: varchar('source_product_id', { length: 255 }),
  sku: varchar('sku', { length: 255 }),
  identityKey: varchar('identity_key', { length: 700 }).notNull(),
  name: varchar('name', { length: 512 }),
  englishName: varchar('english_name', { length: 255 }),
  aliases: varchar('aliases', { length: 1024 }), // 别称/曾用名（站点拼接原样）
  oldSkus: varchar('old_skus', { length: 512 }), // 曾用货号（拼接串）
  brand: varchar('brand', { length: 255 }),
  detailUrl: varchar('detail_url', { length: 1024 }),
  listUrl: varchar('list_url', { length: 1024 }),
  price: double('price'),
  currency: varchar('currency', { length: 16 }),
  priceText: varchar('price_text', { length: 255 }),
  specText: varchar('spec_text', { length: 1024 }),
  description: text('description'),
  specs: json('specs'),
  introMedia: json('intro_media'),
  cloneNumber: varchar('clone_number', { length: 255 }),
  applications: json('applications'),
  row: json('row'),
  status: varchar('status', { length: 32 }).notNull().default('active'),
  firstSeenAt: int('first_seen_at').notNull(),
  lastSeenAt: int('last_seen_at').notNull(),
  missingSince: int('missing_since'),
  createdAt: int('created_at').notNull(),
  updatedAt: int('updated_at').notNull(),
}, (t) => [
  uniqueIndex('uniq_product').on(t.companyId, t.sectionId, t.identityKey),
  index('idx_product_section').on(t.companyId, t.sectionId, t.status),
  index('idx_product_cat').on(t.companyId, t.categoryId, t.status),
  index('idx_company_sku').on(t.companyId, t.sku),
]);

export const crawls = mysqlTable('crawls', {
  id: int('id').autoincrement().primaryKey(),
  trigger: varchar('trigger', { length: 32 }).notNull(),
  status: varchar('status', { length: 32 }).notNull(),
  modelMode: varchar('model_mode', { length: 32 }),
  summary: json('summary'),
  startedAt: int('started_at').notNull(),
  finishedAt: int('finished_at'),
});

export const priceHistory = mysqlTable('price_history', {
  id: int('id').autoincrement().primaryKey(),
  productId: int('product_id').notNull().references(() => products.id),
  price: double('price'),
  currency: varchar('currency', { length: 16 }),
  priceText: varchar('price_text', { length: 255 }),
  specText: varchar('spec_text', { length: 1024 }),
  crawlId: int('crawl_id').references(() => crawls.id),
  capturedAt: int('captured_at').notNull(),
}, (t) => [index('idx_price_history_product_time').on(t.productId, t.capturedAt)]);

// 产品字段级变更（Task #78 / docs/04 ⑥ 变化归因的管线基础），与 sqlite 同名同语义。
// old/new 统一 JSON 序列化文本；行内自由字段记作 `row.<key>`。
export const productDiffs = mysqlTable('product_diffs', {
  id: int('id').autoincrement().primaryKey(),
  productId: int('product_id').notNull().references(() => products.id),
  field: varchar('field', { length: 128 }).notNull(),
  oldValue: text('old_value'),
  newValue: text('new_value'),
  crawlId: int('crawl_id').references(() => crawls.id),
  capturedAt: int('captured_at').notNull(),
}, (t) => [index('idx_product_diffs_product_time').on(t.productId, t.capturedAt)]);

export const alerts = mysqlTable('alerts', {
  id: int('id').autoincrement().primaryKey(),
  crawlId: int('crawl_id').references(() => crawls.id),
  type: varchar('type', { length: 64 }).notNull(),
  severity: varchar('severity', { length: 32 }).notNull(),
  companyId: int('company_id').references(() => companies.id),
  categoryId: int('category_id').references(() => categories.id),
  productId: int('product_id').references(() => products.id),
  message: varchar('message', { length: 1024 }).notNull(),
  payload: json('payload'),
  status: varchar('status', { length: 32 }).notNull().default('open'),
  createdAt: int('created_at').notNull(),
});

// 泛型内容（非产品采集）。结构与 schema-sqlite.ts 一致，仅列类型换 MySQL 等价物。
export const contents = mysqlTable('contents', {
  id: int('id').autoincrement().primaryKey(),
  companyId: int('company_id').notNull().references(() => companies.id),
  categoryId: int('category_id').references(() => categories.id),
  sectionId: int('section_id').notNull().references(() => sections.id), // 归属栏目（替代 section_key）
  contentType: varchar('content_type', { length: 32 }).notNull().default('news'), // = section.contentType
  identityKey: varchar('identity_key', { length: 700 }).notNull(),
  sourceId: varchar('source_id', { length: 255 }),
  title: varchar('title', { length: 512 }).notNull(),
  summary: text('summary'),
  body: text('body'),
  bodyHtml: text('body_html'), // 正文富文本（innerHTML）；仅 YAML 显式配 html: true 的栏才有值，默认 null
  author: varchar('author', { length: 255 }),
  publishedAt: int('published_at'),
  detailUrl: varchar('detail_url', { length: 1024 }),
  listUrl: varchar('list_url', { length: 1024 }),
  row: json('row'),
  status: varchar('status', { length: 32 }).notNull().default('active'),
  firstSeenAt: int('first_seen_at').notNull(),
  lastSeenAt: int('last_seen_at').notNull(),
  missingSince: int('missing_since'),
  createdAt: int('created_at').notNull(),
  updatedAt: int('updated_at').notNull(),
}, (t) => [
  uniqueIndex('uniq_content').on(t.companyId, t.sectionId, t.identityKey),
  index('idx_content_section').on(t.companyId, t.sectionId, t.status),
  index('idx_content_type').on(t.companyId, t.contentType, t.categoryId, t.status),
  index('idx_content_published').on(t.publishedAt),
]);

export const mysqlSchema = { companies, sections, categories, products, crawls, priceHistory, productDiffs, alerts, contents };
export type MysqlSchema = typeof mysqlSchema;
