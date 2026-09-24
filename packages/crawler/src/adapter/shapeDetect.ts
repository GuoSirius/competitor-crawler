// 规格 × 多种价格的「形态自动探测」（见 docs/05 §5.3.4）。
//
// 目的：免去人工逐个开页面判断该站属于哪种形态；检测到需要异步接口（形态 D/E）时，
// 直接给出「去哪配、怎么配」的可粘贴指引，用户从 Network 面板找到接口后回填即可。
//
// 另有一个**与 A~E 正交**的维度：页面是否用多 Tab 组织内容（docs/05 §5.3.5）。
// Tab 只决定「要不要点击」，不决定数据来源，故单独用 `tabs` 字段回报，不塞进 shape 枚举。

import * as cheerio from 'cheerio';

/** 形态枚举（与 docs/05 §5.3.4 表格一一对应） */
export type SpecPriceShape =
  | 'A-table' // 表格行：每行一个规格
  | 'B-option-attr' // 下拉项自带 data-* 属性
  | 'C-inline-json' // 页面内联 JSON / JS 变量
  | 'D-async' // 异步接口（选中规格 / 切换 Tab 后才请求）
  | 'E-computed' // 前端计算（无稳定数据源）
  | 'none'; // 未发现规格/价格结构（可能单规格）

/**
 * 多 Tab 结构探测结果（docs/05 §5.3.5）。
 *
 * 关键判据：**非激活面板在 HTML 里是不是有内容**。
 * - 有（`static`）→ 内容已随文档下发，只是被 CSS/属性隐藏，**不需要点击**，
 *   cheerio 选择器可直接选中隐藏面板里的元素；
 * - 无（`lazy`）→ 点击时才加载，本质是异步接口（形态 D）或前端计算（形态 E）。
 */
export interface TabReport {
  detected: boolean;
  /** 命中的 UI 框架 / 通用特征名 */
  matches: string[];
  /** 面板容器总数 */
  panelCount: number;
  /** 判定为「非激活」的面板数 */
  hiddenPanelCount: number;
  /** 非激活面板中「已有非空文本」的数量 */
  hiddenFilledCount: number;
  /** static=内容已在 HTML / lazy=点击后才加载 / none=未定位到面板容器 */
  kind: 'static' | 'lazy' | 'none';
}

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
  /** 多 Tab 结构探测（与 shape 正交；未检测到时为 undefined） */
  tabs?: TabReport;
}

/** 价格类属性名特征 */
const PRICE_ATTR_RE = /(price|jiage|money|amount|售价|原价|现价|活动价|优惠价)/i;
/** 规格类属性名特征 */
const SPEC_ATTR_RE = /(spec|sku|size|volume|pack|unit|qty|规格|型号|货号)/i;
/** 内联 JSON 线索：变量名含 sku/spec/price/goods，且跟着 { 或 [ */
const INLINE_JSON_RE = /(?:sku|spec|price|goods|product|item|detail)[A-Za-z_$]*\s*[:=]\s*[[{]/i;
/** 前端计算的线索：出现「价格 = ... x / * 数量」形态 */
const COMPUTE_RE = /(?:price|amount|money)[A-Za-z_$]*\s*[*×]\s*|\*\s*(?:qty|num|count|quantity)/i;

// ---------- 多 Tab 探测 ----------

/**
 * 已知 UI 框架的 Tab 选择器。
 *
 * ⚠️ **不要写 `[class*="tab"]`**：`table` / `ytable` 里都含 "tab"，实测（zqxbiomed 详情页）
 * 直接误命中 2 个元素。通用特征一律要求**连字符边界**。
 */
const TAB_FRAMEWORKS: ReadonlyArray<{ name: string; sel: string }> = [
  { name: 'WAI-ARIA', sel: '[role="tab"],[role="tablist"],[role="tabpanel"]' },
  { name: 'Bootstrap', sel: '[data-toggle="tab"],[data-bs-toggle="tab"],.nav-tabs,.tab-content,.tab-pane' },
  { name: 'Element UI/Plus', sel: '.el-tabs,.el-tabs__item,[class*="el-tab-pane"]' },
  { name: 'Ant Design', sel: '.ant-tabs,.ant-tabs-tab,[class*="ant-tabs-tabpane"]' },
  { name: 'Vant', sel: '.van-tabs,.van-tab,[class*="van-tab__pane"]' },
  { name: 'layui', sel: '.layui-tab,[class*="layui-tab-item"]' },
  { name: 'iView/View UI', sel: '.ivu-tabs,[class*="ivu-tabs-tabpane"]' },
  { name: 'TDesign', sel: '.t-tabs,[class*="t-tab-panel"]' },
  {
    name: '通用 tab- 命名',
    sel: '[class^="tab-"],[class~="tab"],[class*=" tab-"],[class*="-tab-"],[class$="-tab"],[class$="-tabs"],[class*="-tabs "]',
  },
];

/** 面板容器候选 */
const PANEL_SELECTOR = [
  '[role="tabpanel"]',
  '[class*="tab-pane"]',
  '[class*="tabPane"]',
  '[class*="tab-panel"]',
  '[class*="tabs-tabpane"]',
  '[class*="tab__pane"]',
  '[class*="layui-tab-item"]',
].join(',');

/** 表示「面板处于激活（可见）状态」的 class 记号 */
const ACTIVE_TOKENS = new Set([
  'active',
  'show',
  'in',
  'is-active',
  'current',
  'cur',
  'on',
  'selected',
  'checked',
  'open',
]);

/** 面板是否处于隐藏（非激活）状态 */
function isHiddenPanel($el: cheerio.Cheerio<any>): boolean {
  if ($el.attr('hidden') !== undefined) return true;
  if ($el.attr('aria-hidden') === 'true') return true;
  if (/display\s*:\s*none/i.test($el.attr('style') ?? '')) return true;
  const tokens = ($el.attr('class') ?? '').split(/\s+/).filter(Boolean);
  // 没有任何「激活」记号 → 按惯例视为隐藏面板
  return !tokens.some((t) => ACTIVE_TOKENS.has(t));
}

/** 探测页面是否用多 Tab 组织内容，并判断内容是否已随 HTML 下发 */
export function detectTabs($: cheerio.CheerioAPI): TabReport {
  const matches: string[] = [];
  for (const f of TAB_FRAMEWORKS) {
    if ($(f.sel).length > 0) matches.push(f.name);
  }

  const panels = $(PANEL_SELECTOR);
  const panelCount = panels.length;
  let hiddenPanelCount = 0;
  let hiddenFilledCount = 0;
  panels.each((_, el) => {
    const $el = $(el);
    if (!isHiddenPanel($el)) return;
    hiddenPanelCount++;
    if (($el.text() ?? '').replace(/\s+/g, '').length > 0) hiddenFilledCount++;
  });

  const detected = matches.length > 0 || panelCount > 0;
  if (!detected) {
    return { detected: false, matches, panelCount: 0, hiddenPanelCount: 0, hiddenFilledCount: 0, kind: 'none' };
  }

  const kind: TabReport['kind'] =
    panelCount === 0 ? 'none' : hiddenFilledCount > 0 ? 'static' : 'lazy';
  return { detected: true, matches, panelCount, hiddenPanelCount, hiddenFilledCount, kind };
}

/** Tab 证据行 */
function tabEvidence(t: TabReport): string[] {
  const lines = [`检测到 Tab 结构：${t.matches.join('、')}（面板 ${t.panelCount} 个，其中非激活 ${t.hiddenPanelCount} 个）`];
  if (t.kind === 'static') {
    lines.push(`非激活面板中 ${t.hiddenFilledCount} 个已有文本内容 → 内容已随 HTML 下发，**不需要点击**`);
  } else if (t.kind === 'lazy') {
    lines.push('非激活面板在 HTML 里均为空 → 点击后才加载（异步接口 / 前端计算）');
  } else {
    lines.push('找到 Tab 控件但未定位到面板容器，请人工确认内容是否在 HTML 中');
  }
  return lines;
}

// ---------- 主探测 ----------

/**
 * 探测一个**详情页** HTML 属于哪种规格×价格形态。
 * @param html 详情页 HTML（建议用 ssr/spa 渲染后的最终 HTML）
 */
export function detectSpecPriceShape(html: string): ShapeFinding {
  const $ = cheerio.load(html);
  const evidence: string[] = [];
  // Tab 维度与数据来源正交：先算出来，随每个结论一起回报
  const tabs = detectTabs($);

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
    return finding('B-option-attr', '下拉项自带属性', evidence, true, false, B_HOWTO, tabs);
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
    return finding('C-inline-json', '页面内联 JSON', evidence, true, false, C_HOWTO, tabs);
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
    return finding('A-table', '表格行规格', evidence, true, false, A_HOWTO, tabs);
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
      return finding('E-computed', '前端计算价格', evidence, false, true, E_HOWTO, tabs);
    }
    return finding('D-async', '异步接口（选中规格后请求）', evidence, false, true, D_HOWTO, tabs);
  }

  // ---------- 多 Tab 且非激活面板为空：本质是「点击后请求」----------
  if (tabs.kind === 'lazy') {
    return finding('D-async', 'Tab 内容懒加载（点击后请求）', evidence, false, true, TAB_LAZY_HOWTO, tabs);
  }

  evidence.push('未发现规格选择器 / 多行价格表格 / 内联 JSON（可能为单规格产品）');
  // 有静态 Tab 面板时，「可能为单规格产品」这个结论会误导——面板里其实是有内容的
  const noneTitle =
    tabs.kind === 'static' ? '未发现规格结构，但检测到 Tab 面板（内容已随 HTML 下发）' : '未发现多规格×多价格结构';
  return finding('none', noneTitle, evidence, true, false, '', tabs);
}

function finding(
  shape: SpecPriceShape,
  title: string,
  evidence: string[],
  staticExtractable: boolean,
  needsApi: boolean,
  howTo: string,
  tabs?: TabReport,
): ShapeFinding {
  const extra = tabs?.detected ? tabEvidence(tabs) : [];
  // Tab 内容已随 HTML 下发时，追加「不用点击」的可粘贴建议
  const tabNote = tabs?.kind === 'static' ? TAB_STATIC_HOWTO : '';
  return {
    shape,
    title,
    evidence: [...evidence, ...extra],
    staticExtractable,
    needsApi,
    howTo: [howTo, tabNote].filter(Boolean).join('\n\n'),
    ...(tabs ? { tabs } : {}),
  };
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
  · 若确实没有，则启用模型兜底（读页面可见文本）：
      parseDetail:
        modelFallback: true          # 或 { enabled: true, screenshot: false }
    （模型经 MODEL_MODE 配置选择本地/云端，见 docs/04 §4.2）
  · 若接口存在但被签名/风控保护，先保持告警，由人工确认后再决定是否逆向。`;

const TAB_STATIC_HOWTO = `**多 Tab 但不需要点击**：非激活面板的 HTML 已随文档下发，只是被 CSS/属性隐藏；
cheerio 选择器不关心可见性，**可直接选中隐藏面板里的元素**。按面板容器写选择器即可：
    description:
      sel: "[role='tabpanel'][hidden], .tab-pane:not(.active)"   # 非激活面板
      text: true
    specs:
      sel: ".tab-pane table tr, [role='tabpanel'] table tr"      # 隐藏面板内的规格表
      list: true
      map:
        spec:     { sel: "td:nth-child(1)", text: true }
        priceNow: { sel: "td:nth-child(2)", text: true, regex: '[\\d,]+\\.?\\d*' }
验证：pnpm probe --domain <domain>（会打印各面板是否有内容）。`.trim();

const TAB_LAZY_HOWTO = `**多 Tab 且非激活面板在 HTML 里是空的**（点击后才加载）→ 归入异步接口形态。
⚠️ 注意：**YAML 适配器目前不支持点击**（没有 click 指令），所以不能靠「配一下点击」解决，只有两条路：
  1) 在浏览器手动点一次该 Tab，从 Network 面板找到返回内容的请求 → 填到 parseDetail.api（做法见形态 D）；
  2) 若该内容由前端 JS 现场拼装/计算（没有任何请求）→ 属形态 E，用模型兜底：
        parseDetail:
          modelFallback: true
  3) 若接口被签名/风控保护 → 保持告警，人工确认后再决定是否逆向。`;
