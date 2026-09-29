/**
 * Excel 读取公共助手（docs/16 M9：genSiteBatch / xlsxToSeeds 的重复逻辑收敛于此）。
 * 只做「读值 / 识别列」，写表样式见 commands/report.ts（display 语义不同，不复用）。
 */
import ExcelJS from 'exceljs';

/**
 * 取单元格文本：兼容 富文本(.text) / 数字 / 普通值，trim 后空串归 null。
 * 注意：超链接单元格的 URL 请用 cellUrl（本函数只取显示文本）。
 */
export function cellText(cell: ExcelJS.Cell): string | null {
  const v = cell.value;
  if (v == null) return null;
  if (typeof v === 'string') return v.trim() || null;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'object' && 'text' in (v as unknown as Record<string, unknown>)) {
    const t = String((v as unknown as Record<string, unknown>).text);
    return t.trim() || null;
  }
  const t = cell.text;
  return typeof t === 'string' ? t.trim() || null : null;
}

/**
 * 取单元格 URL：优先 Excel 超链接（HyperlinkValue.hyperlink），退回 http(s) 文本。
 * 历史 bug 备忘：ExcelJS 超链接单元格 value 里 URL 在 `.hyperlink`（不是 `.target`）——
 * 旧代码误读 target → 整列真实 URL 被丢、categoryUrl 全回退首页。
 */
export function cellUrl(cell: ExcelJS.Cell): string | null {
  const value = (cell as unknown as { value?: unknown }).value;
  let hl: string | undefined;
  if (value && typeof value === 'object') {
    const v = value as Record<string, unknown>;
    if (typeof v.hyperlink === 'string') hl = v.hyperlink;
    else if (typeof v.target === 'string') hl = v.target;
  }
  if (!hl) {
    const viaGetter = (cell as unknown as { hyperlink?: unknown }).hyperlink;
    if (typeof viaGetter === 'string') hl = viaGetter;
    else if (viaGetter && typeof viaGetter === 'object') {
      const g = viaGetter as Record<string, unknown>;
      if (typeof g.hyperlink === 'string') hl = g.hyperlink;
      else if (typeof g.target === 'string') hl = g.target;
    }
  }
  if (hl && /^https?:\/\//.test(hl)) return hl.trim();
  const t = cellText(cell);
  if (t && /^https?:\/\//.test(t)) return t;
  return null;
}

/** 读取第 1 行表头 → (string|null)[]（下标 = 列号-1；空单元格为 null） */
export function headerRow(ws: ExcelJS.Worksheet): (string | null)[] {
  const headers: (string | null)[] = [];
  ws.getRow(1).eachCell((cell, col) => {
    headers[col - 1] = cellText(cell);
  });
  return headers;
}

/** 列识别字段定义：field → 表头关键字（任一命中即认列） */
export interface ColumnField {
  field: string;
  keys: string[];
}

/**
 * 按表头关键字识别列（大小写不敏感），返回 field → 0-based 列下标（未命中不出现在结果里）。
 * 多列命中同一 field 时取最靠前的；多个 field 命中同一列时各自独立记录。
 */
export function detectColumns(
  headers: (string | null)[],
  fields: ColumnField[],
): Record<string, number> {
  const map: Record<string, number> = {};
  for (const { field, keys } of fields) {
    const i = headers.findIndex(
      (h) => h != null && keys.some((k) => h.toLowerCase().includes(k.toLowerCase())),
    );
    if (i >= 0) map[field] = i;
  }
  return map;
}
