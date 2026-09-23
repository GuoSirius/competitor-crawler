// 规格 × 多种价格的「形态自动探测」（见 docs/05 §5.3.4）。
//
// 目的：免去人工逐个开页面判断该站属于哪种形态；检测到需要异步接口（形态 D/E）时，
// 直接给出「去哪配、怎么配」的可粘贴指引，用户从 Network 面板找到接口后回填即可。

import * as cheerio from 'cheerio';

/** 形态枚举（与 docs/05 §5.3.4 表格一一对应） */
export type SpecPriceShape =
  | 'A-table' // 表格行：每行一个规格
  | 'B-option-attr' // 下拉项自带 data-* 属性
  | 'C-inline-json' // 页面内联 JSON / JS 变量
  | 'D-async' // 异步接口（选中规格后才请求）
  | 'E-computed' // 前端计算（无稳定数据源）
  | 'none'; // 未发现规格/价格结构（可能单规格）

export interface ShapeFinding {
  shape: SpecPriceShape;
  title: string;
  /** 判定证据（人类可读） */
  evidence: string[];
  /** 是否为「静态可抽」——true 表示写 YAML 即可，不需要人工提供接口 */
  staticExtractable: boolean;
  /** 需要人工提供接口时置 true（会落 NEEDS_API_HINT 告警） */
  needsApi: boolean;
  /** 「在哪配、怎么配」——含可粘贴片段 */
  howTo: string;
}

/** 价格类属性名特征 */
const PRICE_ATTR_RE = /(price|jiage|money|amount|售价|原价|现价|活动价|优惠价)/i;
/** 规格类属性名特征 */
const SPEC_ATTR_RE = /(spec|sku|size|volume|pack|unit|qty|规格|型号|货号)/i;
/** 内联 JSON 线索：变量名含 sku/spec/price/goods，且跟着 { 或 [ */
const INLINE_JSON_RE = /(?:sku|spec|price|goods|product|item|detail)[A-Za-z_$]*\s*[:=]\s*[[{]/i;
/** 前端计算的线索：出现「价格 = ... x / * 数量」形态 */
const COMPUTE_RE = /(?:price|amount|money)[A-Za-z_$]*\s*[*×]\s*|\*\s*(?:qty|num|count|quantity)/i;

/**
 * 探测一个**详情页** HTML 属于哪种规格×价格形态。
 * @param html 详情页 HTML（建议用 ssr/spa 渲染后的最终 HTML）
 */
export function detectSpecPriceShape(html: string): ShapeFinding {
  const $ = cheerio.load(html);
  const evidence: string[] = [];

  // ---------- 形态 B：下拉项自带属性 ----------
  const optionAttrs = new Set<string>();
  $('select option').each((_, el) => {
    const attrs = $(el).attr();
    if (attrs) for (const k of Object.keys(attrs)) optionAttrs.add(k.toLowerCase());
  });
  const priceAttrs = [...optionAttrs].filter((a) => PRICE_ATTR_RE.test(a));
  const specAttrs = [...optionAttrs].filter((a) => SPEC_ATTR_RE.test(a));
  if (priceAttrs.length > 0 || specAttrs.length > 0) {
    evidence.push(
      `<select><option> 自带属性：${[...priceAttrs, ...specAttrs].map((a) => `data-*="${a}"`).join('、')}`,
    );
    return finding('B-option-attr', '下拉项自带属性', evidence, true, false, B_HOWTO);
  }

  // ---------- 形态 D（前置）：存在下拉/规格选择器但没有自带属性 ----------
  const hasSelect = $('select').length > 0;
  const variantBtns = $(
    '.sku-item, .spec-item, .variant, .product-attr li, [class*="sku"] li, [class*="spec"] li',
  ).length;

  // ---------- 形态 C：内联 JSON ----------
  const inlineHits: string[] = [];
  $('script').each((_, el) => {
    const $el = $(el);
    const t = $el.text() ?? '';
    // 框架内联状态的标记可能在 **id / type 属性**上（如 <script id="__NEXT_DATA__">），也可能在文本里
    const marker = `${$el.attr('id') ?? ''} ${$el.attr('type') ?? ''} ${t}`;
    if (/__NEXT_DATA__|__NUXT_DATA__|__NUXT__|__INITIAL_STATE__|__APOLLO_STATE__|window\.__\w+__/.test(marker)) {
      inlineHits.push(
        `框架内联状态：<script id="${$el.attr('id') ?? '(无)'}">（可用 json + jsonPath 定位，如 props.pageProps.skus）`,
      );
      return;
    }
    if (!t) return;
    if (INLINE_JSON_RE.test(t)) {
      const m = t.match(INLINE_JSON_RE);
      inlineHits.push(`内联变量：${(m?.[0] ?? 'skuList = [').replace(/\s+/g, ' ').trim()}…`);
    }
  });
  if (inlineHits.length > 0) {
    evidence.push(...inlineHits.slice(0, 3));
    return finding('C-inline-json', '页面内联 JSON', evidence, true, false, C_HOWTO);
  }

  // ---------- 形态 A：表格行 ----------
  let rowsWithPrice = 0;
  $('table tr').each((_, tr) => {
    const t = $(tr).text();
    if (/\d[\d,]*\.?\d*/.test(t) && (PRICE_ATTR_RE.test(t) || /[¥￥$]\s*\d/.test(t) || /\d+\s*元/.test(t))) {
      rowsWithPrice++;
    }
  });
  if (rowsWithPrice >= 2) {
    evidence.push(`表格中约 ${rowsWithPrice} 行含价格文本（疑似每行一个规格）`);
    return finding('A-table', '表格行规格', evidence, true, false, A_HOWTO);
  }

  // ---------- 形态 D / E：有规格选择但没有静态数据 ----------
  if (hasSelect || variantBtns > 0) {
    const why = hasSelect ? '存在 <select> 但 option 未携带价格/规格属性' : `存在 ${variantBtns} 个规格/变体选择元素`;
    evidence.push(why);
    evidence.push('页面 HTML 里未见规格×价格的静态数据（表格 / 内联 JSON）');
    // 进一步区分 E：脚本里出现价格乘法计算
    let computeHit = '';
    $('script').each((_, el) => {
      const t = $(el).text() ?? '';
      if (!computeHit && COMPUTE_RE.test(t)) computeHit = t.match(COMPUTE_RE)?.[0]?.trim() ?? '';
    });
    if (computeHit) {
      evidence.push(`脚本中出现价格计算片段：${computeHit}`);
      return finding('E-computed', '前端计算价格', evidence, false, true, E_HOWTO);
    }
    return finding('D-async', '异步接口（选中规格后请求）', evidence, false, true, D_HOWTO);
  }

  evidence.push('未发现规格选择器 / 多行价格表格 / 内联 JSON（可能为单规格产品）');
  return finding('none', '未发现多规格×多价格结构', evidence, true, false, '');
}

function finding(
  shape: SpecPriceShape,
  title: string,
  evidence: string[],
  staticExtractable: boolean,
  needsApi: boolean,
  howTo: string,
): ShapeFinding {
  return { shape, title, evidence, staticExtractable, needsApi, howTo };
}

// ---------- 各形态的「怎么配」指引（可粘贴 YAML） ----------

const A_HOWTO = `在 config/sites/<domain>.yaml 的 parseDetail.fields 里按表格行配置（静态可抽）：
    specs:
      sel: "table.price-table tbody tr"      # 每行一个规格
      list: true
      map:
        spec:          { sel: "td:nth-child(1)", text: true }
        priceNow:      { sel: "td:nth-child(2)", text: true, regex: '[\\d,]+\\.?\\d*' }
        priceOriginal: { sel: "td:nth-child(3)", text: true }`;

const B_HOWTO = `在 config/sites/<domain>.yaml 的 parseDetail.fields 里用 sel: '$self'（静态可抽）：
    specs:
      sel: "select#spec option"
      list: true
      map:
        spec:          { sel: "$self", attr: "data-spec" }
        priceNow:      { sel: "$self", attr: "data-price" }
        priceOriginal: { sel: "$self", attr: "data-market-price" }`;

const C_HOWTO = `在 config/sites/<domain>.yaml 的 parseDetail.fields 里用 json + jsonPath + pick（静态可抽）：
    specs:
      sel: "script"
      text: true
      regex: 'skuList\\s*=\\s*(\\[[\\s\\S]*?\\]);'   # 抠出 JSON 串
      json: true                                     # 解析成数组/对象
      jsonPath: "data.skus"                          # 可选：定位到数组所在层级
      pick:                                          # 站点键 → 我方键
        spec: "specName"
        priceNow: "price"
        priceOriginal: "marketPrice"`;

const D_HOWTO = `该形态**无法静态抽取**，需要你提供接口地址。操作步骤：
  1. 浏览器打开该详情页 → F12 → Network 面板 → 勾选「XHR / Fetch」
  2. 在页面上切换一次规格（或直接刷新），找到返回规格/价格的那个请求
  3. 右键 → Copy → Copy link address，拿到接口 URL
  4. 把 URL 填到 config/sites/<domain>.yaml 的 parseDetail.api（新增块，位置与 fields 同级）：

  parseDetail:
    fields: { … 保持不动 … }
    api:
      - target: specs                 # 结果写到 specs（多规格）/ introMedia / 其他名字→row
        url: "https://<domain>/api/goods/{sku}/skus"   # {sku}/{sourceProductId}/{detailUrl} 可作占位符
        method: GET                   # 默认 GET
        headers:                      # 若接口需要 Referer / X-Requested-With 等
          Referer: "https://<domain>/"
        rootPath: "data.list"         # 从响应里定位数组，如 data.list
        pick:                         # 站点键 → 我方键
          spec: "specName"
          priceNow: "price"
          priceOriginal: "marketPrice"

  填好后跑：pnpm probe --domain <domain>   # 会实测该接口并报条数
            pnpm crawl --site <domain> --dry-run --limit 3`;

const E_HOWTO = `该形态价格由前端计算得出，**没有可直接取的数据源**。建议：
  · 优先按「异步接口」思路找一个返回原始价格的请求（见 D 的做法）填到 parseDetail.api；
  · 若确实没有，则需要启用模型兜底适配器（读页面可见文本 + 截图）；
  · 若接口存在但被签名/风控保护，先保持告警，由人工确认后再决定是否逆向。`;
