import { describe, it, expect } from 'vitest';
import {
  ModelExtractionSchema,
  extractJsonBlock,
  toNormalizedFields,
} from './extraction.js';

describe('extractJsonBlock', () => {
  it('解析 ```json 围栏', () => {
    expect(extractJsonBlock('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('解析无语言标记的 ``` 围栏', () => {
    expect(extractJsonBlock('```\n{"a":[1,2]}\n```')).toEqual({ a: [1, 2] });
  });

  it('从解说文字中抠出裸 JSON（模型常带前后缀）', () => {
    expect(extractJsonBlock('好的，结果如下：{"specs":[]} 以上。')).toEqual({ specs: [] });
  });

  it('无 JSON 内容时返回 null', () => {
    expect(extractJsonBlock('抱歉，我无法提取到规格信息。')).toBeNull();
    expect(extractJsonBlock('')).toBeNull();
    expect(extractJsonBlock(null)).toBeNull();
  });

  it('JSON 语法错误时返回 null（不抛异常）', () => {
    expect(extractJsonBlock('{"a": }')).toBeNull();
  });
});

describe('ModelExtractionSchema', () => {
  it('解析标准输出', () => {
    const r = ModelExtractionSchema.parse({
      specs: [{ spec: '100μL', priceNow: '1280' }],
      introMedia: [{ image: 'https://x/a.png', description: '示意' }],
      scalars: { sku: 'ZQ1273' },
      confidence: 0.9,
      notes: '来自规格表',
    });
    expect(r.specs).toHaveLength(1);
    expect(r.specs[0].spec).toBe('100μL');
    expect(r.scalars.sku).toBe('ZQ1273');
    expect(r.confidence).toBe(0.9);
  });

  it('宽容数字型价格（模型常把数值写成 number）', () => {
    const r = ModelExtractionSchema.parse({ specs: [{ spec: '1mL', priceNow: 1280 }] });
    expect(r.specs[0].priceNow).toBe('1280');
  });

  it('缺失字段补空数组 / 空对象，空串归 null', () => {
    const r = ModelExtractionSchema.parse({ specs: [{ spec: '1mL', priceNow: '' }] });
    expect(r.specs[0].priceNow).toBeNull();
    expect(r.introMedia).toEqual([]);
    expect(r.scalars).toEqual({});
  });

  it('confidence 接受字符串、越界钳到 [0,1]、非法归 null', () => {
    expect(ModelExtractionSchema.parse({ confidence: '0.9' }).confidence).toBe(0.9);
    expect(ModelExtractionSchema.parse({ confidence: 1.5 }).confidence).toBe(1);
    expect(ModelExtractionSchema.parse({ confidence: -2 }).confidence).toBe(0);
    expect(ModelExtractionSchema.parse({ confidence: '很高' }).confidence).toBeNull();
  });

  it('剥离字段外的多余键（模型爱自行加字段）', () => {
    const r = ModelExtractionSchema.parse({ specs: [], 我编的: 'x' }) as Record<string, unknown>;
    expect(r['我编的']).toBeUndefined();
  });
});

describe('toNormalizedFields', () => {
  const parsed = ModelExtractionSchema.parse({
    specs: [
      { spec: '100μL', priceNow: '1280' },
      { spec: null, priceNow: null }, // 全空 → 模型凑数，应被丢弃
    ],
    introMedia: [{ image: null, description: null }], // 全空 → 丢弃
    scalars: { sku: 'ZQ1273', brand: '', description: '说明' },
  });

  it('丢弃全空项，保留有效项', () => {
    const f = toNormalizedFields(parsed);
    expect(f.specs).toHaveLength(1);
    expect(f.introMedia).toBeUndefined();
  });

  it('标量去空串', () => {
    expect(toNormalizedFields(parsed).scalars).toEqual({ sku: 'ZQ1273', description: '说明' });
  });

  it('targets 限定只取指定项', () => {
    const f = toNormalizedFields(parsed, ['specs']);
    expect(f.specs).toHaveLength(1);
    expect(f.introMedia).toBeUndefined();
    expect(f.scalars).toEqual({});
  });

  it('targets 只写标量名时不产出 specs', () => {
    const f = toNormalizedFields(parsed, ['sku']);
    expect(f.specs).toBeUndefined();
    expect(f.scalars).toEqual({ sku: 'ZQ1273' });
  });
});
