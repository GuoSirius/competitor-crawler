import { createDb, products, companies, nowSeconds, normalizeDomain } from '@competitor-crawler/shared';
import { and, eq, gt, getTableColumns } from 'drizzle-orm';
import { Progress } from '../util/progress.js';

export interface BackfillOpts {
  /** 已通过 db:push 新建的列名（物理列，如 clone_number） */
  column: string;
  /** row JSON 中对应的源字段 key（如 "Clone Number"） */
  rowKey: string;
  /** 只回填指定站点（按域名；不填=全站） */
  domain?: string;
  /** 游标分页每批大小（默认 500），避免全表载入内存 */
  batch?: number;
  /** 只统计影响行数、不写库 */
  dry?: boolean;
}

type ProductRow = Record<string, unknown> & { id: number; row?: unknown };

/**
 * 字段晋升回填：把 row 中某个频繁/重要字段值，回填到已新建的独立列。
 * 对应 docs/03 §3.9「字段晋升 + 从 row 回填」场景。
 * - 支持 domain 过滤（只处理指定站点）与按 id 游标分页（避免全表载入内存）。
 * - 仅回填「目标列为空 且 row 中确有该 key」的行，幂等可反复跑；object 型行值跳过。
 * - dry 模式先统计影响行数，确认无误再正式回填。
 */
export async function backfill(opts: BackfillOpts): Promise<void> {
  const { db } = createDb();
  const progress = new Progress();

  // 列名白名单：防止误把不存在的列写进 set（drizzle 会运行时报「列不在表中」）
  const validCols = new Set(Object.keys(getTableColumns(products)));
  if (!validCols.has(opts.column)) {
    throw new Error(`未知列名 '${opts.column}'，products 表可用列：${[...validCols].join(', ')}`);
  }

  const batch = Math.max(1, Math.floor(opts.batch ?? 500));
  const domain = opts.domain ? normalizeDomain(opts.domain) : undefined;

  let lastId = 0;
  let scanned = 0;
  let affected = 0;

  const fetchPage = async (): Promise<ProductRow[]> => {
    if (domain) {
      const rows = await db
        .select({ p: products })
        .from(products)
        .innerJoin(companies, eq(products.companyId, companies.id))
        .where(and(gt(products.id, lastId), eq(companies.domain, domain)))
        .orderBy(products.id)
        .limit(batch);
      return rows.map((r) => r.p as unknown as ProductRow);
    }
    const rows = await db
      .select({ p: products })
      .from(products)
      .where(gt(products.id, lastId))
      .orderBy(products.id)
      .limit(batch);
    return rows.map((r) => r.p as unknown as ProductRow);
  };

  for (;;) {
    const page = await fetchPage();
    if (page.length === 0) break;

    for (const r of page) {
      const rowObj = ((r.row as Record<string, unknown>) ?? {}) as Record<string, unknown>;
      const val = rowObj[opts.rowKey];
      if (val === undefined || val === null || val === '' || typeof val === 'object') continue;
      const current = r[opts.column];
      if (current !== undefined && current !== null && current !== '') continue; // 已填过，跳过
      affected++;
      if (opts.dry) continue;
      await db
        .update(products)
        .set({ [opts.column]: String(val), updatedAt: nowSeconds() } as Record<string, unknown>)
        .where(eq(products.id, r.id));
    }

    scanned += page.length;
    lastId = page[page.length - 1].id;
    progress.update(`[backfill] 已扫描 ${scanned} 行，命中 ${affected} 行 (dry=${!!opts.dry})`);
    if (page.length < batch) break;
  }

  progress.done(
    `[backfill] column=${opts.column} rowKey=${opts.rowKey}${domain ? ` domain=${domain}` : ''} 扫描 ${scanned} 行，命中 ${affected} 行 (dry=${!!opts.dry})`,
  );
}
