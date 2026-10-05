import { describe, expect, it } from 'vitest';
import { ChallengeError } from '../fetch/page.js';
import { adviseFetchFailure } from './fetchAdvice.js';

/**
 * 失败提示口径的统一契约：任何入口（probe / crawl / sweep）拿到同一类错误，
 * 给的建议都必须指向同一条路径（否则排查线索会各走各的）。
 */
describe('adviseFetchFailure', () => {
  it('挑战页 → 指向反爬归因（diagnose），而不是「选择器写错了」', () => {
    const lines = adviseFetchFailure(new ChallengeError('cloudflare', 'https://x.com/', 'cf-mitigated: challenge'), 'x.com');
    expect(lines.join('\n')).toContain('pnpm diagnose --domain x.com');
    // 关键：必须说清「不是选择器问题」，避免往 parseList 方向白查
    expect(lines.join('\n')).toContain('不是选择器写错');
  });

  it('WAF 封禁页 → 指出换出口 IP（改指纹无效）', () => {
    const lines = adviseFetchFailure(new ChallengeError('cloudflare', 'https://x.com/', 'attention required'), 'x.com');
    expect(lines.join('\n')).toContain('换出口 IP');
  });

  it('网络层错误 → 判成网络问题，不得建议调指纹/过盾', () => {
    const lines = adviseFetchFailure(new Error('fetch failed: https://immocell.com/'), 'immocell.com');
    const joined = lines.join('\n');
    expect(joined).toContain('网络层');
    expect(joined).not.toContain('过盾');
  });

  it('其它错误 → 给可执行的重试命令', () => {
    const lines = adviseFetchFailure(new Error('waitSelector 未出现（.x，等满 30000ms）'), 'y.com');
    expect(lines.join('\n')).toContain('pnpm probe --domain y.com --render browser');
  });
});
