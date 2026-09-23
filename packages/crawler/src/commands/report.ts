import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { eq } from 'drizzle-orm';
import {
  categories,
  companies,
  createDb,
  exportsDir,
  products,
  type SpecItem,
} from '@competitor-crawler/shared';
import {
  buildCoverage,
  buildOverviewMatrix,
  expandPriceRows,
  quarterLabel,
  sanitizeFilePart,
  COVERAGE_FIELDS,
  UNCATEGORIZED,
  type ReportRow,
} from '../report/summary.js';

export interface ReportOpts {
  /** 导出 Excel（默认动作） */
  excel?: boolean;
  /** 生成 ECharts HTML（8.4，待实现） */
  charts?: boolean;
  /** 按公司名筛选（不区分大小写，子串匹配） */
  company?: string;
  /** 按品类名筛选（不区分大小写，子串匹配） */
  category?: string;
  /** 自定义输出路径 */
  out?: string;
}

// Excel 表头配色（品牌深蓝）
const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF2F5597' },
};
const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };

/** 从 DB 读取活跃产品并拍平成 ReportRow（join 公司 + 品类） */
async function loadRows(opts: ReportOpts): Promise<ReportRow[]> {
  const { db } = createDb();
  const raw = await db
    .select({
      company: companies.name,
      category: categories.name,
      name: products.name,
      englishName: products.englishName,
      sku: products.sku,
      brand: products.brand,
      specText: products.specText,
      price: products.price,
      currency: products.currency,
      priceText: products.priceText,
      specs: products.specs,
      cloneNumber: products.cloneNumber,
      applications: products.applications,
      description: products.description,
      detailUrl: products.detailUrl,
    })
    .from(products)
    .innerJoin(companies, eq(products.companyId, companies.id))
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(eq(products.status, 'active'));

  const needle = (s: string | undefined): string => (s ?? '').trim().toLowerCase();
  const wantCompany = needle(opts.company);
  const wantCategory = needle(opts.category);

  return raw
    .map((r) => ({
      company: r.company,
      category: r.category ?? null,
      name: r.name ?? null,
      englishName: r.englishName ?? null,
      sku: r.sku ?? null,
      brand: r.brand ?? null,
      specText: r.specText ?? null,
      price: r.price ?? null,
      currency: r.currency ?? null,
      priceText: r.priceText ?? null,
      specs: Array.isArray(r.specs) ? (r.specs as SpecItem[]) : [],
      cloneNumber: r.cloneNumber ?? null,
      applications: Array.isArray(r.applications) ? (r.applications as string[]) : null,
      description: r.description ?? null,
      detailUrl: r.detailUrl ?? null,
    }))
    .filter((r) => (wantCompany ? r.company.toLowerCase().includes(wantCompany) : true))
    .filter((r) => (wantCategory ? (r.category ?? '').toLowerCase().includes(wantCategory) : true));
}

// ------------------------------------------------------------------ 渲染工具

function styleHeader(row: ExcelJS.Row): void {
  row.font = HEADER_FONT;
  row.fill = HEADER_FILL;
  row.alignment = { vertical: 'middle', horizontal: 'center' };
  row.height = 20;
}

/** 取单元格的「显示文本」（用于估算列宽；兼容富文本/超链接/公式） */
function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if ('richText' in v && Array.isArray(v.richText)) return v.richText.map((r) => r.text).join('');
    if ('text' in v && typeof v.text === 'string') return v.text;
    if ('result' in v) return String(v.result ?? '');
    return '';
  }
  return String(v);
}

/** CJK 字符按 2 个宽度估算 */
function displayWidth(s: string): number {
  let n = 0;
  for (const ch of s) n += /[\u2e80-\u9fff\uff00-\uffef]/.test(ch) ? 2 : 1;
  return n;
}

/** 按内容自适应列宽（并给首行表头加样式） */
function autofit(ws: ExcelJS.Worksheet, headerRow = 1, min = 8, max = 46): void {
  const widths: number[] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      const len = displayWidth(cellText(cell.value));
      const i = Number(cell.col) - 1;
      if (len > (widths[i] ?? 0)) widths[i] = len;
    });
  });
  for (let i = 0; i < widths.length; i++) {
    ws.getColumn(i + 1).width = Math.min(max, Math.max(min, (widths[i] ?? min) + 2));
  }
  styleHeader(ws.getRow(headerRow));
}

function excelSafe(v: string | null): string {
  // 防 Excel 把 =/+/-/@ 开头的内容当公式
  if (v && /^[=+\-@]/.test(v)) return `'${v}`;
  return v ?? '';
}

// ------------------------------------------------------------------ 三张工作表

function addOverviewSheet(wb: ExcelJS.Workbook, rows: readonly ReportRow[]): void {
  const ws = wb.addWorksheet('总览');
  const m = buildOverviewMatrix(rows);
  ws.addRow(['公司 / 品类', ...m.categories, '合计']);
  m.companies.forEach((company, i) => {
    ws.addRow([company, ...m.counts[i], m.companyTotals[i]]);
  });
  ws.addRow(['合计', ...m.categoryTotals, m.total]);
  ws.getRow(ws.rowCount).font = { bold: true };
  ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: m.categories.length + 2 } };
  autofit(ws);
  // 数量列居中
  for (let c = 2; c <= m.categories.length + 2; c++) ws.getColumn(c).alignment = { horizontal: 'center' };
}

function addPriceSheet(wb: ExcelJS.Workbook, rows: readonly ReportRow[]): void {
  const ws = wb.addWorksheet('价格清单');
  ws.addRow([
    '公司',
    '品类',
    '产品名',
    '英文名',
    '货号',
    '规格',
    '现价',
    '原价',
    '活动价',
    '优惠价',
    '币种',
    '详情链接',
  ]);
  for (const p of expandPriceRows(rows)) {
    const row = ws.addRow([
      p.company,
      p.category ?? '',
      p.name ?? '',
      p.englishName ?? '',
      excelSafe(p.sku),
      p.spec ?? '',
      p.priceNow ?? '',
      p.priceOriginal ?? '',
      p.priceActivity ?? '',
      p.pricePromo ?? '',
      p.currency ?? '',
      p.detailUrl ? { text: p.detailUrl, hyperlink: p.detailUrl } : '',
    ]);
    row.getCell(5).alignment = { horizontal: 'left' }; // 货号左对齐（防被当数字）
    row.getCell(12).font = { color: { argb: 'FF0563C1' }, underline: true };
  }
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 12 } };
  autofit(ws);
}

function addCoverageSheet(wb: ExcelJS.Workbook, rows: readonly ReportRow[]): void {
  const ws = wb.addWorksheet('字段覆盖');
  ws.addRow([
    '公司',
    '产品数',
    ...COVERAGE_FIELDS.flatMap((f) => [`${f.label}（数）`, `${f.label}（覆盖率）`]),
  ]);
  for (const c of buildCoverage(rows)) {
    const cells: Array<string | number> = [c.company, c.total];
    for (const f of COVERAGE_FIELDS) {
      cells.push(c.counts[f.key]);
      cells.push(c.total === 0 ? 0 : c.counts[f.key] / c.total);
    }
    const row = ws.addRow(cells);
    // 覆盖率列（从第 4 列起，每隔一列）用百分比格式
    for (let col = 4; col <= COVERAGE_FIELDS.length * 2 + 2; col += 2) {
      row.getCell(col).numFmt = '0.0%';
    }
  }
  ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }];
  autofit(ws);
  for (let c = 2; c <= COVERAGE_FIELDS.length * 2 + 2; c++) {
    ws.getColumn(c).alignment = { horizontal: 'center' };
  }
}

// ------------------------------------------------------------------ 入口

export async function report(opts: ReportOpts = {}): Promise<void> {
  // 默认动作：--charts 单独指定时不做 excel；两者都未指定时默认 excel
  const wantExcel = opts.excel === true || opts.charts !== true;
  if (opts.charts === true) {
    console.warn('[report] --charts（ECharts 静态 HTML，docs/08 §8.4）尚未实现，本次跳过。');
  }
  if (!wantExcel) return;

  const rows = await loadRows(opts);
  if (rows.length === 0) {
    console.warn('[report] 没有匹配的活跃产品（检查筛选条件或先跑 pnpm crawl）。');
    return;
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = 'competitor-crawler';
  wb.created = new Date();
  addOverviewSheet(wb, rows);
  addPriceSheet(wb, rows);
  addCoverageSheet(wb, rows);

  const filterSuffix = [opts.company, opts.category]
    .filter((s): s is string => typeof s === 'string' && s.trim() !== '')
    .map(sanitizeFilePart)
    .join('-');
  const fileName = `${quarterLabel()}-竞品对标${filterSuffix ? `-${filterSuffix}` : ''}.xlsx`;
  const outPath = opts.out ? path.resolve(opts.out) : path.join(exportsDir, fileName);
  // 先检测后创建：目录不存在则建（幂等），避免 writeFile 报 ENOENT
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  await wb.xlsx.writeFile(outPath);

  const matrices = buildOverviewMatrix(rows);
  console.log(
    `[report] 活跃产品 ${rows.length} 条 | 公司 ${matrices.companies.length} | 品类 ${matrices.categories.length} | 价格行 ${expandPriceRows(rows).length}`,
  );
  if (matrices.categories.length === 0) console.log(`[report] （${UNCATEGORIZED}：无品类绑定）`);
  console.log(`[report] 输出 -> ${outPath}`);
  console.log('[report] 工作表：总览 / 价格清单 / 字段覆盖');
}
