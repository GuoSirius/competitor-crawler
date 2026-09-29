import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// ── contents 表集成冒烟：真实 SQLite 文件库（.tmp 下副本，不入库）────────────
// 必须在首次 import shared 前改写 DATABASE_URL（db/index.ts 在模块加载时求值 dbUrl），
// 故这里全部走动态 import。用仓库真实库的副本启动（空文件没有表结构）。
const tmpDir = path.join(process.cwd(), '.tmp', 'smoke-contents');
fs.rmSync(tmpDir, { recursive: true, force: true });
fs.mkdirSync(tmpDir, { recursive: true });
const srcDb = path.join(process.cwd(), 'data', 'crawler.sqlite');
const smokeDb = path.join(tmpDir, 'smoke.sqlite');
if (fs.existsSync(srcDb)) {
  // 真实库是 WAL 模式：先 checkpoint 把 -wal 合并进主文件，否则复制的副本缺最新表。
  // better-sqlite3 不在 crawler 直接依赖里，从 shared 的依赖上下文解析（pnpm 严格模式）。
  const { createRequire } = await import('node:module');
  const req = createRequire(path.join(process.cwd(), 'packages', 'shared', 'src', 'index.ts'));
  const Database = req('better-sqlite3');
  const src = new Database(srcDb);
  src.pragma('wal_checkpoint(TRUNCATE)');
  src.close();
  fs.copyFileSync(srcDb, smokeDb);
}
process.env.DATABASE_URL = smokeDb;
delete process.env.DB_DIALECT;

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
    dedupeKey: 'k-1',
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

describe.skipIf(!fs.existsSync(srcDb))('contents 表集成冒烟（真实 SQLite）', () => {
  it('upsert：同 dedupeKey 二次写入 = 更新同一行', async () => {
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
    await upsertContent(db, content({ dedupeKey: 'k-2', contentType: 'announcement', title: '公告A' }), nowSeconds());
    const [row] = await db.select().from(contents).where(eq(contents.dedupeKey, 'k-2'));
    expect(row.contentType).toBe('announcement');
  });

  it('软删：连续 2 轮缺失才 removed，首轮只记 missingSince', async () => {
    const now = nowSeconds();
    // 独立 sectionKey，避免被上面用例的 k-1/k-2 残留行污染 seen 集合
    await upsertContent(db, content({ sectionKey: 'news-sd', dedupeKey: 'k-3', title: '在线' }), now);
    await upsertContent(db, content({ sectionKey: 'news-sd', dedupeKey: 'k-4', title: '将缺失' }), now);

    // 第 1 轮：只见到 k-3 → k-4 记 missingSince，仍 active
    let removed = await softDeleteMissingContents(db, company.id, 'news-sd', new Set(['k-3']), now + 10);
    expect(removed).toBe(0);
    let [b] = await db.select().from(contents).where(eq(contents.dedupeKey, 'k-4'));
    expect(b.status).toBe('active');
    expect(b.missingSince).toBe(now + 10);

    // 第 2 轮：仍只见到 k-3 → k-4 removed
    removed = await softDeleteMissingContents(db, company.id, 'news-sd', new Set(['k-3']), now + 20);
    expect(removed).toBe(1);
    [b] = await db.select().from(contents).where(eq(contents.dedupeKey, 'k-4'));
    expect(b.status).toBe('removed');
    expect(b.missingSince).toBeNull();

    // 复活：removed 条目重新被抓到 → upsert 恢复 active
    await upsertContent(db, content({ sectionKey: 'news-sd', dedupeKey: 'k-4', title: '将缺失' }), now + 30);
    [b] = await db.select().from(contents).where(eq(contents.dedupeKey, 'k-4'));
    expect(b.status).toBe('active');
  });
});
