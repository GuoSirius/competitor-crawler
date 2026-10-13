import { describe, expect, it } from 'vitest';
import { diffProductFields, type PrevProductSnapshot } from './index.js';

const basePrev: PrevProductSnapshot = {
  name: 'A',
  sku: 'S1',
  price: 10,
  priceText: '10',
  specText: 'x',
  specs: [{ a: 1 }],
  row: { color: 'red', note: 'old' },
};

// next 仅提供 diffProductFields 实际读取的字段（其余由 PendingProduct 其它字段补齐，运行时不影响）
const baseNext = {
  name: 'A',
  sku: 'S1',
  price: 10,
  priceText: '10',
  specText: 'x',
  specs: [{ a: 1 }],
  row: { color: 'red', note: 'old' },
} as any;

describe('diffProductFields', () => {
  it('无变更返回空数组', () => {
    expect(diffProductFields(basePrev, baseNext)).toEqual([]);
  });

  it('标量字段变化被记录（旧/新值正确序列化）', () => {
    const d = diffProductFields(basePrev, { ...baseNext, price: 20, priceText: '20' });
    const fields = d.map((x) => x.field);
    expect(fields).toContain('price');
    expect(fields).toContain('priceText');
    const price = d.find((x) => x.field === 'price')!;
    expect(price.oldValue).toBe('10');
    expect(price.newValue).toBe('20');
  });

  it('row 新增键视为变更（新值有、旧值 null）', () => {
    const d = diffProductFields(basePrev, { ...baseNext, row: { ...baseNext.row, size: 'L' } });
    const size = d.find((x) => x.field === 'row.size')!;
    expect(size).toBeDefined();
    expect(size.oldValue).toBeNull();
    expect(size.newValue).toBe('"L"');
  });

  it('row 键消失也视为变更（旧值非空、新值 null）', () => {
    const d = diffProductFields(basePrev, { ...baseNext, row: { color: 'red' } });
    const note = d.find((x) => x.field === 'row.note')!;
    expect(note).toBeDefined();
    expect(note.oldValue).toBe('"old"');
    expect(note.newValue).toBeNull();
  });

  it('specs 数组值变化被检测（键序/内容敏感）', () => {
    const d = diffProductFields(basePrev, { ...baseNext, specs: [{ a: 2 }] });
    const specs = d.find((x) => x.field === 'specs')!;
    expect(specs).toBeDefined();
    expect(specs.oldValue).toBe('[{"a":1}]');
    expect(specs.newValue).toBe('[{"a":2}]');
  });

  it('字段由 null 变为有值被记录', () => {
    const prev: PrevProductSnapshot = { ...basePrev, sku: null };
    const d = diffProductFields(prev, { ...baseNext, sku: 'S2' });
    const sku = d.find((x) => x.field === 'sku')!;
    expect(sku.oldValue).toBeNull();
    expect(sku.newValue).toBe('"S2"');
  });
});
