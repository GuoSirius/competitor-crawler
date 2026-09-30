import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PendingProduct } from './crawl.js';

// 增量批量落库集成测试（docs/16 规模化兜底）：用真实 SQLite 验证
// flushUpsertBatch 的多行事务 upsert + 批量价格历史、幂等（更新不重复）、计数正确。
// 必须在首次 import shared 前建测试库（db/index.ts 模块加载时即求值 dbUrl）。
const { createTestDb } = await import('../testing/testDb.js');
await createTestDb('upsert-batch');

const { createDb, companies, products, priceHistory, crawls, eq, inArray, nowSeconds } =
  await import('@competitor-crawler/shared');
const { flushUpsertBatch } = await import('./crawl.js');
const { Progress } = await import('../util/progress.js');

const { db } = createDb();
const dialect = 'sqlite' as const;

let companyId = 0;
let crawlId = 0;
const progress = new Progress();
const sectionKey = 'batch-test';

function makeSummary() {
  return {
    companies: 0,
    categories: 0,
    sections: 0,
    new: 0,
    updated: 0,
    delisted: 0,
    pricePoints: 0,
    failed: 0,
    adapterSites: 0,
    contentNew: 0,
    contentUpdated: 0,
    missingPages: [],
  };
}

function mkProduct(i: number, price: number | null): PendingProduct {
  return {
    companyId,
    categoryId: null,
    breadcrumb: null,
    sectionKey,
    identityKey: `ik-${i}`,
    sourceProductId: `sp-${i}`,
    sku: `sku-${i}`,
    name: `产品${i}`,
    englishName: null,
    aliases: null,
    oldSkus: null,
    brand: null,
    detailUrl: `https://x.com/p/${i}`,
    listUrl: `https://x.com/list`,
    price,
    currency: 'CNY',
    priceText: price === null ? null : `${price}`,
    specText: null,
    description: null,
    specs: [],
    introMedia: [],
    cloneNumber: null,
    applications: null,
    row: {},
  };
}

beforeAll(async () => {
  const [c] = await db
    .insert(companies)
    .values({ name: '批落库-公司', createdAt: nowSeconds(), updatedAt: nowSeconds() })
    .returning();
  companyId = c.id;
  const [cr] = await db
    .insert(crawls)
    .values({ trigger: 'manual', status: 'running', startedAt: nowSeconds() })
    .returning();
  crawlId = cr.id;
});

afterAll(async () => {
  // 先删价格历史（外键引用 products.id），再删产品与公司
  const ids = (await db.select({ id: products.id }).from(products).where(eq(products.companyId, companyId))).map((r) => r.id);
  if (ids.length > 0) await db.delete(priceHistory).where(inArray(priceHistory.productId, ids));
  await db.delete(products).where(eq(products.companyId, companyId));
  await db.delete(companies).where(eq(companies.id, companyId));
});

describe('flushUpsertBatch — 增量批量落库', () => {
  it('单批写入：products 行数 == 批大小，summary.new 正确，有价即记价格历史', async () => {
    const summary = makeSummary();
    const batch = [mkProduct(1, 10), mkProduct(2, 20), mkProduct(3, null)];
    await flushUpsertBatch(db, dialect, batch, new Map(), summary, nowSeconds(), crawlId, progress, 'x.com', sectionKey);

    const rows = await db.select().from(products).where(eq(products.companyId, companyId));
    expect(rows.length).toBe(3);
    expect(summary.new).toBe(3);
    // 价格历史：2 条有价（ik-1/ik-2），ik-3 无价不记
    const ph = await db.select().from(priceHistory);
    expect(ph.length).toBe(2);
    expect(summary.pricePoints).toBe(2);
  });

  it('超批大小仍原子处理：一批 250 条全部落库且无重复', async () => {
    const summary = makeSummary();
    const batch = Array.from({ length: 250 }, (_, k) => mkProduct(1000 + k, 5));
    await flushUpsertBatch(db, dialect, batch, new Map(), summary, nowSeconds(), crawlId, progress, 'x.com', sectionKey);

    const rows = await db.select().from(products).where(eq(products.companyId, companyId));
    // 之前 3 条 + 本批 250 条
    expect(rows.length).toBe(253);
    expect(summary.new).toBe(250);
    expect(summary.pricePoints).toBe(250);
  });

  it('幂等：重跑同 identityKey 的批 → 更新而非新增，summary.updated 计数正确', async () => {
    // 先读现有价格，模拟 loadExisting 注入 existed（用于 updated 计数）
    const existing = await db.select({ identityKey: products.identityKey, id: products.id, price: products.price }).from(products).where(eq(products.companyId, companyId));
    const existed = new Map(existing.map((r) => [r.identityKey, { id: r.id, price: r.price }]));

    const summary = makeSummary();
    // 改 ik-1 价格 10→99（触发价格历史），ik-2 不变
    const batch = [mkProduct(1, 99), mkProduct(2, 20)];
    await flushUpsertBatch(db, dialect, batch, existed, summary, nowSeconds() + 10, crawlId, progress, 'x.com', sectionKey);

    const rows = await db.select().from(products).where(eq(products.companyId, companyId));
    expect(rows.length).toBe(253); // 不新增行
    expect(summary.new).toBe(0);
    expect(summary.updated).toBe(2);
    // ik-1 价格变化 → 多记一条价格历史（累计 2+250+1=253）
    const ph = await db.select().from(priceHistory);
    expect(ph.length).toBe(253);
  });
});
