import { mysqlTable, int, double, text, varchar, json, index, uniqueIndex } from 'drizzle-orm/mysql-core';

// MySQL 方言 schema —— 结构与 SQLite 完全一致，仅列类型换成语方言等价物：
//   integer PK autoincrement → int autoincrement PK
//   real(price)             → double
//   text(mode:'json')       → json（mysql2 自动序列化/反序列化）
//   integer(时间/外键)        → int
// 表名、列名、唯一/普通索引、默认值 三方言保持同名同语义，保证切换无歧义、查询零改动。
//
// ── 字段类型与长度规范（docs/16 🔴-1，2026-09-29 修复；原则：三思而后行、预留充足）──
// 1. MySQL 对 TEXT 列建索引必须指定前缀长度（否则 db:push ERROR 1170）；InnoDB 索引总长 ≤3072 字节
//    （utf8mb4 每字符 4 字节）→ **凡参与索引的字符串列必须 varchar 定长**，且长度按字节预算反推：
//      uniq_product/uniq_content = int(4) + dedupe_key 700×4=2800 + section_key 64×4=256 = 3060 ≤ 3072
//      uniq_cat  = int(4) + 255×4 + 255×4 = 2044；  companies.name unique = 1020；  idx_company_sku = 1024
//    （早期评审建议 dedupe_key varchar(1024) 是错的：1024×4=4096 已超限。）
//    实测比评审更严重：所有被索引的 text 列（companies.name/role/productLine/categories.name/sku/
//    status/content_type）都会炸，本次一并 varchar 化。
// 2. 非索引字符串列 → 同样 varchar 定长（长度不受索引约束，**充分预留**）：
//      URL 类 1024；标题/规格原文/告警消息 512~1024；货号/站点ID/品牌/作者 255；枚举码 16~64。
//    varchar 存储按实际长度计费，定长只影响允许上限，宽设定无存储代价、杜绝「Data too long」。
// 3. 长自由文本（description / summary / body）保持 TEXT；结构化列用 JSON。
// 4. 时间戳统一 int（Unix 秒，时区无关）；价格统一 double（与 SQLite real / PG doublePrecision 对齐，
//    不引入 decimal 破坏三方言一致性）。
// 5. SQLite/PG 方言保持 text：SQLite 动态类型不校验长度；PG 的 text 本就无长度限制且为惯用类型。

export const companies = mysqlTable('companies', {
  id: int('id').autoincrement().primaryKey(),
  name: varchar('name', { length: 255 }).notNull().unique(),
  website: varchar('website', { length: 1024 }),
  competitorType: varchar('competitor_type', { length: 64 }),
  role: varchar('role', { length: 32 }).notNull().default('competitor'),
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
  productLine: varchar('product_line', { length: 255 }),
  name: varchar('name', { length: 255 }).notNull(),
  url: varchar('url', { length: 1024 }).notNull(),
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
  sourceProductId: varchar('source_product_id', { length: 255 }),
  sku: varchar('sku', { length: 255 }),
  dedupeKey: varchar('dedupe_key', { length: 700 }).notNull(),
  sectionKey: varchar('section_key', { length: 64 }).notNull().default('default'),
  name: varchar('name', { length: 512 }),
  englishName: varchar('english_name', { length: 255 }),
  brand: varchar('brand', { length: 255 }),
  detailUrl: varchar('detail_url', { length: 1024 }),
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
  uniqueIndex('uniq_product').on(t.companyId, t.dedupeKey, t.sectionKey),
  index('idx_company_cat_status').on(t.companyId, t.categoryId, t.status),
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

// 泛型内容（非产品采集：新闻 / 公告 / 活动等）。结构与 schema-sqlite.ts 完全一致，仅列类型换 MySQL 等价物。
export const contents = mysqlTable('contents', {
  id: int('id').autoincrement().primaryKey(), // 自增主键
  companyId: int('company_id').notNull().references(() => companies.id), // 所属公司
  contentType: varchar('content_type', { length: 32 }).notNull().default('news'), // 内容类型：news / announcement / event…（= section.contentType）
  sectionKey: varchar('section_key', { length: 64 }).notNull().default('default'), // 栏目维度（参与去重键）
  dedupeKey: varchar('dedupe_key', { length: 700 }).notNull(), // 去重键 = COALESCE(source_id, canonical(detail_url))
  sourceId: varchar('source_id', { length: 255 }), // 站点自身的内容 id
  title: varchar('title', { length: 512 }).notNull(), // 标题
  summary: text('summary'), // 摘要
  body: text('body'), // 正文纯文本
  author: varchar('author', { length: 255 }), // 作者 / 来源
  publishedAt: int('published_at'), // 发布时间（Unix 秒，可空）
  detailUrl: varchar('detail_url', { length: 1024 }), // 原文链接
  row: json('row'), // 兜底原始抽取快照（JSON）
  status: varchar('status', { length: 32 }).notNull().default('active'), // 状态：active / removed
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
