import { describe, it, expect } from 'vitest';
import { mergeListFallback, toPendingContent } from './crawl.js';
import type { ListItem, NormalizedProduct } from '@competitor-crawler/shared';

// 两阶段字段并集合并（2026-10-12 需求）：
// 详情缺 → 列表值补主列；两阶段都有 → 详情值主列 + 列表值存 row[_<字段>]；
// auditMismatch 字段归一不等 → 计入 mismatches（告警），与是否存 row 解耦。

function np(partial: Partial<NormalizedProduct> & { row?: Record<string, unknown> }): NormalizedProduct {
  return { specs: [], introMedia: [], row: partial.row ?? {}, ...partial } as NormalizedProduct;
}

describe('mergeListFallback · 两阶段字段并集合并', () => {
  it('详情缺、列表有 → 列表值补入主列（非空优先）', () => {
    const r = mergeListFallback(np({ row: {} }), { sku: 'A123', priceText: '¥99' });
    expect(r.product.sku).toBe('A123');
    expect(r.product.priceText).toBe('¥99');
    expect(r.mismatches).toEqual([]);
  });

  it('两阶段都有（字符串）→ 详情值主列，列表值存 row._<字段>', () => {
    const r = mergeListFallback(np({ name: '详情名', row: {} }), { name: '列表名', sku: 'A1' });
    expect(r.product.name).toBe('详情名');
    expect((r.product.row as Record<string, unknown>)['_name']).toBe('列表名');
  });

  it('两阶段都有（数值）→ 详情价主列，列表价存 row._price', () => {
    const r = mergeListFallback(np({ price: 120, row: {} }), { price: 99 });
    expect(r.product.price).toBe(120);
    expect((r.product.row as Record<string, unknown>)['_price']).toBe(99);
  });

  it('详情为空串、列表有值 → 补主列，不产生 _ 副本（主列就是列表值）', () => {
    const r = mergeListFallback(np({ sku: '', row: {} }), { sku: 'B2' });
    expect(r.product.sku).toBe('B2');
    expect((r.product.row as Record<string, unknown>)['_sku']).toBeUndefined();
  });

  it('auditMismatch 字段：归一相等（空白/大小写）不告警但存副本；归一不等告警 + 副本', () => {
    // normEqual 消除空白/大小写差异（不消除连字符：MCF-10A↔MCF 10A 属站点写法差异会告警）
    const r = mergeListFallback(np({ sku: 'A1', row: {} }), { sku: ' a1 ' });
    expect(r.mismatches).toEqual([]);
    expect((r.product.row as Record<string, unknown>)['_sku']).toBe(' a1 ');

    const r2 = mergeListFallback(np({ sku: 'MCF-10A', row: {} }), { sku: 'MCF 10A' });
    expect(r2.mismatches).toEqual(['sku']);
    expect((r2.product.row as Record<string, unknown>)['_sku']).toBe('MCF 10A');
  });

  it('非 auditMismatch 字段（description）两阶段都有 → 存副本但不告警', () => {
    const r = mergeListFallback(np({ description: '详情全文', row: {} }), { description: '列表摘要' });
    expect(r.mismatches).toEqual([]);
    expect(r.product.description).toBe('详情全文');
    expect((r.product.row as Record<string, unknown>)['_description']).toBe('列表摘要');
  });

  it('无列表 raw → 原样返回', () => {
    const p = np({ sku: 'A1', row: {} });
    const r = mergeListFallback(p);
    expect(r.product).toBe(p);
    expect(r.mismatches).toEqual([]);
  });
});

describe('toPendingContent · row 两阶段并集（mergeListFields）', () => {
  const baseItem: ListItem = { detailUrl: 'https://x.com/news/9', name: '列表标题', sectionKey: 'news' };
  const sid = 101;

  function np2(row: Record<string, unknown>): NormalizedProduct {
    return { specs: [], introMedia: [], row } as NormalizedProduct;
  }

  it('列表独有字段直接补进 row；两阶段同名字段详情值为准、列表值存 _<key>', () => {
    const c = toPendingContent(
      np2({ cover: 'detail-cover.png', summary: '详情摘要' }),
      { ...baseItem, raw: { cover: 'list-cover.png', author: '市场部' } },
      baseItem.detailUrl,
      1,
      sid,
      'news',
    );
    expect(c?.row.cover).toBe('detail-cover.png'); // 详情值为准
    expect(c?.row._cover).toBe('list-cover.png'); // 列表副本保真
    expect(c?.row.author).toBe('市场部'); // 列表独有直接补
  });

  it('列表空串/空值不产生副本也不覆盖', () => {
    const c = toPendingContent(
      np2({ summary: '详情摘要' }),
      { ...baseItem, raw: { summary: '  ', cover: null } },
      baseItem.detailUrl,
      1,
      sid,
      'news',
    );
    expect(c?.row.summary).toBe('详情摘要');
    expect(c?.row._summary).toBeUndefined();
    expect(c?.row.cover).toBeUndefined();
  });
});
