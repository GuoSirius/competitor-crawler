import { domainOf, createDb } from '@competitor-crawler/shared';
import {
  companies, categories, products, contents, crawls, priceHistory, productDiffs, alerts, sql, eq, inArray,
} from '@competitor-crawler/shared';

export interface DbClearOpts {
  /** 站点域名列表（与 YAML 文件名 / company.website 对齐，逗号分隔传多个）；空数组 = 清空全库 */
  domains: string[];
  /** 真正执行删除；缺省为预览模式（只统计、不删），防误触 */
  yes?: boolean;
}

// 8 张业务表（含父子关系），用于全量清空与预览计数。顺序无强制要求（sqlite FK 默认关闭；
// mysql/pg 分支按外键安全顺序删子表再删父表）。
const ALL_TABLES: { name: string; table: unknown }[] = [
  { name: 'price_history', table: priceHistory },
  { name: 'product_diffs', table: productDiffs },
  { name: 'alerts', table: alerts },
  { name: 'products', table: products },
  { name: 'contents', table: contents },
  { name: 'categories', table: categories },
  { name: 'crawls', table: crawls },
  { name: 'companies', table: companies },
];

/**
 * 一键清空数据库（单站测试排查用）。
 *
 * - 默认 sqlite / mysql / postgresql 统一走 `createDb()` 返回的 drizzle 句柄。
 * - 不带 `--yes` 时只打印「将清空什么 + 当前行数」，不执行任何删除（防误触）。
 * - `--domain a.com` 清单站；`--domain a.com,b.com` 清多个站（逗号分隔）；省略则清空全库。
 *   `--site` 是 `--domain` 的别名，二者等价。
 * - 单站模式按 company.website 域名（domainOf 归一化）匹配，与 crawl 的 resolveCompanyId 同口径；
 *   清空该站「所有相关数据」（产品/新闻/分类/价格历史/字段变更/告警/公司行），下次 crawl 从 YAML 重建。
 * - 全库模式额外重置自增计数器（sqlite_sequence），使后续入库技术索引从 1 开始。
 */
export async function dbClear(opts: DbClearOpts): Promise<void> {
  const { dialect, db } = createDb();
  const normalize = (s: string) => s.toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const wants = opts.domains.map(normalize).filter(Boolean);

  // ---- 解析目标公司（多站模式）----
  const companies_ = await db
    .select({ id: companies.id, name: companies.name, website: companies.website })
    .from(companies);
  const resolve = (w: string) =>
    companies_.find((c) => domainOf(c.website) === w || normalize(String(c.name)) === w);

  const targets: { id: number; name: string }[] = [];
  const notFound: string[] = [];
  for (const w of wants) {
    const hit = resolve(w);
    if (!hit) notFound.push(w);
    else targets.push({ id: hit.id, name: hit.name });
  }
  if (notFound.length) {
    const avail = companies_.map((c) => `  - ${c.name}  (${c.website ?? '—'})`).join('\n');
    throw new Error(`未找到以下站点对应的公司：${notFound.join(', ')}\n已入库公司：\n${avail || '（无）'}`);
  }

  const full = targets.length === 0;

  // ---- 预览模式：只统计，不删 ----
  if (!opts.yes) {
    if (full) {
      const counts: Record<string, number> = {};
      let total = 0;
      for (const { name, table } of ALL_TABLES) {
        const rows = (await db.select({ c: sql<number>`count(*)` }).from(table as never)) as { c: number }[];
        const n = Number(rows[0]?.c ?? 0);
        counts[name] = n;
        total += n;
      }
      console.log(`[db:clear] 预览（dialect=${dialect}，未执行删除）`);
      console.log(`[db:clear] 范围：全库   当前总行数：${total}`);
      console.log(`[db:clear] 各表行数：${JSON.stringify(counts)}`);
      console.log(`[db:clear] 确认清空全库（索引将从 1 重置）请追加 --yes：pnpm db:clear -- --yes`);
    } else {
      console.log(`[db:clear] 预览（dialect=${dialect}，未执行删除）`);
      console.log(`[db:clear] 将清空 ${targets.length} 个站点：`);
      let total = 0;
      for (const t of targets) {
        const n = await countSite(db, t.id);
        total += n;
        console.log(`  - 「${t.name}」(companyId=${t.id})  相关数据约 ${n} 行`);
      }
      console.log(`[db:clear] 合计约 ${total} 行；确认清空请追加 --yes：`);
      console.log(`          pnpm db:clear -- --domain ${opts.domains.join(',')} --yes`);
    }
    return;
  }

  // ---- 执行删除 ----
  if (full) {
    for (const { table } of ALL_TABLES) {
      await db.delete(table as never);
    }
    if (dialect === 'sqlite') {
      try {
        await (db as unknown as { run: (q: unknown) => Promise<unknown> }).run(sql`DELETE FROM sqlite_sequence`);
      } catch (e) {
        console.warn(`[db:clear] 重置 sqlite_sequence 失败（可忽略）：${(e as Error).message}`);
      }
    }
    console.log(`[db:clear] 已清空全库（${ALL_TABLES.length} 张表已清空${dialect === 'sqlite' ? '，自增计数器已重置，后续入库索引从 1 开始' : ''}）`);
  } else {
    for (const t of targets) {
      const productSub = db.select({ id: products.id }).from(products).where(eq(products.companyId, t.id));
      const categorySub = db.select({ id: categories.id }).from(categories).where(eq(categories.companyId, t.id));
      // 经 productId 间接关联的子表
      await db.delete(priceHistory).where(inArray(priceHistory.productId, productSub));
      await db.delete(productDiffs).where(inArray(productDiffs.productId, productSub));
      // 告警：公司直属 + 引用本站产品/分类的（含已删产品导致的孤儿告警），分三条删避免缺 or 算子
      await db.delete(alerts).where(eq(alerts.companyId, t.id));
      await db.delete(alerts).where(inArray(alerts.productId, productSub));
      await db.delete(alerts).where(inArray(alerts.categoryId, categorySub));
      await db.delete(products).where(eq(products.companyId, t.id));
      await db.delete(contents).where(eq(contents.companyId, t.id));
      await db.delete(categories).where(eq(categories.companyId, t.id));
      await db.delete(companies).where(eq(companies.id, t.id));
      console.log(`[db:clear] 已清空单站「${t.name}」(companyId=${t.id}) 的全部相关数据`);
    }
  }
}

/** 统计某公司在各子表的行数合计（预览用） */
async function countSite(db: any, companyId: number): Promise<number> {
  let total = 0;
  // 直接挂 companyId 的子表
  for (const t of [products, contents, categories, alerts]) {
    const [row] = await db.select({ c: sql<number>`count(*)` }).from(t).where(eq(t.companyId, companyId));
    total += Number(row?.c ?? 0);
  }
  // 经 productId 间接关联的子表（无 companyId 列）
  const sub = db.select({ id: products.id }).from(products).where(eq(products.companyId, companyId));
  for (const t of [priceHistory, productDiffs]) {
    const [row] = await db.select({ c: sql<number>`count(*)` }).from(t).where(inArray(t.productId, sub));
    total += Number(row?.c ?? 0);
  }
  return total;
}
