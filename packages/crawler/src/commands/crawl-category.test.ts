import { describe, it, expect, afterAll, beforeAll } from 'vitest';

// ── upsertCategoryPath 集成测试：面包屑动态建树 + 幂等复用 ─────────
// 与 crawl-content-db.test.ts 同套路：createTestDb 按 shared schema 全量建表，动态 import。
// 新表结构：分类树按 sectionId 归属（categories.section_id）；产品线已上移 sections 表，不再作树根。
const { createTestDb } = await import('../testing/testDb.js');
await createTestDb('smoke-category-path');

const { createDb, companies, sections, categories, eq, nowSeconds } = await import('@competitor-crawler/shared');
const { upsertCategoryPath } = await import('./crawl.js');

const { db } = createDb();

let company: { id: number };
let sectionId: number;
const progressStub = { update: () => {}, done: () => {}, log: () => {} } as never;

beforeAll(async () => {
  [company] = await db
    .insert(companies)
    .values({ name: '冒烟-分类公司', domain: 'category-smoke.test', createdAt: nowSeconds(), updatedAt: nowSeconds() })
    .returning();
  const [sec] = await db
    .insert(sections)
    .values({ companyId: company.id, key: 'default', name: 'default', createdAt: nowSeconds(), updatedAt: nowSeconds() })
    .returning();
  sectionId = sec.id;
});

afterAll(async () => {
  await db.delete(categories).where(eq(categories.companyId, company.id));
  await db.delete(sections).where(eq(sections.companyId, company.id));
  await db.delete(companies).where(eq(companies.id, company.id));
});

describe('upsertCategoryPath（面包屑 → 通用分类树）', () => {
  it('单层路径 path=name、level=0、parentId=null，挂到指定 section', async () => {
    const id = await upsertCategoryPath(db, company.id, sectionId, ['抗体'], 'https://x.com/ab', false, progressStub);
    const [row] = await db.select().from(categories).where(eq(categories.id, id));
    expect(row.path).toBe('抗体');
    expect(row.name).toBe('抗体');
    expect(row.level).toBe(0);
    expect(row.parentId).toBeNull();
    expect(row.url).toBe('https://x.com/ab');
    expect(row.sectionId).toBe(sectionId); // 分类树按 sectionId 归属（替代旧 contentType 分区）
  });

  it('多级面包屑逐层建树（path/level/parent 正确；中间节点不挂 URL）', async () => {
    const leaf = await upsertCategoryPath(
      db, company.id, sectionId, ['试剂', '抗体'], 'https://x.com/ab2', false, progressStub,
    );
    const [leafRow] = await db.select().from(categories).where(eq(categories.id, leaf));
    expect(leafRow.path).toBe('试剂/抗体');
    expect(leafRow.level).toBe(1);
    expect(leafRow.url).toBe('https://x.com/ab2');

    const [root] = await db.select().from(categories).where(eq(categories.path, '试剂'));
    expect(root.parentId).toBeNull();
    expect(leafRow.parentId).toBe(root.id);
  });

  it('同路径重复 upsert 幂等：更新不新建，url 以最新为准', async () => {
    const first = await upsertCategoryPath(
      db, company.id, sectionId, ['耗材'], 'https://x.com/old', false, progressStub,
    );
    const second = await upsertCategoryPath(
      db, company.id, sectionId, ['耗材'], 'https://x.com/new', false, progressStub,
    );
    expect(second).toBe(first);
    const rows = await db.select().from(categories).where(eq(categories.path, '耗材'));
    expect(rows).toHaveLength(1);
    expect(rows[0].url).toBe('https://x.com/new');
  });

  it('dryRun 哨兵 0：未命中不写入，返回 0', async () => {
    const id = await upsertCategoryPath(
      db, company.id, sectionId, ['不存在的分类'], null, true, progressStub,
    );
    expect(id).toBe(0);
    const rows = await db.select().from(categories).where(eq(categories.path, '不存在的分类'));
    expect(rows).toHaveLength(0);
  });
});
