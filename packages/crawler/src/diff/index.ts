/**
 * 产品字段级 diff（Task #78 / docs/04 ⑥ 变化归因的管线基础）。
 *
 * 职责：把「库中旧值快照」与「本轮新抓的 PendingProduct」做字段级对比，
 * 产出 product_diffs 表的行数据（不含 productId/crawlId 等落库上下文，由调用方补）。
 *
 * 口径：
 * - 内置列比对 name / sku / price / priceText / specText / specs；
 * - row（captureRest 兜底 JSON）按**键级**比对，字段名记作 `row.<key>`；
 *   一方缺键视为 null → 也会记一条（键的消失本身也是变更）。
 * - 值统一 JSON.stringify 后比较（null/undefined → null），数组/对象整体比较；
 *   JSON 对象键序敏感（同一抽取管线产出，键序稳定，可接受）。
 * - 仅对「已存在产品」调用（新入库产品没有旧值，无从 diff）。
 */
import type { PendingProduct } from '../commands/crawl.js';

/** 库中旧值快照（crawl.loadExisting 查出的 diff 相关列） */
export interface PrevProductSnapshot {
  name: string | null;
  sku: string | null;
  price: number | null;
  priceText: string | null;
  specText: string | null;
  specs: unknown;
  row: unknown;
}

/** 一条字段级变更（product_diffs 表一行，缺 productId/crawlId/capturedAt 上下文） */
export interface ProductDiffRow {
  field: string;
  oldValue: string | null;
  newValue: string | null;
}

const SCALAR_FIELDS: Array<{ field: string; pick: (p: PrevProductSnapshot) => unknown; next: (p: PendingProduct) => unknown }> = [
  { field: 'name', pick: (p) => p.name, next: (p) => p.name },
  { field: 'sku', pick: (p) => p.sku, next: (p) => p.sku },
  { field: 'price', pick: (p) => p.price, next: (p) => p.price },
  { field: 'priceText', pick: (p) => p.priceText, next: (p) => p.priceText },
  { field: 'specText', pick: (p) => p.specText, next: (p) => p.specText },
  { field: 'specs', pick: (p) => p.specs, next: (p) => p.specs },
];

/** 比对旧快照与新产品，返回变更字段列表（顺序：内置列在前，row.* 按键名字典序） */
export function diffProductFields(prev: PrevProductSnapshot, next: PendingProduct): ProductDiffRow[] {
  const out: ProductDiffRow[] = [];
  for (const f of SCALAR_FIELDS) {
    const ov = serialize(f.pick(prev));
    const nv = serialize(f.next(next));
    if (ov !== nv) out.push({ field: f.field, oldValue: ov, newValue: nv });
  }
  const prevRow = asRecord(prev.row);
  const nextRow = asRecord(next.row);
  const keys = [...new Set([...Object.keys(prevRow), ...Object.keys(nextRow)])].sort();
  for (const k of keys) {
    const ov = serialize(prevRow[k] ?? null);
    const nv = serialize(nextRow[k] ?? null);
    if (ov !== nv) out.push({ field: `row.${k}`, oldValue: ov, newValue: nv });
  }
  return out;
}

function serialize(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return JSON.stringify(v);
}

function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
