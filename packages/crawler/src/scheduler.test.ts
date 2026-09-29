import { describe, it, expect } from 'vitest';
import { isScheduleDue, type ScheduleSpec } from './scheduler.js';

const quarter: ScheduleSpec = { months: [1, 4, 7, 10], daysOfMonth: [1], hours: [3], minutes: [0] };

describe('isScheduleDue', () => {
  it('命中季度首月 1 日 03:00', () => {
    expect(isScheduleDue(quarter, new Date(2026, 0, 1, 3, 0))).toBe(true);
    expect(isScheduleDue(quarter, new Date(2026, 3, 1, 3, 0))).toBe(true);
    expect(isScheduleDue(quarter, new Date(2026, 9, 1, 3, 0))).toBe(true);
  });
  it('非命中时间返回 false', () => {
    expect(isScheduleDue(quarter, new Date(2026, 0, 1, 3, 5))).toBe(false); // 分钟不对
    expect(isScheduleDue(quarter, new Date(2026, 0, 1, 4, 0))).toBe(false); // 小时不对
    expect(isScheduleDue(quarter, new Date(2026, 1, 1, 3, 0))).toBe(false); // 月份不对
    expect(isScheduleDue(quarter, new Date(2026, 0, 2, 3, 0))).toBe(false); // 日期不对
  });
  it('空数组表示任意值都命中', () => {
    const every: ScheduleSpec = { months: [], daysOfMonth: [], hours: [], minutes: [] };
    expect(isScheduleDue(every, new Date(2026, 5, 15, 12, 30))).toBe(true);
  });
  it('部分维度约束 + 部分放空', () => {
    const daily3am: ScheduleSpec = { months: [], daysOfMonth: [], hours: [3], minutes: [0] };
    expect(isScheduleDue(daily3am, new Date(2026, 11, 31, 3, 0))).toBe(true);
    expect(isScheduleDue(daily3am, new Date(2026, 11, 31, 3, 1))).toBe(false);
  });
});
