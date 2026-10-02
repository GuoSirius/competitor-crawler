import { describe, expect, it } from 'vitest';
import { assessChallenge } from './challenge.js';

/** Promega 正常页：`.g-recaptcha`/`[data-sitekey]` 在富文本编辑器白名单 JSON 里 */
const PROMETA_OK = {
  status: 200,
  innerText: 'Cell Health Assays 产品列表 assay 试剂盒细胞实验',
  html: '<script id="rtm-style-config" type="application/json">{"allowlist":["select","hr",".g-recaptcha","[data-sitekey]"]}</script>',
  contentChars: 820,
};

describe('assessChallenge — 不误检', () => {
  it('正常页（.g-recaptcha 只出现在编辑器白名单 JSON 里）→ 干净放行，不算挑战', () => {
    const r = assessChallenge(PROMETA_OK);
    expect(r.hit).toBeNull();
    expect(r.confidence).toBe('none');
    expect(r.falseAlarm).toBe(false);
  });

  it('正常产品页命中 cf ray id 边角词 + 大量正文 → 判为误报放行', () => {
    const r = assessChallenge({
      status: 200,
      innerText: 'ABclonal 抗体 产品中心 ray id: abc123 共 1200 个产品 价格 规格 说明书 用途 有效期',
      html: '<script>{"allowlist":[".g-recaptcha"]}</script>',
      contentChars: 3000,
    });
    expect(r.hit).toBeNull();
    expect(r.falseAlarm).toBe(true);
  });
});

describe('assessChallenge — 不漏检', () => {
  it('CF 非交互挑战（可见文案）→ high cloudflare', () => {
    const r = assessChallenge({
      status: 503,
      innerText: 'Just a moment...Checking your browser before accessing. Please enable JS.',
      contentChars: 120,
    });
    expect(r.hit?.kind).toBe('cloudflare');
    expect(r.confidence).toBe('high');
  });

  it('WAF 403 阻断（正文无挑战文案）→ high unknown', () => {
    const r = assessChallenge({ status: 403, innerText: '<html>403 Forbidden</html>', contentChars: 30 });
    expect(r.hit).not.toBeNull();
    expect(r.confidence).toBe('high');
    expect(r.hit?.matched).toContain('403');
  });

  it('cf-mitigated 头 → high cloudflare（不看正文）', () => {
    const r = assessChallenge({
      status: 403,
      headers: { 'cf-mitigated': 'challenge', 'server': 'cloudflare' },
      innerText: 'Access denied',
      contentChars: 40,
    });
    expect(r.hit?.kind).toBe('cloudflare');
    expect(r.confidence).toBe('high');
  });

  it('412（MCE 实测）→ high', () => {
    const r = assessChallenge({ status: 412, contentChars: 20 });
    expect(r.confidence).toBe('high');
  });

  it('软风控伪放行（200 但内容极短）→ suspicious 且放行', () => {
    const r = assessChallenge({ status: 200, contentChars: 39, innerText: 'ok' });
    expect(r.hit).toBeNull();
    expect(r.suspicious).toBe(true);
  });

  it('reCAPTCHA 挑战控件在可见文本 → high captcha', () => {
    const r = assessChallenge({ status: 200, innerText: 'Are you a robot? Please verify you are human.' });
    expect(r.hit?.kind).toBe('captcha');
    expect(r.confidence).toBe('high');
  });
});

describe('assessChallenge — 兼容与边界', () => {
  it('ssr 通道整页 HTML 命中强文案 → medium（降级，防白名单 JSON 误判）', () => {
    const r = assessChallenge({ status: 200, html: '<div>Just a moment...</div>' + 'x'.repeat(1000) });
    expect(r.hit?.kind).toBe('cloudflare');
    expect(r.confidence).toBe('medium');
  });

  it('空输入 → 放行不误报', () => {
    const r = assessChallenge({});
    expect(r.hit).toBeNull();
    expect(r.confidence).toBe('none');
  });
});
