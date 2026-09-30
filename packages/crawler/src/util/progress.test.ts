import { describe, expect, it } from 'vitest';
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
    // 总数与失败拆分
    expect(ms.buf).toContain('详情 4/4（100%）✓3 ✗1');
    // 完成态 + 失败明细单独成行
    expect(ms.buf).toContain('详情 完成 4/4 ✓3 ✗1');
    expect(ms.buf).toContain('✗ https://x.com/1：HTTP 500');
    expect(failures).toEqual(['https://x.com/1：HTTP 500']);
  });

  it('total=0 时 finish 不除零，pct 按 100 处理', () => {
    const ms = new MemStream();
    const stream = ms as unknown as NodeJS.WriteStream;
    const c = new ProgressCounter(new Progress({ stream }), '空阶段', 0);
    expect(() => c.finish()).not.toThrow();
    expect(ms.buf).toContain('空阶段 完成 0/0');
  });
});
