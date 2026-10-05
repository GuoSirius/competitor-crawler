import { describe, expect, it } from 'vitest';
import { assessChallenge } from './challenge.js';
import { isAutoPassableChallenge } from './page.js';

/**
 * 这组用例锁的是一个**真实流程 bug**（2026-10-05 修），不是补覆盖率：
 *
 * 现象：BioLegend 全通道返回 403 + `cf-mitigated: challenge`，脚本却直接判死、
 *      连「等盾自动放行」的重试都没进；而用户自己浏览器能正常打开，双方各执一词。
 * 根因：`assessChallenge` 的**响应头分支优先级最高**，命中时 `matched` 形如
 *      `cf-mitigated: challenge`（不含任何页面文案）；而 `isAutoPassableChallenge`
 *      旧实现只按文案正则判 → 判 false → 整个重试循环被跳过。
 *
 * 修法：头证据（cf-mitigated / cf-chl-*）也算「可自动放行」。
 * 下例把这个因果链完整走一遍：assessChallenge 判出的 hit 必须能进重试循环。
 */
describe('isAutoPassableChallenge —— 托管挑战必须能进重试循环', () => {
  it('响应头 cf-mitigated 命中的 Cloudflare 挑战 → 判可自动放行（回归用例）', () => {
    // 与 diagnose 实测一致：403 + cf-mitigated: challenge + 无文案关键词
    const a = assessChallenge({
      status: 403,
      headers: { 'cf-mitigated': 'challenge' },
      html: '<html><head><title>Error</title></head><body></body></html>',
    });
    expect(a.hit?.kind).toBe('cloudflare');
    // 头分支优先级最高 → matched 是头，不是文案
    expect(a.hit?.matched).toMatch(/cf-mitigated/);
    // 关键断言：不能因为没有文案关键词就判「不可自动放行」
    expect(isAutoPassableChallenge(a.hit!)).toBe(true);
  });

  it('cf-chl-lb / cf-chl-opt 头（挑战负载下发中）→ 判可自动放行', () => {
    for (const h of ['cf-chl-lb', 'cf-chl-opt']) {
      const a = assessChallenge({ status: 403, headers: { [h]: '1' }, html: '<html></html>' });
      expect(a.hit?.kind).toBe('cloudflare');
      expect(isAutoPassableChallenge(a.hit!)).toBe(true);
    }
  });

  it('文案型 CF 挑战（头被剥掉，只剩 Just a moment…）→ 仍判可自动放行', () => {
    const a = assessChallenge({
      status: 503,
      innerText: 'Just a moment... Checking your browser before accessing.',
      html: '<html><title>Just a moment...</title></html>',
    });
    expect(a.hit?.kind).toBe('cloudflare');
    expect(isAutoPassableChallenge(a.hit!)).toBe(true);
  });

  it('交互型挑战（reCAPTCHA / 滑块 / Imperva）→ 判不可自动放行（须走人工过盾）', () => {
    // 交互型与「托管挑战」是两类东西：等自己过没用，必须人点一下
    const a = assessChallenge({
      status: 403,
      innerText: 'Verify you are a human',
      html: '<html>verify you are human</html>',
      domWidget: true,
    });
    expect(a.hit?.kind).toBe('captcha');
    expect(isAutoPassableChallenge(a.hit!)).toBe(false);
  });

  it('阿里云滑块 → 判不可自动放行', () => {
    const a = assessChallenge({
      status: 403,
      innerText: '请完成安全验证 滑动验证',
      html: '<html>请完成安全验证</html>',
    });
    expect(a.hit?.kind).toBe('aliyun');
    expect(isAutoPassableChallenge(a.hit!)).toBe(false);
  });
});
