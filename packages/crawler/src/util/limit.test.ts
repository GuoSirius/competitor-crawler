import { describe, expect, it, vi, afterEach } from 'vitest';
import os from 'node:os';
import { detailConcurrency } from './limit.js';

describe('detailConcurrency（CRAWL_DETAIL_CONCURRENCY 动态默认）', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('合法正整数 → 直接使用', () => {
    vi.stubEnv('CRAWL_DETAIL_CONCURRENCY', '6');
    expect(detailConcurrency()).toBe(6);
  });

  it('0 / 负数 / 非数字 / 未设 → CPU 核心数', () => {
    for (const v of ['0', '-2', 'abc', '3.5']) {
      vi.stubEnv('CRAWL_DETAIL_CONCURRENCY', v);
      expect(detailConcurrency()).toBe(Math.max(1, os.cpus().length));
    }
    vi.stubEnv('CRAWL_DETAIL_CONCURRENCY', '');
    expect(detailConcurrency()).toBe(Math.max(1, os.cpus().length));
  });
});
