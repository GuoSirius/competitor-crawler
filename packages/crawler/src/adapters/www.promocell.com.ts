/**
 * PromoCell 代码适配器（www.promocell.com）
 * =========================================
 * 背景（2026-10-08 实测，docs/14 §3 PromoCell 行）：
 *   Magento 2 hyva/jet 主题 + Alpine。列表卡是「服务端渲染骨架」——
 *   img.product-image-photo 的 alt（=产品名）服务端直出，但名称文本/链接是
 *   Alpine :href/x-html 绑定，products:[] 数据数组为空且无产品数据 XHR
 *   （25s 长等 + usercentrics 同意点击均不 hydrate）→ detailUrl 无法从 HTML 抽取。
 *
 * 解法：Magento 惯例 url_key = 产品名 slug，getProductUrl = BASE_URL + url_key + '.html'。
 *   已实测构造 URL 命中（human-umbilical-vein-endothelial-cells-huvec.html 等）。
 *   本适配器在 postParseList 里把 YAML 抽到的名称 slug 化后重写 detailUrl。
 *
 * postParseDetail 补两处（2026-10-08 probe 实测）：
 *   · sku：详情页无货号节点，货号只出现在主图文件名（/C/-/C-12200.jpg，PromoCell 以
 *     货号命名产品主图）；页面上其它 [data-sku] 是推荐位/图库 id（IV-xxxx），不可用。
 *   · price：EU 格式「72,00 €」被引擎按美式千分位解析成 7200 → 按 EU 规则
 *     （点=千分位、逗号=小数）从 priceText 重算。
 *
 * YAML 里 detailUrl 的占位选择器与 name 相同（img alt）——先保证卡片不被引擎
 * 当「缺 detailUrl」丢弃，再在这里统一改写为真实详情地址。
 */
import type { CodeAdapter } from './types.js';

const BASE = 'https://promocell.com/fr_fr/';

/** 产品名 → Magento url_key（小写、去变音符号、非字母数字折叠为 -） */
function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // 去变音符（é → e）
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** EU 价格文本（72,00 € / 1.234,56 €）→ 数值 */
function parseEuPrice(text: string): number | null {
  const m = text.replace(/\s|€/g, '').match(/^(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})$/);
  if (!m) return null;
  const whole = m[1].replace(/\./g, '');
  return Number(`${whole}.${m[2]}`);
}

export default {
  postParseList(items, _ctx) {
    return items
      .map((it) => {
        const name = (it.name ?? '').trim();
        if (!name) return it;
        const slug = slugify(name);
        if (!slug) return it;
        it.detailUrl = `${BASE}${slug}.html`;
        return it;
      })
      .filter((it) => it.detailUrl && /\.html$/.test(it.detailUrl));
  },

  postParseDetail(np, html) {
    if (!np.sku) {
      const m = html.match(/\/C\/-\/(C-\d+)\.jpg/);
      if (m) np.sku = m[1];
    }
    if (np.priceText) {
      const eu = parseEuPrice(np.priceText);
      if (eu != null) np.price = eu;
    }
    return np;
  },
} satisfies CodeAdapter;
