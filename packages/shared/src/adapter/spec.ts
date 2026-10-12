// 配置 YAML 适配器的字段抽取规范（单一事实源）
//
// FieldSpec 字段抽取规范（单一事实源）。完整能力：
//   取值方式（四选一）：① 取文本 → 不填 attr（或 text: true）；② 取属性值 → attr: "href"/"src"；
//   ③ 取一段 → regex: '...'（优先第 1 捕获组，无捕获组取全匹配）；④ 取富文本 → html: true（innerHTML）
//   结构修饰：list（收集为数组）/ map（嵌套对象，配合 list 即对象数组）
//   标量强转：number（转数值，价格必用）/ bool（布尔，以 extract.ts 的 BOOL_TRUTHY/BOOL_FALSY 为准）
//   JSON 处理：json（解析内联 JSON）+ jsonPath（点号路径）+ pick（键重命名）
//   选择器哨兵：$self 读「当前元素自身」的文本/属性（详见 sel 字段注释）
//   固定值：const（不走 DOM，直接落该值——打标签/补站点级元数据用，详见 const 字段注释）
//
// 抽取与具体 DOM 实现解耦：消费方只需提供 DomRead 实现（cheerio / Playwright 均可用）。

export interface FieldSpec {
  /**
   * CSS 选择器；在「当前上下文」内查询。
   * 特殊值 `$self`：表示**当前节点自身**（用于读匹配元素自己的文本/属性，
   * 典型场景：`<option data-price>` 这类「属性挂在被选中的元素上」的结构）。
   * 配了 `const` 时可省略（固定值不走 DOM）。
   */
  sel?: string;
  /**
   * 固定值：不走 DOM 抽取，每条记录直接落该值（标量/数组/对象均可）。
   * 用途：给抓到的数据打固定标签/补站点级元数据，如
   *   category: { const: 抗体 } / source: { const: 官网 } / tags: { const: [热销, 新品] }。
   * 字段名在注册表内 → 落对应数据库列；不在 → 随其它未知字段进 row 兜底 JSON。
   * 注意：① 与 sel 互斥，同时写时 const 优先（sel 被忽略）；
   *      ② 不参与 number/bool 强转（写什么落什么）；
   *      ③ YAML 侧字符串含前导零/日期形态必须加引号（`{ const: "00123" }`），否则会被 YAML 解析成数值/日期。
   */
  const?: unknown;
  /** 取该属性值（如 href/src）；不填则取文本 */
  attr?: string;
  /** 显式声明取文本（与「无 attr」等价，仅提升可读性） */
  text?: boolean;
  /**
   * true=取**节点 innerHTML**（保留标签结构），与 text 互斥（attr > html > text 优先级）。
   * 用于富文本留存（contents.bodyHtml 列）：只给想要存 HTML 的栏目显式加 `html: true`，
   * 不配就走纯文本，避免无谓地把整站体积翻倍。
   */
  html?: boolean;
  /** 对原始串（文本或属性值）做正则；优先第 1 捕获组，否则全匹配 */
  regex?: string;
  /**
   * true=把结果强制转成数值（去掉千分位逗号、币种符号、空白后 Number()；失败返回 null）。
   * 用于价格等需要进 numeric 列、要参与排序/比价的字段；与 list / map 可叠加。
   */
  number?: boolean;
  /**
   * true=把抽到的字符串当 JSON 解析（宽松：失败时截取最外层 {} / [] 再试）。
   * 用于页面 `<script>` 内联 JSON（形态 C）或接口响应（形态 D）。
   */
  json?: boolean;
  /**
   * true=把文本/属性值强转成布尔（在 `number` 之外补齐第四种标量类型）。
   * 真值：true/1/yes/y/on/是/有/有货/现货/在售/正常；假值：false/0/no/n/off/否/无/缺货/停售/下架/售罄。
 * （以 extract.ts 的 BOOL_TRUTHY / BOOL_FALSY 正则为准，二者不含「缺省可购」。）
   * 不在表内的值返回 null（宁可空也不猜，错误映射会在比价侧变成脏数据）。
   * 典型场景：列表卡的「现货/缺货」角标、详情页「有货」状态位。
   */
  bool?: boolean;
  /** `json` 为 true 时生效：按点号路径定位，如 `data.list` / `props.skus` */
  jsonPath?: string;
  /**
   * `json` 为 true 时生效：键重命名 `{ 我方键: 站点键 }`（数组则逐项重命名）。
   * 用于把站点的 `specName / price / marketPrice` 映射成 `spec / priceNow / priceOriginal`。
   */
  pick?: Record<string, string>;
  /** true=收集所有匹配为数组；缺省/ false=取第一个 */
  list?: boolean;
  /** 嵌套：list 的每一项（或单元素）内，按 map 再抽子字段 */
  map?: Record<string, FieldSpec>;
}

/** DOM 读取能力抽象，由 cheerio / Playwright 各自实现 */
export interface DomRead {
  /** 取文本；不传 sel 则取当前节点自身文本 */
  text(sel?: string): string | null;
  /** 取属性；不传 sel 则取当前节点自身属性 */
  attr(name: string, sel?: string): string | null;
  /** 取 innerHTML（保留标签结构，富文本留存用）；不传 sel 则取当前节点自身 */
  html(sel?: string): string | null;
  /** 在当前上下文内按 sel 列出所有匹配，返回子 DomRead */
  list(sel: string): DomRead[];
  /** 当前上下文内是否存在 sel 匹配 */
  exists(sel: string): boolean;
}
