// 字段注册表单测：levenshtein / suggestFieldName / 注册表一致性
import { describe, it, expect } from 'vitest';
import {
  PRODUCT_FIELDS,
  CONTENT_FIELDS,
  BUILTIN_FIELD_NAMES,
  getFieldMeta,
  fieldsForKind,
  levenshtein,
  suggestFieldName,
} from './fieldRegistry.js';

describe('levenshtein', () => {
  it('相同串为 0，空串为对方长度', () => {
    expect(levenshtein('abc', 'abc')).toBe(0);
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('abc', '')).toBe(3);
  });

  it('插入/删除/替换按 1 计', () => {
    expect(levenshtein('priceTxt', 'priceText')).toBe(1); // 插入 e
    expect(levenshtein('spec', 'specs')).toBe(1); // 追加 s
    expect(levenshtein('species', 'specs')).toBe(2); // 删 i、删 e —— 必须 > 1（防误报阈值）
  });
});

describe('suggestFieldName —— 宁漏勿误', () => {
  it('词元全等命中：productName → name', () => {
    expect(suggestFieldName('productName')).toBe('name');
  });

  it('整体距离 1 命中：priceTxt → priceText', () => {
    expect(suggestFieldName('priceTxt')).toBe('priceText');
  });

  it('真实自定义字段不误报：species / hostOrganism / cas → null', () => {
    expect(suggestFieldName('species')).toBeNull();
    expect(suggestFieldName('hostOrganism')).toBeNull();
    expect(suggestFieldName('cas')).toBeNull();
  });

  it('contents 侧建议用 contents 注册表', () => {
    expect(suggestFieldName('titles', 'contents')).toBe('title');
    expect(suggestFieldName('productName', 'contents')).toBeNull();
  });
});

describe('注册表一致性', () => {
  it('name 必填且参与合并审计；detailUrl 是身份键不参与合并', () => {
    const name = getFieldMeta('name');
    expect(name?.required).toBe(true);
    expect(name?.listFallback).toBe(true);
    expect(name?.auditMismatch).toBe(true);
    const detailUrl = getFieldMeta('detailUrl');
    expect(detailUrl?.identity).toBe(true);
    expect(detailUrl?.listFallback).toBeUndefined();
  });

  it('currency 是站点级字段，不进解析字段名集合', () => {
    expect(getFieldMeta('currency')?.stage).toBe('site');
    expect(BUILTIN_FIELD_NAMES.has('currency')).toBe(false);
  });

  it('SCALAR_KEYS 覆盖的 12 个提升字段都在注册表内（防漂移）', () => {
    for (const k of ['name', 'sourceProductId', 'sku', 'englishName', 'aliases', 'oldSkus', 'brand', 'priceText', 'specText', 'description', 'detailUrl', 'cloneNumber']) {
      expect(BUILTIN_FIELD_NAMES.has(k), k).toBe(true);
    }
  });

  it('fieldsForKind 返回对应注册表且名字唯一', () => {
    expect(fieldsForKind('products')).toBe(PRODUCT_FIELDS);
    expect(fieldsForKind('contents')).toBe(CONTENT_FIELDS);
    for (const list of [PRODUCT_FIELDS, CONTENT_FIELDS]) {
      expect(new Set(list.map((f) => f.name)).size).toBe(list.length);
    }
  });
});
