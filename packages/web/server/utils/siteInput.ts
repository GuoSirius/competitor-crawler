/**
 * 「自助加站点」表单的纯校验/拼装逻辑（docs/16 S2 + Q4）。
 * 与 h3 解耦：返回 result 对象而非抛 createError，便于单元测试；
 * sites.post.ts 负责把 !ok 映射成 4xx 响应。
 */

/** YAML 双引号标量转义：值里出现 引号/反斜杠/换行 时不会破坏结构或注入键 */
export const yq = (s: string): string =>
  `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\n')}"`;

export interface NewSiteInput {
  domain?: string;
  company?: string;
  startUrl?: string;
  category?: string;
}

export type ValidatedSiteInput =
  | { ok: true; domain: string; company: string; startUrl: string; category: string }
  | { ok: false; statusMessage: string };

/** 校验并归一化表单输入（全部 trim；category 缺省用 domain） */
export function validateSiteInput(body: NewSiteInput): ValidatedSiteInput {
  const domain = (body.domain ?? '').trim();
  const company = (body.company ?? '').trim();
  const startUrl = (body.startUrl ?? '').trim();
  const category = (body.category ?? '').trim() || domain;

  if (!/^[\w.-]+$/.test(domain))
    return { ok: false, statusMessage: 'domain 仅允许字母/数字/.-，且不含协议与路径' };
  if (!company || !startUrl)
    return { ok: false, statusMessage: 'company 与 startUrl 必填' };
  // startUrl 必须是合法 http(s) 链接（不做 URL 校验会把脏值写进 YAML）
  try {
    if (!/^https?:$/.test(new URL(startUrl).protocol)) throw new Error('not http(s)');
  } catch {
    return { ok: false, statusMessage: 'startUrl 必须是合法的 http(s) 链接' };
  }
  return { ok: true, domain, company, startUrl, category };
}

/** 用校验后的输入拼模板 YAML（TODO 选择器由同事再用 probe 验证/补齐） */
export function buildSiteYaml(input: {
  domain: string;
  company: string;
  startUrl: string;
  category: string;
}): string {
  return `domain: ${input.domain}
company: ${yq(input.company)}
currency: CNY
parseList:
  itemSelector: "TODO: 列表项选择器"
  fields:
    detailUrl: { sel: "a", attr: href }
    name:       { sel: "a", text: true }
parseDetail:
  fields: {}
  captureRest: true
sections:
  - key: default
    category: ${yq(input.category)}
    startUrls: [${yq(input.startUrl)}]
    listTraversal:
      strategy: pagination-html
      nextSelector: ".next"
      maxPages: 20
      fallbackToUi: true
`;
}
