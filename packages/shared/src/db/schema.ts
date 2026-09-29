import { schema as sqliteSchema, type Schema } from './schema-sqlite.js';
import { mysqlSchema } from './schema-mysql.js';
import { pgSchema } from './schema-pg.js';

// 公共具名表符号：consumers 仍直接 `import { products } from '@competitor-crawler/shared'`，
// 这里保持 SQLite 类型——既是默认路径，也是 typecheck 校验基准。
// 运行期若切方言，createDb 用对应方言 schema 构建 db；三方言表名/列名/索引同名同语义，DML 无感、查询零改动。
export const { companies, categories, products, crawls, priceHistory, alerts, contents } = sqliteSchema;
export { sqliteSchema, mysqlSchema, pgSchema };

export const schema = sqliteSchema;
export type { Schema };

export type DbDialect = 'sqlite' | 'mysql' | 'postgresql';

/** drizzle-kit push 按方言取的 schema 集合（见 drizzle.config.ts） */
export const PUSH_SCHEMAS = {
  sqlite: sqliteSchema,
  mysql: mysqlSchema,
  postgresql: pgSchema,
} as const;

/** 运行期按 DB_DIALECT 取对应方言 schema（createDb 内部使用） */
export function getDialectSchema(dialect: DbDialect) {
  switch (dialect) {
    case 'mysql':
      return mysqlSchema;
    case 'postgresql':
      return pgSchema;
    default:
      return sqliteSchema;
  }
}
