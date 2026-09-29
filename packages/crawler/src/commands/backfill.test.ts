import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';

// backfill 集成测试（docs/16 Q1）：全新空 SQLite（drizzle pushSQLiteSchema 建表），自包含不依赖真实库。
// 必须在首次 import shared 前改写 DATABASE_URL → 全部走动态 import。
const { createTestDb } = await import('../testing/testDb.js');
await createTestDb('backfill');

const { createDb, companies, products, nowSeconds, eq } = await import('@competitor-crawler/shared');
const { backfill } = await import('./backfill.js');

const { db } = createDb();
let companyId: number;

beforeAll(async () => {
  const [c] = await db
    .insert(companies)
    .values({ name: '回填测试公司', createdAt: nowSeconds(), updatedAt: nowSeconds() })
    .returning();
  companyId = c.id;
});

afterAll(async () => {
  await db.delete(products).where(eq(products.companyId, companyId));
  await db.delete(companies).where(eq(companies.id, companyId));
  // 测试库目录留给 .tmp（.gitignore 已忽略），下次同名单测会整目录重建
});

function product(overrides: Record<string, unknown> = {}) {
  const now = nowSeconds();
  return {
    companyId,
    categoryId: null,
    sectionKey: 'default',
    identityKey: `k-${Math.random().toString(36).slice(2)}`,
    row: {},
    status: 'active',
    firstSeenAt: now,
    lastSeenAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('backfill 字段晋升回填（真实 SQLite）', () => {
  it('dry=true 只统计不写库；正式跑回填 row 值到列，且幂等', async () => {
    await db.insert(products).values([
      product({ identityKey: 'b1', row: { 'Clone Number': 'K-01' } }),
      product({ identityKey: 'b2', row: { 'Clone Number': '' } }), // row 值为空 → 不命中
      product({ identityKey: 'b3', row: {}, cloneNumber: '已填' }), // 列已有值 → 跳过
    ] as never);

    // dry：只统计（b1 命中；b2/b3 跳过）
    await backfill({ column: 'cloneNumber', rowKey: 'Clone Number', dry: true });
    const [b1dry] = await db.select().from(products).where(eq(products.identityKey, 'b1'));
    expect(b1dry.cloneNumber).toBeNull();

    // 正式回填
    await backfill({ column: 'cloneNumber', rowKey: 'Clone Number' });
    const [b1] = await db.select().from(products).where(eq(products.identityKey, 'b1'));
    expect(b1.cloneNumber).toBe('K-01');

    // 幂等：再跑一次不会改写
    await backfill({ column: 'cloneNumber', rowKey: 'Clone Number' });
    const [b1again] = await db.select().from(products).where(eq(products.identityKey, 'b1'));
    expect(b1again.cloneNumber).toBe('K-01');

    // 清理本用例行，避免影响后续用例统计
    await db.delete(products).where(eq(products.identityKey, 'b1'));
    await db.delete(products).where(eq(products.identityKey, 'b2'));
    await db.delete(products).where(eq(products.identityKey, 'b3'));
  });
});
