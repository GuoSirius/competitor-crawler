import { describe, expect, it } from 'vitest';
import { detectChallenge, maximizeWindow, stealthArgs, stealthInitSource, stealthContextOptions } from './antiBot.js';

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
    // 真实挑战页：reCAPTCHA v2 挑战控件 + 挑战脚本
    expect(detectChallenge('<div class="g-recaptcha" data-sitekey="x"></div><iframe src="https://www.google.com/recaptcha/anchor?ar=1"></iframe>' + 'x'.repeat(300))?.kind).toBe('captcha');
    // 反误报：站点富文本编辑器白名单里出现 .g-recaptcha / [data-sitekey] 属正常页
    expect(detectChallenge('<script id="rtm-style-config" type="application/json">{"allowlist":[".g-recaptcha","[data-sitekey]"]}</script>' + 'x'.repeat(300))).toBeNull();
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

  it('stealthArgs：有头默认带 --start-maximized，可显式关掉；无头不带', () => {
    const f = stealthArgs({ headless: false });
    expect(f).toContain('--start-maximized');
    expect(stealthArgs({ headless: false, maximize: false })).not.toContain('--start-maximized');
    expect(stealthArgs({ headless: true })).not.toContain('--start-maximized');
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
    // 刻意不设 extraHTTPHeaders：Playwright 会把它附加到所有请求（含跨域 XHR），
    // 伪造头触发 CORS preflight 失败 → Algolia 接口渲染站整块空壳（Leinco 实测）。
    // 浏览器原生头（版本与 UA 自洽）永远比伪造的自洽。
    expect('extraHTTPHeaders' in o).toBe(false);
    // 有头默认最大化 → 不覆写 viewport/screen（视口跟随真实窗口，screen 交给真实显示器）
    expect(o.viewport).toBeNull();
    expect(o.screen).toBeUndefined();
  });

  it('contextOptions：无头 / 显式关最大化 → 用配置视口，且 screen 不小于 viewport', () => {
    const headless = stealthContextOptions({}, { headless: true });
    expect(headless.viewport).toEqual({ width: 1920, height: 1080 });
    expect(headless.screen!.width).toBeGreaterThanOrEqual(headless.viewport!.width);
    expect(headless.screen!.height).toBeGreaterThanOrEqual(headless.viewport!.height);
    const noMax = stealthContextOptions({ maximize: false }, { headless: false });
    expect(noMax.viewport).toEqual({ width: 1920, height: 1080 });
  });

  it('maximizeWindow：CDP 不可用（无头/异常）也不抛错', async () => {
    // 造一个最小假 page：newCDPSession 直接抛，验证「最大化失败不影响主流程」
    const fakePage = { context: () => ({ newCDPSession: () => Promise.reject(new Error('no cdp')) }) };
    await expect(maximizeWindow(fakePage as never)).resolves.toBeUndefined();
  });
});
