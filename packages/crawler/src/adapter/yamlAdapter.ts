import { extractObject, type FieldSpec } from '@competitor-crawler/shared';
import type { ListItem, NormalizedProduct } from '@competitor-crawler/shared';
import { CheerioDomRead } from './cheerioDom.js';

export interface ListConfig {
  itemSelector: string;
  fields: Record<string, FieldSpec>;
}

/**
 * 按配置解析列表页 HTML，返回每个产品条目（detailUrl + name）。
 * @param sectionKey 多规则站点的栏目标识；会写入每个 ListItem，供详情阶段选规则 + 落库参与去重。
 */
export function parseListWithConfig(html: string, cfg: ListConfig, sectionKey?: string): ListItem[] {
  const dom = CheerioDomRead.fromHtml(html);
  return dom.list(cfg.itemSelector).map((item) => {
    const o = extractObject(item, cfg.fields) as Record<string, unknown>;
    return {
      detailUrl: typeof o.detailUrl === 'string' ? o.detailUrl : '',
      name: typeof o.name === 'string' ? o.name : undefined,
      sectionKey,
      // 列表阶段的其余字段（货号 / 价格 / 规格…）随条目带下去，详情缺失时兜底
      raw: o,
    };
  });
}

/** 详情页抽取结果中，可提升为 NormalizedProduct 顶层标量字段的键 */
const SCALAR_KEYS = [
  'name',
  'sourceProductId',
  'sku',
  'englishName',
  'brand',
  'priceText',
  'specText',
  'description',
  'detailUrl',
  'cloneNumber',
] as const;

/** 按配置解析详情页 HTML，归一化为 NormalizedProduct（声明字段 + row 兜底） */
export function parseDetailWithConfig(html: string, fields: Record<string, FieldSpec>): NormalizedProduct {
  const dom = CheerioDomRead.fromHtml(html);
  const o = extractObject(dom, fields) as Record<string, unknown>;

  const product: NormalizedProduct = {
    specs: Array.isArray(o.specs) ? (o.specs as NormalizedProduct['specs']) : [],
    introMedia: Array.isArray(o.introMedia) ? (o.introMedia as NormalizedProduct['introMedia']) : [],
    row: o,
  };
  const target = product as unknown as Record<string, unknown>;
  for (const k of SCALAR_KEYS) {
    if (typeof o[k] === 'string') target[k] = o[k];
  }
  if (typeof o.price === 'number') product.price = o.price;
  if (Array.isArray(o.applications)) product.applications = o.applications as string[];
  return product;
}
