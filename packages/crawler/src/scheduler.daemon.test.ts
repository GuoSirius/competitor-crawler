import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── scheduler daemon / runScheduledCrawl 集成测试（docs/16 Q3）────────────
// 策略：crawl 命令与 notify 通道 mock 掉（不真爬、不真推送），
// DB 用 testing/testDb 自建的全新空 SQLite，读链路走真实 drizzle 查询。
// 必须在首次 import shared 前建库改 DATABASE_URL → 顶层 await 动态流程。

const { createTestDb } = await import('./testing/testDb.js');
await createTestDb('scheduler-daemon');

// mock：crawl 不真跑；notify 不真推送（vi.mock 会提升到文件顶部，factory 内自建引用）
vi.mock('./commands/crawl.js', () => ({ crawl: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./util/notify.js', () => ({ notifyCrawlResult: vi.fn().mockResolvedValue([]) }));

const { createDb, crawls, nowSeconds } = await import('@competitor-crawler/shared');
const { startDaemon, runScheduledCrawl } = await import('./scheduler.js');
const { crawl } = await import('./commands/crawl.js');
const { notifyCrawlResult } = await import('./util/notify.js');

const { db } = createDb();
const crawlMock = crawl as ReturnType<typeof vi.fn>;
const notifyMock = notifyCrawlResult as ReturnType<typeof vi.fn>;

/** 北京 wall-clock = 参数 的 Date（与 scheduler.test.ts 同一构造口径） */
const bj = (y: number, mo: number, d: number, h: number, mi: number): Date =>
  new Date(Date.UTC(y, mo - 1, d, h - 8, mi));

beforeEach(() => {
  crawlMock.mockClear();
  notifyMock.mockClear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('runScheduledCrawl（真实 SQLite 读链路）', () => {
  it('crawl 以 trigger=schedule 执行；库内无批次时跳过推送', async () => {
    await runScheduledCrawl({ dryRun: true });
    expect(crawlMock).toHaveBeenCalledTimes(1);
    expect(crawlMock.mock.calls[0][0]).toMatchObject({ trigger: 'schedule', dryRun: true });
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('有批次时把 summary + meta 喂给告警通道', async () => {
    const now = nowSeconds();
    await db.insert(crawls).values({
      trigger: 'schedule',
      status: 'success',
      startedAt: now,
      finishedAt: now + 10,
      summary: { companies: 1, new: 2, failed: 0 },
    });
    await runScheduledCrawl();
    expect(notifyMock).toHaveBeenCalledTimes(1);
    const [summary, meta] = notifyMock.mock.calls[0];
    expect(summary).toMatchObject({ companies: 1, new: 2 });
    expect(meta).toMatchObject({ status: 'success', trigger: 'schedule' });
  });
});

describe('startDaemon 守护进程（docs/16 Q3）', () => {
  const everyMinute = { months: [], daysOfMonth: [], hours: [], minutes: [] };
  const only3am = { months: [], daysOfMonth: [], hours: [3], minutes: [0] };

  it('命中分钟立即跑一次；下一分钟再跑；未命中分钟不跑', async () => {
    vi.setSystemTime(bj(2026, 1, 1, 3, 0));
    const stop = startDaemon(everyMinute);
    await vi.advanceTimersByTimeAsync(0); // 冲掉启动 tick 的微任务
    expect(crawlMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(60_000); // 下一分钟 tick
    expect(crawlMock).toHaveBeenCalledTimes(2);

    stop();
    await vi.advanceTimersByTimeAsync(120_000); // 停止后不再跑
    expect(crawlMock).toHaveBeenCalledTimes(2);
  });

  it('规格不命中时不执行', async () => {
    vi.setSystemTime(bj(2026, 6, 15, 12, 30)); // 非 03:00
    const stop = startDaemon(only3am);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(crawlMock).not.toHaveBeenCalled();
    stop();
  });

  it('同一分钟内不重复执行（60s 间隔 + lastKey 去重）', async () => {
    vi.setSystemTime(bj(2026, 1, 1, 3, 0));
    const stop = startDaemon(everyMinute);
    await vi.advanceTimersByTimeAsync(0);
    expect(crawlMock).toHaveBeenCalledTimes(1);
    // 推进 30s（仍在同一分钟）：interval 未到 60s 不会 tick，也不该重复执行
    await vi.advanceTimersByTimeAsync(30_000);
    expect(crawlMock).toHaveBeenCalledTimes(1);
    stop();
  });
});
