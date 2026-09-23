import type { SpecItem } from '@competitor-crawler/shared';

/**
 * 报告用的一行「已拍平」产品（products ⟕ companies ⟕ categories 的结果）。
 * 纯数据结构：本文件所有函数都不碰 DB / 文件系统，方便单测。
 */
export interface ReportRow {
  company: string;
  category: string | null;
  name: string | null;
  englishName: string | null;
  sku: string | null;
  brand: string | null;
  specText: string | null;
  price: number | null;
  currency: string | null;
  priceText: string | null;
  specs: SpecItem[];
  cloneNumber: string | null;
  applications: string[] | null;
  description: string | null;
  detailUrl: string | null;
  /** 首次入库时间（unix 秒）；用于「入库趋势」图，非价格序列 */
  firstSeenAt: number | null;
}

/** 未绑定品类时的占位名（种子里的品类链接常是首页，未必能归到具体品类） */
export const UNCATEGORIZED = '（未归类）';

const nonEmpty = (v: string | null | undefined): boolean =>
  typeof v === 'string' && v.trim() !== '';

const byZh = (a: string, b: string): number => a.localeCompare(b, 'zh');

/** 当前季度标签，如 `2026Q3`（用于导出文件名） */
export function quarterLabel(date: Date = new Date()): string {
  return `${date.getFullYear()}Q${Math.floor(date.getMonth() / 3) + 1}`;
}

/** 把任意文字清成可安全用于文件名的一段（去掉 Windows 非法字符与空白） */
export function sanitizeFilePart(input: string): string {
  return input
    .trim()
    .replace(/[\\/:*?"<>|\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// ---------------------------------------------------------------- 总览矩阵

export interface OverviewMatrix {
  companies: string[];
  categories: string[];
  /** counts[i][j] = 第 i 家公司在第 j 个品类下的产品数 */
  counts: number[][];
  companyTotals: number[];
  categoryTotals: number[];
  total: number;
}

/** 公司 × 品类 产品数矩阵（8.3 工作表 1）。公司/品类均按中文拼音序稳定排序。 */
export function buildOverviewMatrix(rows: readonly ReportRow[]): OverviewMatrix {
  const companies = [...new Set(rows.map((r) => r.company))].sort(byZh);
  const categories = [...new Set(rows.map((r) => r.category ?? UNCATEGORIZED))].sort(byZh);
  const ci = new Map(companies.map((c, i) => [c, i]));
  const gi = new Map(categories.map((c, j) => [c, j]));

  const counts = companies.map(() => categories.map(() => 0));
  let total = 0;
  for (const r of rows) {
    const i = ci.get(r.company);
    const j = gi.get(r.category ?? UNCATEGORIZED);
    if (i === undefined || j === undefined) continue;
    counts[i][j] += 1;
    total += 1;
  }
  const companyTotals = counts.map((row) => row.reduce((a, b) => a + b, 0));
  const categoryTotals = categories.map((_, j) => counts.reduce((a, row) => a + row[j], 0));
  return { companies, categories, counts, companyTotals, categoryTotals, total };
}

// ---------------------------------------------------------------- 字段覆盖

export interface CoverageField {
  key: string;
  label: string;
  has: (r: ReportRow) => boolean;
}

/** 字段覆盖口径（8.3 工作表 3）：暴露「哪些公司的数据有缺口」 */
export const COVERAGE_FIELDS: readonly CoverageField[] = [
  { key: 'sku', label: '货号', has: (r) => nonEmpty(r.sku) },
  { key: 'price', label: '价格', has: (r) => typeof r.price === 'number' },
  { key: 'spec', label: '规格', has: (r) => nonEmpty(r.specText) || (r.specs?.length ?? 0) > 0 },
  { key: 'englishName', label: '英文名', has: (r) => nonEmpty(r.englishName) },
  { key: 'brand', label: '品牌', has: (r) => nonEmpty(r.brand) },
  { key: 'cloneNumber', label: '克隆号', has: (r) => nonEmpty(r.cloneNumber) },
  { key: 'applications', label: '应用', has: (r) => (r.applications?.length ?? 0) > 0 },
  { key: 'description', label: '描述', has: (r) => nonEmpty(r.description) },
] as const;

export interface CoverageRow {
  company: string;
  total: number;
  /** key → 命中数 */
  counts: Record<string, number>;
}

/** 各公司字段覆盖（数量）。覆盖率在渲染时算，避免浮点进纯函数。 */
export function buildCoverage(rows: readonly ReportRow[]): CoverageRow[] {
  const map = new Map<string, CoverageRow>();
  for (const r of rows) {
    let entry = map.get(r.company);
    if (!entry) {
      entry = {
        company: r.company,
        total: 0,
        counts: Object.fromEntries(COVERAGE_FIELDS.map((f) => [f.key, 0])),
      };
      map.set(r.company, entry);
    }
    entry.total += 1;
    for (const f of COVERAGE_FIELDS) if (f.has(r)) entry.counts[f.key] += 1;
  }
  return [...map.values()].sort((a, b) => byZh(a.company, b.company));
}

// ---------------------------------------------------------------- 价格清单

/** 价格清单的一行（8.3 工作表 2）。价格保留**原文**（不做过期解析，避免「询价」这类值被丢掉）。 */
export interface PriceRow {
  company: string;
  category: string | null;
  name: string | null;
  englishName: string | null;
  sku: string | null;
  spec: string | null;
  /** 现价 / 售价 */
  priceNow: string | null;
  /** 原价 / 划线价 */
  priceOriginal: string | null;
  /** 活动价 */
  priceActivity: string | null;
  /** 优惠价 / 券后价 */
  pricePromo: string | null;
  currency: string | null;
  detailUrl: string | null;
}

/**
 * 把 products.specs 展开为多行；`specs` 为空时退化为「一行，用产品级 price/specText」。
 * 价格一律取原文（`priceNow` 等本就是站点原文），产品级兜底用 `priceText ?? String(price)`。
 */
export function expandPriceRows(rows: readonly ReportRow[]): PriceRow[] {
  const out: PriceRow[] = [];
  for (const r of rows) {
    const base = {
      company: r.company,
      category: r.category,
      name: r.name,
      englishName: r.englishName,
      sku: r.sku,
      currency: r.currency,
      detailUrl: r.detailUrl,
    };
    const specs = Array.isArray(r.specs) ? r.specs : [];
    if (specs.length === 0) {
      out.push({
        ...base,
        spec: r.specText,
        priceNow: r.priceText ?? (r.price === null ? null : String(r.price)),
        priceOriginal: null,
        priceActivity: null,
        pricePromo: null,
      });
      continue;
    }
    for (const s of specs) {
      out.push({
        ...base,
        spec: s.spec ?? r.specText,
        priceNow: s.priceNow ?? null,
        priceOriginal: s.priceOriginal ?? null,
        priceActivity: s.priceActivity ?? null,
        pricePromo: s.pricePromo ?? null,
      });
    }
  }
  return out;
}
