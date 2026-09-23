import { describe, it, expect } from 'vitest';
import {
  buildCoverage,
  buildOverviewMatrix,
  expandPriceRows,
  quarterLabel,
  sanitizeFilePart,
  COVERAGE_FIELDS,
  UNCATEGORIZED,
  type ReportRow,
} from './summary.js';

const row = (over: Partial<ReportRow> = {}): ReportRow => ({
  company: 'A公司',
  category: '细胞',
  name: '产品',
  englishName: null,
  sku: null,
  brand: null,
  specText: null,
  price: null,
  currency: 'CNY',
  priceText: null,
  specs: [],
  cloneNumber: null,
  applications: null,
  description: null,
  detailUrl: null,
  ...over,
});

describe('quarterLabel', () => {
  it('按月份给出季度（1-3月=Q1 … 10-12月=Q4）', () => {
    expect(quarterLabel(new Date(2026, 0, 15))).toBe('2026Q1');
    expect(quarterLabel(new Date(2026, 2, 31))).toBe('2026Q1');
    expect(quarterLabel(new Date(2026, 3, 1))).toBe('2026Q2');
    expect(quarterLabel(new Date(2026, 8, 23))).toBe('2026Q3');
    expect(quarterLabel(new Date(2026, 11, 31))).toBe('2026Q4');
  });
});

describe('sanitizeFilePart', () => {
  it('把 Windows 非法字符与空白换成连字符', () => {
    expect(sanitizeFilePart('a/b:c*d?e"f<g>h|i')).toBe('a-b-c-d-e-f-g-h-i');
    expect(sanitizeFilePart('上海 逍鹏')).toBe('上海-逍鹏');
  });

  it('折叠连续连字符并去掉首尾', () => {
    expect(sanitizeFilePart('  //abc//  ')).toBe('abc');
  });
});

describe('buildOverviewMatrix（公司 × 品类）', () => {
  it('统计各公司各品类产品数，并给出行列合计', () => {
    const rows = [
      row({ company: 'A', category: '细胞' }),
      row({ company: 'A', category: '细胞' }),
      row({ company: 'A', category: '抗体' }),
      row({ company: 'B', category: '抗体' }),
    ];
    const m = buildOverviewMatrix(rows);
    expect(m.companies).toEqual(['A', 'B']);
    expect(m.categories).toEqual(['抗体', '细胞']);
    // counts[公司][品类]
    expect(m.counts).toEqual([
      [1, 2], // A：抗体 1、细胞 2
      [1, 0], // B：抗体 1、细胞 0
    ]);
    expect(m.companyTotals).toEqual([3, 1]);
    expect(m.categoryTotals).toEqual([2, 2]);
    expect(m.total).toBe(4);
  });

  it('category 为 null 时归入「未归类」而不是丢弃', () => {
    const m = buildOverviewMatrix([row({ category: null }), row({ category: null })]);
    expect(m.categories).toEqual([UNCATEGORIZED]);
    expect(m.categoryTotals).toEqual([2]);
    expect(m.total).toBe(2);
  });

  it('空输入 → 空矩阵且 total=0', () => {
    const m = buildOverviewMatrix([]);
    expect(m).toMatchObject({ companies: [], categories: [], counts: [], total: 0 });
  });

  it('公司/品类按中文拼音序稳定排序（与输入顺序无关）', () => {
    const a = buildOverviewMatrix([row({ company: '乙' }), row({ company: '甲' })]);
    const b = buildOverviewMatrix([row({ company: '甲' }), row({ company: '乙' })]);
    expect(a.companies).toEqual(b.companies);
  });
});

describe('buildCoverage（字段覆盖）', () => {
  it('逐字段统计命中数，并保留 total', () => {
    const rows = [
      row({ sku: 'C001', price: 100, englishName: 'Alpha' }),
      row({ sku: 'C002', price: null, englishName: '  ' }),
      row({ sku: null, price: 50, applications: ['WB'] }),
    ];
    const [a] = buildCoverage(rows);
    expect(a.total).toBe(3);
    expect(a.counts.sku).toBe(2); // 空白/ null 不算命中
    expect(a.counts.price).toBe(2);
    expect(a.counts.englishName).toBe(1); // '  ' 视为未覆盖
    expect(a.counts.applications).toBe(1);
    expect(a.counts.cloneNumber).toBe(0);
  });

  it('规格覆盖：specText 或 specs 任一有值即算命中', () => {
    const [byText] = buildCoverage([row({ specText: '100μL' })]);
    const [bySpecs] = buildCoverage([row({ specs: [{ spec: '1mL' }] })]);
    expect(byText.counts.spec).toBe(1);
    expect(bySpecs.counts.spec).toBe(1);
  });

  it('按公司分组且每个字段键都存在（便于渲染时直接取）', () => {
    const out = buildCoverage([row({ company: 'A' }), row({ company: 'B' })]);
    expect(out.map((c) => c.company)).toEqual(['A', 'B']);
    for (const c of out) {
      for (const f of COVERAGE_FIELDS) expect(c.counts[f.key]).toBeTypeOf('number');
    }
  });
});

describe('expandPriceRows（价格清单，specs 展开为多行）', () => {
  it('多规格 → 每个规格一行，四种价格各取原文', () => {
    const out = expandPriceRows([
      row({
        sku: 'C001',
        specs: [
          { spec: '100μL', priceNow: '¥680', priceOriginal: '¥880' },
          { spec: '1mL', priceNow: '¥2680', priceActivity: '¥1980', pricePromo: '¥1880' },
        ],
      }),
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ spec: '100μL', priceNow: '¥680', priceOriginal: '¥880' });
    expect(out[1]).toMatchObject({
      spec: '1mL',
      priceNow: '¥2680',
      priceActivity: '¥1980',
      pricePromo: '¥1880',
    });
    expect(out[0].sku).toBe('C001');
  });

  it('无 specs → 退化为一行，价格用 priceText 兜底', () => {
    const out = expandPriceRows([row({ specText: '500mL', priceText: '￥1280.00' })]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ spec: '500mL', priceNow: '￥1280.00', priceOriginal: null });
  });

  it('无 specs 且无 priceText → 用数值 price 转字符串；两者皆空则 null', () => {
    expect(expandPriceRows([row({ price: 99.5 })])[0].priceNow).toBe('99.5');
    expect(expandPriceRows([row({ price: null, priceText: null })])[0].priceNow).toBeNull();
  });

  it('无 specs 的规格列回落到 specText', () => {
    const out = expandPriceRows([row({ specText: null })]);
    expect(out[0].spec).toBeNull();
  });
});
