import { describe, it, expect, afterAll, beforeAll } from 'vitest';

// ── contents 表集成冒烟（docs/16 Q5 un-skip）────────────
// 不再依赖「仓库真实库副本」：用 testing/testDb 按共享 schema 全量建表，CI/新机器同样可跑。
// 必须在首次 import shared 前改写 DATABASE_URL（db/index.ts 在模块加载时求值 dbUrl），
// 故这里全部走动态 import。
const { createTestDb } = await import('../testing/testDb.js');
await createTestDb('smoke-contents');

const { createDb, companies, contents, eq, nowSeconds } = await import('@competitor-crawler/shared');
const { upsertContent, softDeleteMissingContents } = await import('./crawl.js');

const { db } = createDb();

let company: { id: number };

beforeAll(async () => {
  [company] = await db
    .insert(companies)
    .values({ name: '冒烟-内容公司', createdAt: nowSeconds(), updatedAt: nowSeconds() })
    .returning();
});

function content(overrides: Record<string, unknown> = {}) {
  return {
    companyId: company.id,
    contentType: 'news',
    sectionKey: 'news',
    identityKey: 'k-1',
    sourceId: null,
    title: '标题一',
    summary: null,
    body: null,
    author: null,
    publishedAt: null,
    detailUrl: 'https://x.com/news/1',
    row: {},
    ...overrides,
  } as Parameters<typeof upsertContent>[1];
}

afterAll(async () => {
  await db.delete(contents).where(eq(contents.companyId, company.id));
  await db.delete(companies).where(eq(companies.id, company.id));
});

describe('contents 表集成冒烟（真实 SQLite）', () => {
  it('upsert：同 identityKey 二次写入 = 更新同一行', async () => {
    const now = nowSeconds();
    await upsertContent(db, content(), now);
    await upsertContent(db, content({ title: '标题一（更新）' }), now + 5);
    const rows = await db.select().from(contents).where(eq(contents.companyId, company.id));
    expect(rows.length).toBe(1);
    expect(rows[0].title).toBe('标题一（更新）');
    expect(rows[0].lastSeenAt).toBe(now + 5);
    expect(rows[0].contentType).toBe('news');
  });

  it('contentType 原样落库（公告不再误存为 news）', async () => {
    await upsertContent(db, content({ identityKey: 'k-2', contentType: 'announcement', title: '公告A' }), nowSeconds());
    const [row] = await db.select().from(contents).where(eq(contents.identityKey, 'k-2'));
    expect(row.contentType).toBe('announcement');
  });

  it('软删：连续 2 轮缺失才 removed，首轮只记 missingSince', async () => {
    const now = nowSeconds();
    // 独立 sectionKey，避免被上面用例的 k-1/k-2 残留行污染 seen 集合
    await upsertContent(db, content({ sectionKey: 'news-sd', identityKey: 'k-3', title: '在线' }), now);
    await upsertContent(db, content({ sectionKey: 'news-sd', identityKey: 'k-4', title: '将缺失' }), now);

    // 第 1 轮：只见到 k-3 → k-4 记 missingSince，仍 active
    let removed = await softDeleteMissingContents(db, company.id, 'news-sd', new Set(['k-3']), now + 10);
    expect(removed).toBe(0);
    let [b] = await db.select().from(contents).where(eq(contents.identityKey, 'k-4'));
    expect(b.status).toBe('active');
    expect(b.missingSince).toBe(now + 10);

    // 第 2 轮：仍只见到 k-3 → k-4 removed
    removed = await softDeleteMissingContents(db, company.id, 'news-sd', new Set(['k-3']), now + 20);
    expect(removed).toBe(1);
    [b] = await db.select().from(contents).where(eq(contents.identityKey, 'k-4'));
    expect(b.status).toBe('removed');
    expect(b.missingSince).toBeNull();

    // 复活：removed 条目重新被抓到 → upsert 恢复 active
    await upsertContent(db, content({ sectionKey: 'news-sd', identityKey: 'k-4', title: '将缺失' }), now + 30);
    [b] = await db.select().from(contents).where(eq(contents.identityKey, 'k-4'));
    expect(b.status).toBe('active');
  });
});
