import { describe, expect, it } from 'vitest';
import { renameKeys, tryParseJson, walkPath } from './json.js';

describe('walkPath', () => {
  const data = { data: { list: [{ id: 1 }, { id: 2 }] }, ok: true };

  it('空路径返回原值', () => {
    expect(walkPath(data)).toBe(data);
    expect(walkPath(data, '')).toBe(data);
  });

  it('按点号路径逐层下钻，支持数组下标', () => {
    expect(walkPath(data, 'data.list')).toEqual([{ id: 1 }, { id: 2 }]);
    expect(walkPath(data, 'data.list.0.id')).toBe(1);
    expect(walkPath(data, 'ok')).toBe(true);
  });

  it('路径不存在返回 undefined（不抛错）', () => {
    expect(walkPath(data, 'data.nope')).toBeUndefined();
    expect(walkPath(data, 'data.list.9')).toBeUndefined();
    expect(walkPath(null, 'a.b')).toBeUndefined();
    expect(walkPath(data, 'data.list.notIndex')).toBeUndefined();
  });
});

describe('renameKeys（站点键 → 我方键）', () => {
  const pick = { spec: 'specName', priceNow: 'price' };

  it('对象按键重命名，取不到的键不写入', () => {
    expect(renameKeys({ specName: '100μL', price: 1280, other: 'x' }, pick)).toEqual({
      spec: '100μL',
      priceNow: 1280,
    });
    expect(renameKeys({ specName: '100μL' }, pick)).toEqual({ spec: '100μL' });
  });

  it('数组逐项重命名（规格列表场景）', () => {
    expect(
      renameKeys([{ specName: '100μL', price: 1280 }, { specName: '1mL', price: 8800 }], pick),
    ).toEqual([
      { spec: '100μL', priceNow: 1280 },
      { spec: '1mL', priceNow: 8800 },
    ]);
  });

  it('站点键支持点号路径（WooCommerce 变体：规格藏在嵌套 attributes 里）', () => {
    const variants = [
      { attributes: { 'attribute_%e8%a7%84%e6%a0%bc': '500mL（国产）' }, sku: 'SV30306.01' },
      { attributes: { 'attribute_%e8%a7%84%e6%a0%bc': '500mL' }, sku: 'SH30809.01' },
    ];
    expect(
      renameKeys(variants, {
        spec: 'attributes.attribute_%e8%a7%84%e6%a0%bc',
        sku: 'sku',
      }),
    ).toEqual([
      { spec: '500mL（国产）', sku: 'SV30306.01' },
      { spec: '500mL', sku: 'SH30809.01' },
    ]);
    // 嵌套路径取不到时该键不写入（与浅层语义一致）
    expect(renameKeys([{ attributes: {} }], { spec: 'attributes.x' })).toEqual([{}]);
  });

  it('未传 pick 或值为标量/null 时原样返回', () => {
    expect(renameKeys({ a: 1 })).toEqual({ a: 1 });
    expect(renameKeys(null, pick)).toBeNull();
    expect(renameKeys('x', pick)).toBe('x');
  });
});

describe('tryParseJson（宽松解析，兼容 script 里夹带代码）', () => {
  it('直接 parse 合法 JSON', () => {
    expect(tryParseJson('[{"a":1}]')).toEqual([{ a: 1 }]);
  });

  it('截取最外层 [] / {} 后 parse（前后有其它代码）', () => {
    expect(tryParseJson('var skuList = [{"price":1}]; var x = 2;')).toEqual([{ price: 1 }]);
    expect(tryParseJson('window.__DATA__ = {"props":{"a":1}};')).toEqual({ props: { a: 1 } });
  });

  it('无法解析返回 null', () => {
    expect(tryParseJson('not json at all')).toBeNull();
    expect(tryParseJson('')).toBeNull();
    expect(tryParseJson(null)).toBeNull();
  });
});
