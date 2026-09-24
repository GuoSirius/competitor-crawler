import { describe, expect, it } from 'vitest';
import { formatBj } from './time.js';

describe('formatBj（秒级时间戳 → 北京时间字符串）', () => {
  it('数字入参按 Unix 秒解析（不是毫秒）', () => {
    // epoch 0 = 北京时间 1970-01-01 08:00:00（东八区 +8h）
    expect(formatBj(0)).toBe('1970-01-01 08:00:00');
  });

  it('Date 入参与时区无关地还原为北京时间', () => {
    // UTC 2026-01-01T00:00:00Z = 北京时间 08:00:00
    expect(formatBj(new Date('2026-01-01T00:00:00Z'))).toBe('2026-01-01 08:00:00');
  });

  it('不传参返回当前北京时间格式', () => {
    expect(formatBj()).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });
});
