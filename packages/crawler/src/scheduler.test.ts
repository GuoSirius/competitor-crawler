import { describe, it, expect } from 'vitest';
import { isScheduleDue, type ScheduleSpec } from './scheduler.js';

const quarter: ScheduleSpec = { months: [1, 4, 7, 10], daysOfMonth: [1], hours: [3], minutes: [0] };

/**
 * 构造「北京时间 wall-clock = 参数」对应的 Date（北京 = UTC+8）。
 * isScheduleDue 按北京口径判定（docs/16 T1），测试用 UTC 显式构造，保证
 * 任何机器时区（本机 GMT+8 / CI UTC）下断言一致。
 */
const bj = (y: number, mo: number, d: number, h: number, mi: number): Date =>
  new Date(Date.UTC(y, mo - 1, d, h - 8, mi));

describe('isScheduleDue · 北京时间口径', () => {
  it('命中季度首月 1 日 03:00（北京）', () => {
    expect(isScheduleDue(quarter, bj(2026, 1, 1, 3, 0))).toBe(true);
    expect(isScheduleDue(quarter, bj(2026, 4, 1, 3, 0))).toBe(true);
    expect(isScheduleDue(quarter, bj(2026, 10, 1, 3, 0))).toBe(true);
  });
  it('非命中时间返回 false', () => {
    expect(isScheduleDue(quarter, bj(2026, 1, 1, 3, 5))).toBe(false); // 分钟不对
    expect(isScheduleDue(quarter, bj(2026, 1, 1, 4, 0))).toBe(false); // 小时不对
    expect(isScheduleDue(quarter, bj(2026, 2, 1, 3, 0))).toBe(false); // 月份不对
    expect(isScheduleDue(quarter, bj(2026, 1, 2, 3, 0))).toBe(false); // 日期不对
  });
  it('空数组表示任意值都命中', () => {
    const every: ScheduleSpec = { months: [], daysOfMonth: [], hours: [], minutes: [] };
    expect(isScheduleDue(every, bj(2026, 6, 15, 12, 30))).toBe(true);
  });
  it('部分维度约束 + 部分放空', () => {
    const daily3am: ScheduleSpec = { months: [], daysOfMonth: [], hours: [3], minutes: [0] };
    expect(isScheduleDue(daily3am, bj(2026, 12, 31, 3, 0))).toBe(true);
    expect(isScheduleDue(daily3am, bj(2026, 12, 31, 3, 1))).toBe(false);
  });
  it('跨时区一致性：北京 03:00 = UTC 前一日 19:00', () => {
    // 同一时刻用两种构造方式，结果必须相同（防止实现退化回「本地时区」口径）
    expect(isScheduleDue(quarter, bj(2026, 1, 1, 3, 0))).toBe(
      isScheduleDue(quarter, new Date('2025-12-31T19:00:00Z')),
    );
  });
});
