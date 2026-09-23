import { describe, it, expect } from 'vitest';
import {
  buildCategoryShare,
  buildCharts,
  buildCloneCoverage,
  buildCompanyCategoryStack,
  buildCompanyTotals,
  buildIntakeTrend,
  buildPriceHistogram,
  priceBucketLabel,
  priceValues,
  PRICE_BUCKETS,
} from './charts.js';
import { UNCATEGORIZED, type ReportRow } from './summary.js';

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
  firstSeenAt: null,
  ...over,
});

const quarter = (y: number, m: number, d = 15): number => new Date(y, m, d).getTime() / 1000;

describe('buildCompanyTotals', () => {
  it('按产品数降序，同数按名称排序', () => {
    const out = buildCompanyTotals([
      row({ company: 'A' }),
      row({ company: 'B' }),
      row({ company: 'B' }),
      row({ company: 'C' }),
      row({ company: 'C' }),
    ]);
    // B 与 C 都是 2，按中文序 B 在 C 前
    expect(out.names).toEqual(['B', 'C', 'A']);
    expect(out.counts).toEqual([2, 2, 1]);
  });
});

describe('buildCompanyCategoryStack', () => {
  it('给出公司/品类轴与「每品类一条序列」的堆叠数据', () => {
    const out = buildCompanyCategoryStack([
      row({ company: 'A', category: '细胞' }),
      row({ company: 'A', category: '抗体' }),
      row({ company: 'B', category: '抗体' }),
    ]);
    expect(out.companies).toEqual(['A', 'B']);
    expect(out.categories).toEqual(['抗体', '细胞']);
    // 抗体：A 1、B 1；细胞：A 1、B 0
    expect(out.series).toEqual([
      { name: '抗体', data: [1, 1] },
      { name: '细胞', data: [1, 0] },
    ]);
  });

  it('category 为 null 归入「未归类」', () => {
    const out = buildCompanyCategoryStack([row({ category: null })]);
    expect(out.categories).toEqual([UNCATEGORIZED]);
  });
});

describe('buildCategoryShare', () => {
  it('按数量降序返回饼图数据', () => {
    expect(
      buildCategoryShare([
        row({ category: '细胞' }),
        row({ category: '抗体' }),
        row({ category: '抗体' }),
      ]),
    ).toEqual([
      { name: '抗体', value: 2 },
      { name: '细胞', value: 1 },
    ]);
  });
});

describe('priceValues', () => {
  it('优先取 specs 的现价（原文剥离货币符号）', () => {
    const v = priceValues([
      row({ specs: [{ spec: '100μL', priceNow: '￥680' }, { spec: '1mL', priceNow: '￥2,680.00' }] }),
    ]);
    expect(v).toEqual([680, 2680]);
  });

  it('specs 里没有可解析现价时，回落到产品级 price', () => {
    expect(priceValues([row({ price: 99.5, specs: [{ spec: '1mL', priceNow: '询价' }] })])).toEqual([99.5]);
  });

  it('specs 有价时不再重复计入产品级 price（避免同一产品计两次）', () => {
    expect(priceValues([row({ price: 100, specs: [{ spec: '1mL', priceNow: '￥680' }] })])).toEqual([680]);
  });

  it('无 specs 无 price → 不产出', () => {
    expect(priceValues([row()])).toEqual([]);
  });
});

describe('buildPriceHistogram', () => {
  it('分桶边界：等于上界落本桶，超出最大上界落「≥」桶', () => {
    const h = buildPriceHistogram([
      row({ price: 100 }), // 0–100
      row({ price: 101 }), // 100–500
      row({ price: 10000 }), // 5000–10000
      row({ price: 10001 }), // ≥ 10000
    ]);
    expect(h.labels).toHaveLength(PRICE_BUCKETS.length + 1);
    expect(h.labels[0]).toBe('0–100');
    expect(h.labels[h.labels.length - 1]).toBe('≥ 10000');
    expect(h.counts[0]).toBe(1);
    expect(h.counts[1]).toBe(1);
    expect(h.counts[h.counts.length - 1]).toBe(1);
    expect(h.total).toBe(4);
  });

  it('价格全为空时 total=0 且各桶为 0', () => {
    const h = buildPriceHistogram([row()]);
    expect(h.total).toBe(0);
    expect(h.counts.every((c) => c === 0)).toBe(true);
  });

  it('priceBucketLabel: 0 桶下界为 0；越界返回 ≥ 最大值', () => {
    expect(priceBucketLabel(0)).toBe('0–100');
    expect(priceBucketLabel(PRICE_BUCKETS.length)).toBe('≥ 10000');
  });
});

describe('buildCloneCoverage', () => {
  it('按公司统计有/无克隆号', () => {
    const out = buildCloneCoverage([
      row({ company: 'A', cloneNumber: 'ZQ1273' }),
      row({ company: 'A', cloneNumber: '  ' }), // 空白视为无
      row({ company: 'A', cloneNumber: null }),
    ]);
    expect(out.companies).toEqual(['A']);
    expect(out.withClone).toEqual([1]);
    expect(out.withoutClone).toEqual([2]);
  });
});

describe('buildIntakeTrend', () => {
  it('按季度聚合且累计、按时间排序', () => {
    const out = buildIntakeTrend([
      row({ firstSeenAt: quarter(2026, 7) }), // 2026-Q3
      row({ firstSeenAt: quarter(2025, 9) }), // 2025-Q4
      row({ firstSeenAt: quarter(2026, 0) }), // 2026-Q1
      row({ firstSeenAt: quarter(2026, 7) }), // 2026-Q3
    ]);
    expect(out.quarters).toEqual(['2025-Q4', '2026-Q1', '2026-Q3']);
    expect(out.cumulative).toEqual([1, 2, 4]);
  });

  it('firstSeenAt 缺失的条目被忽略', () => {
    expect(buildIntakeTrend([row(), row()])).toEqual({ quarters: [], cumulative: [] });
  });
});

describe('buildCharts（组装 6 张图）', () => {
  it('返回 6 张图且 id 唯一、option 形状可用', () => {
    const specs = buildCharts([row()]);
    expect(specs).toHaveLength(6);
    expect(new Set(specs.map((s) => s.id)).size).toBe(6);
    for (const s of specs) {
      expect(s.title).toBeTruthy();
      expect(typeof s.option).toBe('object');
      expect(s.option).not.toBeNull();
    }
    expect(specs.map((s) => s.id)).toEqual([
      'company-total',
      'company-category',
      'category-share',
      'price-hist',
      'clone-coverage',
      'intake-trend',
    ]);
  });
});
