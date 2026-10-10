import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PendingProduct } from './crawl.js';

// 增量批量落库集成测试（docs/16 规模化兜底）：用真实 SQLite 验证
// flushUpsertBatch 的多行事务 upsert + 批量价格历史、幂等（更新不重复）、计数正确。
// 必须在首次 import shared 前建测试库（db/index.ts 模块加载时即求值 dbUrl）。
const { createTestDb } = await import('../testing/testDb.js');
await createTestDb('upsert-batch');

const { createDb, companies, sections, products, priceHistory, productDiffs, crawls, eq, inArray, nowSeconds } =
  await import('@competitor-crawler/shared');
const { flushUpsertBatch } = await import('./crawl.js');
const { Progress } = await import('../util/progress.js');

const { db } = createDb();
const dialect = 'sqlite' as const;

let companyId = 0;
let crawlId = 0;
let sectionId = 0;
const progress = new Progress();

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
    fieldMismatches: {},
  };
}

function mkProduct(i: number, price: number | null): PendingProduct {
  return {
    companyId,
    categoryId: null,
    breadcrumb: null,
    sectionId,
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

/** 读全量旧值快照（与 crawl.loadExisting 同列），供 existed 注入：字段级 diff 需要旧 name/sku/row 等 */
async function loadExistedFull() {
  const existing = await db
    .select({
      id: products.id,
      identityKey: products.identityKey,
      price: products.price,
      name: products.name,
      sku: products.sku,
      priceText: products.priceText,
      specText: products.specText,
      specs: products.specs,
      row: products.row,
    })
    .from(products)
    .where(eq(products.companyId, companyId));
  return new Map(existing.map((r) => [r.identityKey, r]));
}

beforeAll(async () => {
  const [c] = await db
    .insert(companies)
    .values({ name: '批落库-公司', domain: 'upsert-batch.test', createdAt: nowSeconds(), updatedAt: nowSeconds() })
    .returning();
  companyId = c.id;
  const [s] = await db
    .insert(sections)
    .values({ companyId, key: 'batch-test', name: 'batch-test', createdAt: nowSeconds(), updatedAt: nowSeconds() })
    .returning();
  sectionId = s.id;
  const [cr] = await db
    .insert(crawls)
    .values({ trigger: 'manual', status: 'running', startedAt: nowSeconds() })
    .returning();
  crawlId = cr.id;
});

afterAll(async () => {
  // 先删 diff/价格历史（外键引用 products.id），再删产品、栏目与公司
  const ids = (await db.select({ id: products.id }).from(products).where(eq(products.companyId, companyId))).map((r) => r.id);
  if (ids.length > 0) {
    await db.delete(productDiffs).where(inArray(productDiffs.productId, ids));
    await db.delete(priceHistory).where(inArray(priceHistory.productId, ids));
  }
  await db.delete(products).where(eq(products.companyId, companyId));
  await db.delete(sections).where(eq(sections.companyId, companyId));
  await db.delete(companies).where(eq(companies.id, companyId));
});

describe('flushUpsertBatch — 增量批量落库', () => {
  it('单批写入：products 行数 == 批大小，summary.new 正确，有价即记价格历史', async () => {
    const summary = makeSummary();
    const batch = [mkProduct(1, 10), mkProduct(2, 20), mkProduct(3, null)];
    await flushUpsertBatch(db, dialect, batch, new Map(), summary, nowSeconds(), crawlId, progress);
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
    await flushUpsertBatch(db, dialect, batch, new Map(), summary, nowSeconds(), crawlId, progress);

    const rows = await db.select().from(products).where(eq(products.companyId, companyId));
    // 之前 3 条 + 本批 250 条
    expect(rows.length).toBe(253);
    expect(summary.new).toBe(250);
    expect(summary.pricePoints).toBe(250);
  });

  it('幂等：重跑同 identityKey 的批 → 更新而非新增，summary.updated 计数正确', async () => {
    // 先读现有全量快照，模拟 loadExisting 注入 existed（用于 updated 计数与字段级 diff）
    const existed = await loadExistedFull();

    const summary = makeSummary();
    // 改 ik-1 价格 10→99（触发价格历史），ik-2 不变
    const batch = [mkProduct(1, 99), mkProduct(2, 20)];
    await flushUpsertBatch(db, dialect, batch, existed, summary, nowSeconds() + 10, crawlId, progress);

    const rows = await db.select().from(products).where(eq(products.companyId, companyId));
    expect(rows.length).toBe(253); // 不新增行
    expect(summary.new).toBe(0);
    expect(summary.updated).toBe(2);
    // ik-1 价格变化 → 多记一条价格历史（累计 2+250+1=253）
    const ph = await db.select().from(priceHistory);
    expect(ph.length).toBe(253);
  });
});

describe('flushUpsertBatch — 字段级 diff（product_diffs，Task #78）', () => {
  /** 构造「相对当前库值」的增量批：改 ik-1 的 name 与新增 row.stock，价格等保持不变 */
  function changedBatch(): PendingProduct[] {
    const batch = [mkProduct(1, 99), mkProduct(2, 20)];
    batch[0]!.name = '产品1-改';
    batch[0]!.row = { stock: '现货' };
    return batch;
  }

  it('更新已有产品：变更字段逐条入 product_diffs，未变更字段不写行', async () => {
    const existed = await loadExistedFull();
    const before = (await db.select().from(productDiffs)).length;
    const summary = makeSummary();
    const capturedAt = nowSeconds() + 20;
    await flushUpsertBatch(db, dialect, changedBatch(), existed, summary, capturedAt, crawlId, progress);

    const added = (await db.select().from(productDiffs)).slice(before);
    const fields = added.map((r) => r.field).sort();
    // name 变更 + row.stock 新增；price/priceText/specText/sku/specs 均未变
    expect(fields).toEqual(['name', 'row.stock']);
    const nameDiff = added.find((r) => r.field === 'name')!;
    expect(JSON.parse(nameDiff.oldValue!)).toBe('产品1');
    expect(JSON.parse(nameDiff.newValue!)).toBe('产品1-改');
    const stockDiff = added.find((r) => r.field === 'row.stock')!;
    expect(stockDiff.oldValue).toBeNull();
    expect(JSON.parse(stockDiff.newValue!)).toBe('现货');
    expect(nameDiff.crawlId).toBe(crawlId);
    expect(nameDiff.capturedAt).toBe(capturedAt);
  });

  it('重复跑同样数据：无字段变更 → product_diffs 不新增行', async () => {
    const existed = await loadExistedFull();
    const before = (await db.select().from(productDiffs)).length;
    const summary = makeSummary();
    await flushUpsertBatch(db, dialect, changedBatch(), existed, summary, nowSeconds() + 30, crawlId, progress);
    expect((await db.select().from(productDiffs)).length).toBe(before);
  });
});
