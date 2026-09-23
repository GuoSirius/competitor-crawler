// JSON 取值 / 键重命名 / 宽松解析：供「内联 JSON（<script> 里的变量）」与
// 「异步接口（Network 里找到的 JSON）」两类抽取共用（见 docs/05 §5.3.4 形态 C/D）。

/**
 * 按点号路径从 JSON 里取值，如 `'data.list'`、`'props.skus.0'`。
 * - 路径为空/未传 → 返回原值
 * - 途经数组时用数字下标
 * - 任一段取不到 → 返回 undefined（不抛错）
 */
export function walkPath(root: unknown, path?: string): unknown {
  if (!path) return root;
  let cur: unknown = root;
  for (const seg of path.split('.')) {
    if (cur == null) return undefined;
    if (Array.isArray(cur)) {
      const i = Number(seg);
      if (!Number.isInteger(i)) return undefined;
      cur = cur[i];
    } else if (typeof cur === 'object') {
      cur = (cur as Record<string, unknown>)[seg];
    } else {
      return undefined;
    }
  }
  return cur;
}

/**
 * 键重命名：`pick = { 我方键: 站点键 }`。
 * - 传入数组 → 逐项重命名（常见：规格列表）
 * - 传入对象 → 重命名该对象
 * - 其余（null / 标量）→ 原样返回
 * - 站点键取不到时**不写该键**（保持与我方内置字段「缺则空」语义一致）
 */
export function renameKeys(v: unknown, pick?: Record<string, string>): unknown {
  if (!pick || v == null) return v;
  const one = (o: unknown): unknown => {
    if (o == null || typeof o !== 'object' || Array.isArray(o)) return o;
    const src = o as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [mine, theirs] of Object.entries(pick)) {
      if (src[theirs] !== undefined) out[mine] = src[theirs];
    }
    return out;
  };
  return Array.isArray(v) ? v.map(one) : one(v);
}

/**
 * 宽松 JSON 解析：先直接 parse；失败则尝试截取**最外层** `{...}` / `[...]` 再 parse。
 * 用于 `<script>` 里 `var skuList = [...]; // 后面还有别的代码` 这类夹带场景。
 * 彻底失败返回 **null**（而非 undefined），便于上层判空。
 */
export function tryParseJson(text: string | null | undefined): unknown {
  if (text == null) return null;
  const s = text.trim();
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    // 容错：定位最外层括号范围
  }
  const start = s.search(/[[{]/);
  if (start < 0) return null;
  const end = Math.max(s.lastIndexOf('}'), s.lastIndexOf(']'));
  if (end <= start) return null;
  try {
    return JSON.parse(s.slice(start, end + 1));
  } catch {
    return null;
  }
}
