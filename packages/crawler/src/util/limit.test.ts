import { describe, expect, it, vi, afterEach } from 'vitest';
import os from 'node:os';
import { mapLimit, detailConcurrency } from './limit.js';

describe('mapLimit（docs/16 P5 并发限制）', () => {
  it('结果按输入顺序返回', async () => {
    const out = await mapLimit([3, 1, 2], 3, async (n) => {
      await new Promise((r) => setTimeout(r, n * 5)); // 后到的先完成
      return n * 10;
    });
    expect(out).toEqual([30, 10, 20]);
  });

  it('limit 限制同时在途数量', async () => {
    let active = 0;
    let peak = 0;
    await mapLimit([1, 2, 3, 4, 5, 6, 7, 8], 3, async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
    });
    expect(peak).toBe(3);
  });

  it('limit 非法（0/负数/NaN）→ 串行不失控', async () => {
    let active = 0;
    let peak = 0;
    await mapLimit([1, 2, 3], 0, async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 2));
      active--;
    });
    expect(peak).toBe(1);
    await expect(mapLimit([1, 2], Number.NaN, async (n) => n)).resolves.toEqual([1, 2]);
  });

  it('空输入直接返回空数组', async () => {
    await expect(mapLimit([], 4, async (n) => n)).resolves.toEqual([]);
  });
});

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
