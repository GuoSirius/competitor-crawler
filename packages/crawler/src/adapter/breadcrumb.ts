import { CheerioDomRead } from '@competitor-crawler/shared';
import type { CategoryFromPageConfig } from '../config/types.js';

/** 面包屑里的纯分隔符段（有些站点把 > / » 也渲染成 li/a） */
const SEPARATORS = new Set(['>', '/', '»', '›', '|', '首页', 'Home', 'home']);

/**
 * 从详情页 HTML 抽「根→叶」面包屑分类路径；取不到返回空数组（调用方回落 YAML 静态分类）。
 * 规则：按选择器文档顺序取文本 → 丢弃末段（默认是产品名，keepLast 可保留）
 * → 剔除 strip 词与纯分隔符 → 相邻去重 → 限深（maxDepth 缺省 4）。
 */
export function parseBreadcrumb(html: string, cfg: CategoryFromPageConfig): string[] {
  if (!cfg?.itemSelector) return [];
  try {
    const dom = CheerioDomRead.fromHtml(html);
    let segs = dom
      .list(cfg.itemSelector)
      .map((n) => (n.text() ?? '').replace(/\s+/g, ' ').trim())
      .filter((s) => s && !SEPARATORS.has(s));
    if (cfg.keepLast !== true) segs = segs.slice(0, -1);
    if (cfg.strip?.length) {
      const strip = new Set(cfg.strip);
      segs = segs.filter((s) => !strip.has(s));
    }
    const max = cfg.maxDepth ?? 4;
    const out: string[] = [];
    for (const s of segs) {
      if (out.length >= max) break;
      if (out[out.length - 1] !== s) out.push(s);
    }
    return out;
  } catch {
    return [];
  }
}
