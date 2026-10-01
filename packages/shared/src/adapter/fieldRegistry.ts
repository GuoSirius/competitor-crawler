// 字段注册表（单一事实源）：声明 products / contents 各「内建字段」的元信息。
//
// 解决两类长期痛点（docs/11 Q1/Q2）：
//   - Q1 不知道该配哪些字段：本表即「字段字典」，`pnpm field-docs` 打印给用户；
//     `validateSiteConfig` 用它检测 YAML 里的未知字段 / 疑似拼写错误 / 缺必填，
//     但不阻断流程（只 WARN/INFO，error 级也仅给 CI 退出码，不抛异常）。
//   - Q2 两阶段合并硬编码：mergeListFallback 改由本表驱动（listFallback 标记哪些字段
//     「详情优先、列表兜底」合并，auditMismatch 标记哪些字段做不一致审计）。
//
// 站点特有字段（种属/宿主/反应性等）不在本表 —— 它们合法，会进 `row` 兜底列，
// 不应被误报为「错误字段」。

export type FieldStage = 'list' | 'detail' | 'both' | 'site';
export type FieldType = 'string' | 'number' | 'string[]' | 'object[]';
export type ContentKind = 'products' | 'contents';

export interface FieldMeta {
  /** 内建字段名（YAML 里应配的 key，如 'name'） */
  name: string;
  /** 值类型 */
  type: FieldType;
  /**
   * 可用阶段：
   * - 'list'   仅列表阶段抽取（如 detailUrl，由列表条目抽出）
   * - 'detail' 仅详情阶段抽取（如 description / specs）
   * - 'both'   两阶段都可能抽到（如 name / sku / price）
   * - 'site'   站点级配置，非解析字段（如 currency，由 YAML 顶层设定）
   */
  stage: FieldStage;
  /** products/content 必填（缺失会 WARN/ERROR，但不阻断） */
  required?: boolean;
  /** 参与去重身份键（sourceProductId / detailUrl / sourceId / title 等） */
  identity?: boolean;
  /**
   * Q2：参与「详情优先、列表兜底」合并（标量/数值字段）。
   * 数组字段（specs/introMedia/applications）不参与。
   */
  listFallback?: boolean;
  /**
   * Q2：列表与详情两阶段都抽到且不一致时，把列表值存入 `row[<name>_list]`
   * 并计入 summary.fieldMismatches（非阻断告警）。仅对「本应一致」的标量开启，
   * 刻意不同的字段（如 description 列表是摘要、详情是全文）保持关闭以减少噪音。
   */
  auditMismatch?: boolean;
  /** 给用户看的说明（field-docs 打印 + 校验提示复用） */
  desc: string;
}

/** 产品管线内建字段（写入 products 表） */
export const PRODUCT_FIELDS: FieldMeta[] = [
  { name: 'name', type: 'string', stage: 'both', required: true, listFallback: true, auditMismatch: true, desc: '产品名（列表/详情展示与比对的名称）' },
  { name: 'sourceProductId', type: 'string', stage: 'detail', identity: true, listFallback: true, auditMismatch: true, desc: '站点自身产品 id；身份键之一（无则回退 detailUrl），不用货号兜底' },
  { name: 'sku', type: 'string', stage: 'both', listFallback: true, auditMismatch: true, desc: '货号（catalog number）= 默认规格货号；一品多货号时存默认/首个规格的货号' },
  { name: 'englishName', type: 'string', stage: 'detail', listFallback: true, auditMismatch: true, desc: '英文名' },
  { name: 'aliases', type: 'string', stage: 'detail', listFallback: true, desc: '别称/曾用名（站点原样，可能含现用名，分号分隔）' },
  { name: 'oldSkus', type: 'string', stage: 'detail', listFallback: true, desc: '曾用货号（站点原样，可能含现用货号，分号分隔）' },
  { name: 'brand', type: 'string', stage: 'both', listFallback: true, auditMismatch: true, desc: '品牌' },
  { name: 'price', type: 'number', stage: 'both', listFallback: true, auditMismatch: true, desc: '价格数值（默认规格现价；排序/涨跌/比价统一口径；YAML 须 number: true）' },
  { name: 'currency', type: 'string', stage: 'site', desc: '币种（站点级，由 YAML 顶层 currency 设定，非解析字段）' },
  { name: 'priceText', type: 'string', stage: 'both', listFallback: true, auditMismatch: true, desc: '价格原文保真' },
  { name: 'specText', type: 'string', stage: 'both', listFallback: true, auditMismatch: true, desc: '规格原文（如 100μL），比价须同规格' },
  { name: 'description', type: 'string', stage: 'detail', listFallback: true, desc: '纯文本描述（列表常是摘要、详情是全文，刻意不同不审计）' },
  { name: 'detailUrl', type: 'string', stage: 'list', identity: true, desc: '详情页 URL（列表条目抽出，身份键之一）' },
  { name: 'cloneNumber', type: 'string', stage: 'detail', listFallback: true, auditMismatch: true, desc: '克隆号' },
  { name: 'specs', type: 'object[]', stage: 'detail', desc: '规格变体数组（spec/条件/sku/各档价格）' },
  { name: 'introMedia', type: 'object[]', stage: 'detail', desc: '介绍图文/视频数组' },
  { name: 'applications', type: 'string[]', stage: 'detail', desc: '应用场景标签数组' },
];

/** 内容管线内建字段（写入 contents 表；contentType != 'products' 的栏目） */
export const CONTENT_FIELDS: FieldMeta[] = [
  { name: 'title', type: 'string', stage: 'detail', required: true, listFallback: true, auditMismatch: true, desc: '内容标题（必填）。YAML 里推荐配 name（抽取引擎统一字段：详情 np.name→落库 title、列表 name→it.name→title）；配 title 也可，经 row/列表 raw 兜底生效' },
  { name: 'summary', type: 'string', stage: 'detail', listFallback: true, desc: '摘要' },
  { name: 'body', type: 'string', stage: 'detail', listFallback: true, desc: '正文（纯文本）' },
  {
    name: 'bodyHtml',
    type: 'string',
    stage: 'detail',
    desc:
      '正文富文本（innerHTML，存 contents.body_html 列）。非必填、默认不抽——只有 YAML 里显式加 ' +
      "`bodyHtml: { sel: <正文容器>, html: true }` 才抽取落库；不配则 body_html 恒为 null，不浪费存储。",
  },
  { name: 'author', type: 'string', stage: 'detail', listFallback: true, auditMismatch: true, desc: '作者' },
  { name: 'publishedAt', type: 'number', stage: 'detail', listFallback: true, auditMismatch: true, desc: '发布时间（Unix 秒；YAML 须 number: true）' },
  { name: 'detailUrl', type: 'string', stage: 'list', identity: true, desc: '详情页 URL（列表抽取，身份键之一）' },
  { name: 'sourceId', type: 'string', stage: 'detail', identity: true, listFallback: true, auditMismatch: true, desc: '站点自身内容 id（身份键之一）' },
  { name: 'listUrl', type: 'string', stage: 'list', desc: '列表页地址（溯源）' },
];

/**
 * `dbColumnOf`：YAML 里 `parseList.fields` / `parseDetail.fields` 的 key → **落库列名**。
 *
 * 用来回答「我配了这个字段，数据到底进哪个列」——注册表里只有字段名（camelCase），
 * 表里是 snake_case，两者不一一对应（如 YAML 的 `bodyHtml` → `body_html`、
 * contents 管线 YAML 配 `name` → 实际落 `title` 列）。
 *
 * @returns `null` = 注册表未登记（站点特有字段），只进 `row` 兜底列，不落独立列；
 *          `'—'` = 站点级配置（如 currency），不是解析字段、无对应列。
 */
export function dbColumnOf(fieldName: string, kind: ContentKind = 'products'): string | null {
  // contents 管线统一收口到 title 列（YAML 推荐配 `name`，引擎经 np.name → title）
  if (kind === 'contents' && fieldName === 'name') return 'title';
  // 按管线查（products 的 englishName 等字段在 contents 表并不存在，不能混查）
  const hit = (kind === 'contents' ? CONTENT_FIELDS : PRODUCT_FIELDS).find((f) => f.name === fieldName);
  if (!hit) return null; // 站点特有字段 → row JSON
  if (hit.stage === 'site') return '—'; // 站点级，非解析字段
  return fieldName.replace(/([A-Z])/g, '_$1').toLowerCase();
}

/** 全部「可作为 YAML 解析字段」的内建名（不含 site 级 currency） */
export const BUILTIN_FIELD_NAMES: ReadonlySet<string> = new Set(
  [...PRODUCT_FIELDS, ...CONTENT_FIELDS].filter((f) => f.stage !== 'site').map((f) => f.name),
);

const PRODUCT_MAP = new Map(PRODUCT_FIELDS.map((f) => [f.name, f]));
const CONTENT_MAP = new Map(CONTENT_FIELDS.map((f) => [f.name, f]));

/** 取某字段元信息；kind 决定查哪套注册表（products / contents） */
export function getFieldMeta(name: string, kind: ContentKind = 'products'): FieldMeta | undefined {
  return (kind === 'contents' ? CONTENT_MAP : PRODUCT_MAP).get(name);
}

/** 对应内容类型的完整注册表 */
export function fieldsForKind(kind: ContentKind): FieldMeta[] {
  return kind === 'contents' ? CONTENT_FIELDS : PRODUCT_FIELDS;
}

/**
 * 编辑距离（Levenshtein），用于「疑似拼写错误」建议。
 * 实际只用到距离，不依赖第三方库。
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev: number[] = Array.from({ length: n + 1 }, (_, i) => i);
  let curr: number[] = new Array<number>(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      const del = (prev[j] ?? 0) + 1;
      const ins = (curr[j - 1] ?? 0) + 1;
      const sub = (prev[j - 1] ?? 0) + cost;
      curr[j] = Math.min(del, ins, sub);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n] ?? 0;
}

/** 按 camelCase / 分隔符拆分字段名成词元（用于 productName → [product, name]） */
function tokensOf(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[\s\-_./]+/)
    .map((t) => t.toLowerCase())
    .filter(Boolean);
}

/**
 * 为「未知字段名」找一个最接近的「内建字段」做拼写建议。
 * 命中条件（任一，阈值刻意收紧——宁漏勿误）：
 *   - 整体编辑距离 ≤ 1（如 priceTxt → priceText 距离 1）；
 *   - 某个词元与某内建字段完全相等或编辑距离 ≤ 1（如 productName 的 name 词元 → name）。
 * 返回 null 表示「不像任何内建字段」——即合法站点特有字段，不误报。
 *
 * 设计取舍：阈值 ≤1 而非 ≤2/3，因为抗体系站点常见自定义字段（species↔specs 距离 2、
 * host↔sku 等）绝不应当被提示为拼写错误。漏掉 nmae→name 这类换序错可接受，
 * 误报会让用户对告警脱敏（狼来了效应）。
 */
export function suggestFieldName(name: string, kind: ContentKind = 'products'): string | null {
  const candidates = fieldsForKind(kind);
  const lower = name.toLowerCase();
  const toks = tokensOf(name);
  // 整体命中优先（完整字段名的手滑最可信，如 priceTxt→priceText），词元命中次之（productName→name）
  let bestWhole: { name: string; dist: number } | null = null;
  let bestToken: { name: string; dist: number } | null = null;
  for (const c of candidates) {
    if (c.stage === 'site') continue;
    const cLower = c.name.toLowerCase();
    const wd = levenshtein(lower, cLower);
    if (wd <= 1 && (!bestWhole || wd < bestWhole.dist)) bestWhole = { name: c.name, dist: wd };
    for (const t of toks) {
      const d = levenshtein(t, cLower);
      if (d <= 1 && (!bestToken || d < bestToken.dist)) bestToken = { name: c.name, dist: d };
    }
  }
  return bestWhole?.name ?? bestToken?.name ?? null;
}
