import { describe, expect, it } from 'vitest';
import { buildSiteYaml, validateSiteInput, yq } from './siteInput.js';

describe('siteInput 自助加站点校验（docs/16 S2 + Q4）', () => {
  it('合法输入：trim + category 缺省回落 domain', () => {
    const r = validateSiteInput({ domain: ' x.com ', company: ' 某公司 ', startUrl: 'https://x.com/list' });
    expect(r).toEqual({
      ok: true,
      domain: 'x.com',
      company: '某公司',
      startUrl: 'https://x.com/list',
      category: 'x.com',
    });
  });

  it('非法 domain（协议/路径/空）→ 拒绝', () => {
    expect(validateSiteInput({ domain: 'https://x.com', company: 'a', startUrl: 'https://x.com' }).ok).toBe(false);
    expect(validateSiteInput({ domain: '../evil', company: 'a', startUrl: 'https://x.com' }).ok).toBe(false);
    expect(validateSiteInput({ company: 'a', startUrl: 'https://x.com' }).ok).toBe(false);
  });

  it('startUrl 非 http(s)（含 ftp / 纯文本 / 垃圾值）→ 拒绝', () => {
    for (const bad of ['ftp://x.com', 'x.com/list', 'javascript:alert(1)', '']) {
      expect(validateSiteInput({ domain: 'x.com', company: 'a', startUrl: bad }).ok).toBe(false);
    }
  });

  it('yq：引号/反斜杠/换行都被转义，不破坏 YAML 结构', () => {
    expect(yq('含"引号')).toBe('"含\\"引号"');
    expect(yq('a\\b')).toBe('"a\\\\b"');
    expect(yq('l1\nl2')).toBe('"l1\\nl2"');
  });

  it('buildSiteYaml：company/category/startUrl 均经 yq 包裹', () => {
    const y = buildSiteYaml({ domain: 'x.com', company: 'A"公司', startUrl: 'https://x.com/l', category: '试剂' });
    expect(y).toContain('company: "A\\"公司"');
    expect(y).toContain('category: "试剂"');
    expect(y).toContain('startUrls: ["https://x.com/l"]');
    expect(y).toContain('domain: x.com');
  });
});
