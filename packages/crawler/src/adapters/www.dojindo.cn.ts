/**
 * dojindo（同仁化学 www.dojindo.cn）代码适配器
 * ================================================
 *
 * 站点形态（2026-10-09 与用户一起复核，纠正「接口形态 E、无详情链」误判）：
 *   - Nuxt 2 SPA，列表页 /products/category/<一级id>?c2id=<二级id> 客户端渲染成
 *     标准 HTML 表格（table.table tbody tr：品名/货号/用途三列）；
 *   - 行内**没有 <a> 详情链**——详情跳转是 @click 事件（goProductDetail），
 *     JS 里 `"/products/".concat(encodeURIComponent(model))`（chunk 5be7882 module 62），
 *     即详情 URL = /products/<货号>（如 /products/C557）；
 *   - 列表数据来自 POST /api/product/product_list（application/x-www-form-urlencoded，
 *     body category_id=<二级id>）——GET 或传一级 id 均返空，这是早年「接口返空」误判的根因。
 *
 * 引擎无法从 DOM 拿到详情链，故由本适配器的 postParseList 用货号拼 detailUrl：
 *   parseList 从表格行抽 name + sourceProductId（货号）→ 本钩子补 detailUrl。
 * YAML（config/sites/www.dojindo.cn.yaml）负责选择器与详情字段，本文件只做 URL 构造。
 */
import type { CodeAdapter } from './types.js';
import type { ListItem } from '@competitor-crawler/shared';

export default {
  postParseList(items: ListItem[]): ListItem[] {
    const out: ListItem[] = [];
    for (const it of items) {
      // 货号在列表阶段抽进 sourceProductId（raw 快照），空货号行（表头残留等）丢弃
      const model = String(it.raw?.sourceProductId ?? '').trim();
      if (!model) continue;
      out.push({
        ...it,
        detailUrl: `https://www.dojindo.cn/products/${encodeURIComponent(model)}`,
      });
    }
    return out;
  },
} satisfies CodeAdapter;
