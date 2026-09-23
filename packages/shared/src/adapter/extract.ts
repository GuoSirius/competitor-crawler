import type { DomRead, FieldSpec } from './spec.js';

/**
 * 按 FieldSpec 从 DOM 上下文抽取一个字段。
 * - 有 map → 嵌套对象（list 时为对象数组）
 * - 无 map → 叶子值（text / attr / regex）
 */
export function extractField(node: DomRead, spec: FieldSpec): unknown {
  if (spec.map) {
    const children = node.list(spec.sel);
    if (spec.list) {
      return children.map((c) => extractObject(c, spec.map!));
    }
    return children[0] ? extractObject(children[0], spec.map) : null;
  }

  const matches = node.list(spec.sel);
  if (spec.list) {
    return matches
      .map((n) => coerce(applyRegex(readRaw(n, spec), spec.regex), spec))
      .filter((v) => v != null);
  }
  const first = matches[0];
  return first ? coerce(applyRegex(readRaw(first, spec), spec.regex), spec) : null;
}

/** 按 spec.number 决定是否把叶子值转成数值 */
function coerce(v: string | null, spec: FieldSpec): string | number | null {
  if (!spec.number || v == null) return v;
  return toNumber(v);
}

/** 「1,280.00」/「￥1,280.00 元」→ 1280；无法解析返回 null */
export function toNumber(raw: string): number | null {
  const cleaned = raw.replace(/[^\d.\-]/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '.' || cleaned === '-.') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** 抽取一组字段为对象（供详情页 / 列表项使用） */
export function extractObject(node: DomRead, map: Record<string, FieldSpec>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, spec] of Object.entries(map)) {
    out[key] = extractField(node, spec);
  }
  return out;
}

function readRaw(n: DomRead, spec: FieldSpec): string | null {
  // sel 已在 node.list(spec.sel) 中应用，这里 n 是匹配到的子节点
  if (spec.attr) return n.attr(spec.attr);
  return n.text();
}

function applyRegex(raw: string | null, regex?: string): string | null {
  if (raw == null) return null;
  if (!regex) return raw;
  try {
    const m = new RegExp(regex).exec(raw);
    if (!m) return null;
    return m[1] !== undefined ? m[1] : m[0];
  } catch {
    return null;
  }
}
