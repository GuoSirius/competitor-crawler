import { afterEach, describe, expect, it, vi } from 'vitest';
import { Progress, ProgressCounter } from './progress.js';

/** 内存 stream：捕获写入内容供断言（避免测试输出噪音） */
class MemStream {
  public buf = '';
  write(s: string): void {
    this.buf += s;
  }
}

describe('Progress — 单行模式与 writeLine', () => {
  it('update 覆盖同一行（\\r + 清行），done 补换行', () => {
    const ms = new MemStream();
    const stream = ms as unknown as NodeJS.WriteStream;
    const p = new Progress({ stream });
    p.update('a');
    p.update('b');
    p.done('fin');
    expect(ms.buf).toContain('a');
    expect(ms.buf).toContain('b');
    expect(ms.buf.endsWith('fin\n')).toBe(true);
  });

  it('writeLine 在单行模式下先换行再写（进度定格后的明细列表）', () => {
    const ms = new MemStream();
    const stream = ms as unknown as NodeJS.WriteStream;
    const p = new Progress({ stream });
    p.update('x');
    p.writeLine('detail-1');
    expect(ms.buf).toContain('detail-1\n');
  });
});

describe('ProgressCounter — 并发计数进度', () => {
  it('tick 逐条更新 完成数/百分比/速率 与成功失败拆分', () => {
    const ms = new MemStream();
    const stream = ms as unknown as NodeJS.WriteStream;
    const p = new Progress({ stream });
    const c = new ProgressCounter(p, '详情', 4);
    c.tick(true);
    c.tick(true);
    c.tick(false, 'https://x.com/1：HTTP 500');
    c.tick(true);
    const failures = c.finish();
    // 完成数 + 百分比 + 速率（速率可能 <1s 时为 …，故用子串断言）
    expect(ms.buf).toContain('详情 4/4（100%）');
    expect(ms.buf).toContain('✓3 ✗1');
    // 完成态 + 失败明细单独成行
    expect(ms.buf).toContain('详情 完成 4/4 ✓3 ✗1');
    expect(ms.buf).toContain('✗ https://x.com/1：HTTP 500');
    expect(failures).toEqual(['https://x.com/1：HTTP 500']);
  });

  it('total=0 时 finish 不除零，显示「第N页」', () => {
    const ms = new MemStream();
    const stream = ms as unknown as NodeJS.WriteStream;
    const c = new ProgressCounter(new Progress({ stream }), '空阶段', 0);
    expect(() => c.finish()).not.toThrow();
    expect(ms.buf).toContain('空阶段 完成 第0页');
  });
});

describe('ProgressCounter — 页级列表进度（showOutcome:false, liveTime:true）', () => {
  afterEach(() => vi.useRealTimers());

  it('每页 tick 显示页码/累计/用时，finish 定格成独立行', () => {
    const ms = new MemStream();
    const stream = ms as unknown as NodeJS.WriteStream;
    const p = new Progress({ stream });
    // 未知总页数 → total=0 → 显示「第N页」
    const bar = new ProgressCounter(p, '列表', 0, { unit: '页', showOutcome: false, liveTime: true });
    bar.note('翻页 https://x.com/list');
    bar.tick(true, '第1页 +20条 累计20');
    bar.tick(true, '第2页 +18条 累计38');
    const failures = bar.finish('去重60→58 · 详情解析58/58');
    // 实时进度：页码 + 累计 + 用时
    expect(ms.buf).toContain('列表 第1页');
    expect(ms.buf).toContain('第2页 +18条 累计38');
    expect(ms.buf).toContain('用时');
    // 收尾定格行（无 ✓/✗，带用时与摘要）
    expect(ms.buf).toContain('列表 完成 第2页 用时');
    expect(ms.buf).toContain('去重60→58 · 详情解析58/58');
    // 不带成功/失败拆分（页级不计逐项失败）
    expect(ms.buf).not.toContain('✓');
    expect(ms.buf).not.toContain('✗');
    // 无失败明细
    expect(failures).toEqual([]);
  });

  it('耗时≥1s 时显示 页/分 速率', () => {
    vi.useFakeTimers();
    const nowSpy = vi.spyOn(Date, 'now');
    let t = 0;
    nowSpy.mockImplementation(() => t);
    const ms = new MemStream();
    const stream = ms as unknown as NodeJS.WriteStream;
    const p = new Progress({ stream });
    const bar = new ProgressCounter(p, '列表', 0, { unit: '页', showOutcome: false, liveTime: true });
    bar.tick(true, '第1页 +20条'); // t=0 → 速率 …
    t = 2000; // 经过 2s
    bar.tick(true, '第2页 +18条'); // 2页/2s → 60页/分
    expect(ms.buf).toContain('60页/分');
    vi.useRealTimers();
  });

  it('finish 末尾带换行，后续阶段从新行开始（不被覆盖）', () => {
    const ms = new MemStream();
    const stream = ms as unknown as NodeJS.WriteStream;
    const p = new Progress({ stream });
    const bar = new ProgressCounter(p, '列表', 0, { unit: '页', showOutcome: false });
    bar.tick(true, '第1页 +20条');
    bar.finish('去重');
    // 列表进度行末尾是 \n（cursor 移到新行），其后 detail 的更新不会用 \r 顶掉本行
    expect(ms.buf).toMatch(/去重\n/);
    // 模拟详情阶段在下方新行刷新：列表行文本仍完整保留（未被 \r 覆盖），且详情行在其后
    p.update('详情 1/1 …');
    expect(ms.buf).toContain('列表 完成 第1页 用时0秒 · 去重');
    expect(ms.buf).toContain('详情 1/1');
  });
});
