import { describe, it, expect, afterAll, beforeAll } from 'vitest';

// ── upsertCategoryPath 集成测试：面包屑动态建树 + 幂等复用 ─────────
// 与 crawl-content-db.test.ts 同套路：createTestDb 按 shared schema 全量建表，动态 import。
const { createTestDb } = await import('../testing/testDb.js');
await createTestDb('smoke-category-path');

const { createDb, companies, categories, eq, nowSeconds } = await import('@competitor-crawler/shared');
const { upsertCategoryPath } = await import('./crawl.js');

const { db } = createDb();

let company: { id: number };

beforeAll(async () => {
  [company] = await db
    .insert(companies)
    .values({ name: '冒烟-分类公司', createdAt: nowSeconds(), updatedAt: nowSeconds() })
    .returning();
});

afterAll(async () => {
  await db.delete(categories).where(eq(categories.companyId, company.id));
  await db.delete(companies).where(eq(companies.id, company.id));
});

describe('upsertCategoryPath（面包屑 → 通用分类树）', () => {
  it('无产品线：单层路径 path=name、level=0、parentId=null', async () => {
    const id = await upsertCategoryPath(db, company.id, ['抗体'], 'https://x.com/ab', null, false, {
      update: () => {},
      done: () => {},
    } as never);
    const [row] = await db.select().from(categories).where(eq(categories.id, id));
    expect(row.path).toBe('抗体');
    expect(row.name).toBe('抗体');
    expect(row.level).toBe(0);
    expect(row.parentId).toBeNull();
    expect(row.url).toBe('https://x.com/ab');
    expect(row.contentType).toBe('products');
  });

  it('带产品线：productLine 作根节点，品类挂其下（path/level/parent 正确）', async () => {
    const leaf = await upsertCategoryPath(
      db, company.id, ['试剂', '抗体'], 'https://x.com/ab2', '科研试剂', false,
      { update: () => {}, done: () => {} } as never,
    );
    const [leafRow] = await db.select().from(categories).where(eq(categories.id, leaf));
    expect(leafRow.path).toBe('科研试剂/试剂/抗体');
    expect(leafRow.level).toBe(2);
    expect(leafRow.url).toBe('https://x.com/ab2');

    const [root] = await db.select().from(categories).where(eq(categories.path, '科研试剂'));
    expect(root.parentId).toBeNull();
    expect(root.productLine).toBe('科研试剂');
    expect(leafRow.parentId).not.toBeNull();

    const mid = await db.select().from(categories).where(eq(categories.path, '科研试剂/试剂'));
    expect(mid[0].parentId).toBe(root.id);
    expect(mid[0].url).toBeNull(); // 中间节点不挂列表 URL
  });

  it('同路径重复 upsert 幂等：更新不新建，url 以最新为准', async () => {
    const first = await upsertCategoryPath(
      db, company.id, ['耗材'], 'https://x.com/old', null, false,
      { update: () => {}, done: () => {} } as never,
    );
    const second = await upsertCategoryPath(
      db, company.id, ['耗材'], 'https://x.com/new', null, false,
      { update: () => {}, done: () => {} } as never,
    );
    expect(second).toBe(first);
    const rows = await db.select().from(categories).where(eq(categories.path, '耗材'));
    expect(rows).toHaveLength(1);
    expect(rows[0].url).toBe('https://x.com/new');
  });

  it('dryRun 哨兵 0：未命中不写入，返回 0', async () => {
    const id = await upsertCategoryPath(
      db, company.id, ['不存在的分类'], null, null, true,
      { update: () => {}, done: () => {} } as never,
    );
    expect(id).toBe(0);
    const rows = await db.select().from(categories).where(eq(categories.path, '不存在的分类'));
    expect(rows).toHaveLength(0);
  });
});
