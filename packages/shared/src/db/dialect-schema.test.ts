import { describe, it, expect } from 'vitest';
import { getTableColumns, getTableName } from 'drizzle-orm';
import {
  sqliteSchema,
  mysqlSchema,
  pgSchema,
  getDialectSchema,
  type DbDialect,
} from './schema.js';

const EXPECTED_TABLES = [
  'companies',
  'categories',
  'products',
  'crawls',
  'priceHistory',
  'productDiffs',
  'alerts',
  'contents',
] as const;

// JS 对象键为驼峰，SQL 表名为 snake_case（drizzle 表定义的首参），两者分别校验
const EXPECTED_SQL_NAMES: Record<(typeof EXPECTED_TABLES)[number], string> = {
  companies: 'companies',
  categories: 'categories',
  products: 'products',
  crawls: 'crawls',
  priceHistory: 'price_history',
  productDiffs: 'product_diffs',
  alerts: 'alerts',
  contents: 'contents',
};

const SCHEMAS: Record<DbDialect, Record<string, unknown>> = {
  sqlite: sqliteSchema,
  mysql: mysqlSchema,
  postgresql: pgSchema,
};

describe('三方言 schema 一致性（无 DB）', () => {
  it('每个方言都导出相同的 8 张表', () => {
    for (const dialect of Object.keys(SCHEMAS) as DbDialect[]) {
      const keys = Object.keys(SCHEMAS[dialect]).sort();
      expect(keys).toEqual([...EXPECTED_TABLES].sort());
    }
  });

  it('每张表的 SQL 表名三方言一致', () => {
    for (const name of EXPECTED_TABLES) {
      const sqlNames = (['sqlite', 'mysql', 'postgresql'] as DbDialect[]).map((d) =>
        getTableName(SCHEMAS[d][name] as never),
      );
      expect(new Set(sqlNames).size).toBe(1);
      expect(sqlNames[0]).toBe(EXPECTED_SQL_NAMES[name]);
    }
  });

  it('每张表的列名（含索引/外键列）三方言完全一致', () => {
    for (const name of EXPECTED_TABLES) {
      const colSets = (['sqlite', 'mysql', 'postgresql'] as DbDialect[]).map((d) =>
        Object.keys(getTableColumns(SCHEMAS[d][name] as never))
          .slice()
          .sort(),
      );
      expect(colSets[1]).toEqual(colSets[0]);
      expect(colSets[2]).toEqual(colSets[0]);
    }
  });

  it('getDialectSchema 按方言返回对应 schema', () => {
    expect(getDialectSchema('sqlite')).toBe(sqliteSchema);
    expect(getDialectSchema('mysql')).toBe(mysqlSchema);
    expect(getDialectSchema('postgresql')).toBe(pgSchema);
  });
});
