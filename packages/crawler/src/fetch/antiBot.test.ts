import { describe, expect, it } from 'vitest';
import { detectChallenge, stealthArgs, stealthInitSource, stealthContextOptions } from './antiBot.js';

describe('detectChallenge — 挑战页/风控页识别', () => {
  it('Cloudflare "Just a moment" 挑战页', () => {
    const html = '<html><title>Just a moment...</title><body>Checking your browser before accessing.</body></html>';
    expect(detectChallenge(html)?.kind).toBe('cloudflare');
  });

  it('阿里云盾滑块', () => {
    const html = '<div class="nc_wrapper"><span>请完成安全验证后继续访问</span></div>'.repeat(3);
    expect(detectChallenge(html)?.kind).toBe('aliyun');
  });

  it('Imperva（CST 一类）', () => {
    const html = '<html><body>Request unsuccessful. Incapsula incident ID: 123.</body></html>';
    expect(detectChallenge(html)?.kind).toBe('imperva');
  });

  it('reCAPTCHA / hCaptcha', () => {
    expect(detectChallenge('<div class="g-recaptcha" data-sitekey="x"></div>' + 'x'.repeat(300))?.kind).toBe('captcha');
  });

  it('正常页面返回 null', () => {
    const html = `<html><body>${'<div class="product">细胞培养基 500mL ¥298</div>'.repeat(40)}</body></html>`;
    expect(detectChallenge(html)).toBeNull();
  });

  it('过短内容不误判（防截断误报）', () => {
    expect(detectChallenge('<html>403</html>')).toBeNull();
  });
});

describe('stealth 环境构建', () => {
  it('stealthArgs：无头带 --headless=new，有头不带且不出自动化开关', () => {
    const h = stealthArgs({ headless: true });
    const f = stealthArgs({ headless: false });
    expect(h).toContain('--headless=new');
    expect(h).toContain('--disable-blink-features=AutomationControlled');
    expect(f).not.toContain('--headless=new');
    expect(f).toContain('--disable-blink-features=AutomationControlled');
  });

  it('stealthInitSource：webdriver 强制 false（非 undefined），high 档含 Canvas 噪声，none 为空', () => {
    expect(stealthInitSource('mid')).toContain("'webdriver'");
    expect(stealthInitSource('high')).toContain('seedNoise');
    expect(stealthInitSource('none')).toBe('');
  });

  it('contextOptions：时区/语言/平台自洽（中文站 + Windows 桌面）', () => {
    const o = stealthContextOptions();
    expect(o.timezoneId).toBe('Asia/Shanghai');
    expect(o.locale).toBe('zh-CN');
    expect(o.extraHTTPHeaders?.['sec-ch-ua-platform']).toBe('"Windows"');
    // screen 必须不小于 viewport
    expect(o.screen!.width).toBeGreaterThanOrEqual(o.viewport!.width);
    expect(o.screen!.height).toBeGreaterThanOrEqual(o.viewport!.height);
  });
});
