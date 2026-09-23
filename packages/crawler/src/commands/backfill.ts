import { createDb, products, nowSeconds } from '@competitor-crawler/shared';
import { eq } from 'drizzle-orm';
import { Progress } from '../util/progress.js';

export interface BackfillOpts {
  /** 已通过 db:push 新建的列名（物理列，如 clone_number） */
  column: string;
  /** row JSON 中对应的源字段 key（如 "Clone Number"） */
  rowKey: string;
  /** 只统计影响行数、不写库 */
  dry?: boolean;
}

/**
 * 字段晋升回填：把 row 中某个频繁/重要字段值，回填到已新建的独立列。
 * 对应 docs/03 §3.9「字段晋升 + 从 row 回填」场景。
 * - 仅回填「目标列为空 且 row 中确有该 key」的行，幂等可反复跑。
 * - dry 模式先统计影响行数，确认无误再正式回填。
 */
export async function backfill(opts: BackfillOpts): Promise<void> {
  const { db } = createDb();
  const progress = new Progress();
  const all = await db.select().from(products);
  let affected = 0;
  for (const r of all) {
    const rowObj = (r.row ?? {}) as Record<string, unknown>;
    const val = rowObj[opts.rowKey];
    if (val === undefined || val === null || val === '') continue;
    const current = (r as Record<string, unknown>)[opts.column];
    if (current !== undefined && current !== null && current !== '') continue; // 已填过，跳过
    affected++;
    if (opts.dry) continue;
    await db
      .update(products)
      .set({ [opts.column]: String(val), updatedAt: nowSeconds() } as Record<string, unknown>)
      .where(eq(products.id, r.id));
  }
  progress.done(`[backfill] column=${opts.column} rowKey=${opts.rowKey} 命中 ${affected} 行 (dry=${!!opts.dry})`);
}
