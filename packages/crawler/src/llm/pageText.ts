import * as cheerio from 'cheerio';

/**
 * 页面 HTML → 模型可读的「可见文本」（docs/04 §4.4.1 提取环节的输入之一）。
 *
 * 为什么不直接把 HTML 丢给模型：详情页 HTML 动辄数百 KB，其中 90% 是脚本、样式、
 * 埋点与 class 噪声，既费 token 又干扰判断。这里**只保留用户肉眼能看到的内容**，
 * 并给块级元素补换行——否则 `.text()` 会把表格里各规格粘成一行，模型分不清边界。
 */

/** 不可见 / 无信息量的节点，直接删除 */
const DROP_SELECTOR =
  'script,style,noscript,iframe,svg,canvas,template,head,link,meta,[hidden],[aria-hidden="true"]';

/** 块级 / 表格单元 / 选项：结尾补换行，保住文本的行结构 */
const BREAK_SELECTOR =
  'br,p,div,tr,li,h1,h2,h3,h4,h5,h6,section,article,header,footer,aside,nav,td,th,option,label,dd,dt,blockquote,figcaption,table';

/** 连续空行压到一行；保留单换行以维持「规格一行一个」的结构 */
function normalizeLines(raw: string): string {
  return raw
    .split('\n')
    .map((l) => l.replace(/[ \t\u00a0\u3000]+/g, ' ').trim())
    .filter((l) => l !== '')
    .join('\n');
}

/**
 * 抽取页面可见文本。
 * @param maxChars 上限（默认 12000 字符）；超出截断并显式标注，避免模型误以为后面没内容
 */
export function htmlToVisibleText(html: string, maxChars = 12000): string {
  if (!html) return '';
  const $ = cheerio.load(html);
  $(DROP_SELECTOR).remove();

  $('br').replaceWith('\n');
  $(BREAK_SELECTOR).each((_, el) => {
    $(el).append('\n');
  });

  // 分别取 text()：`$('body')` 与 `$.root()` 的泛型不同，直接合成联合类型会让 `text()` 的 this 失配
  const body = $('body');
  const text = normalizeLines(body.length > 0 ? body.text() : $.root().text());

  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n…（内容超长已截断）`;
}
