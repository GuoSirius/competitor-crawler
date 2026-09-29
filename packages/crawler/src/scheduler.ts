import { and, count, desc, eq } from 'drizzle-orm';
import { alerts, crawls, createDb, nowSeconds, bjParts, pad2 } from '@competitor-crawler/shared';
import { crawl, type CrawlOpts } from './commands/crawl.js';
import { notifyCrawlResult, type CrawlMeta, type CrawlSummaryLike } from './util/notify.js';
import type { AlertDigestItem } from './llm/alertSummary.js';

type Db = ReturnType<typeof createDb>['db'];

/**
 * 调度规格（零依赖，不引入 cron 包）。
 * 每个字段为空数组表示「该维度任意值都命中」。
 * 例：季度首月 1 日 03:00 → { months:[1,4,7,10], daysOfMonth:[1], hours:[3], minutes:[0] }
 */
export interface ScheduleSpec {
  months: number[]; // 1-12
  daysOfMonth: number[]; // 1-31
  hours: number[]; // 0-23
  minutes: number[]; // 0-59
}

/**
 * 纯函数：给定时间是否命中调度规格。
 * 时间口径固定 **Asia/Shanghai**（统一走 shared/time 的 bjParts，docs/16 T1）：
 * 不依赖部署机时区，CI（UTC）与本机（GMT+8）行为一致。
 */
export function isScheduleDue(spec: ScheduleSpec, d: Date = new Date()): boolean {
  const bj = bjParts(d);
  if (spec.months.length && !spec.months.includes(bj.month)) return false;
  if (spec.daysOfMonth.length && !spec.daysOfMonth.includes(bj.day)) return false;
  if (spec.hours.length && !spec.hours.includes(bj.hour)) return false;
  if (spec.minutes.length && !spec.minutes.includes(bj.minute)) return false;
  return true;
}

/** 取最近一次爬取批次（用于读取 summary + 状态） */
async function getLatestCrawl(db: Db) {
  const rows = await db.select().from(crawls).orderBy(desc(crawls.id)).limit(1);
  return rows[0] ?? null;
}

/**
 * 跑一次「调度爬取」：crawl(trigger=schedule) → 读最新批次 summary → 推送告警通道。
 * 失败隔离：crawl 抛错会向上抛；推送失败仅记日志不阻断。
 */
export async function runScheduledCrawl(opts: CrawlOpts = {}): Promise<void> {
  const { db } = createDb();
  await crawl({ ...opts, trigger: 'schedule' });

  const latest = await getLatestCrawl(db);
  if (!latest) {
    console.log('[schedule] 未找到爬取批次，跳过推送');
    return;
  }
  const summary = (latest.summary ?? {}) as CrawlSummaryLike;
  const [{ value: openAlerts }] = await db
    .select({ value: count() })
    .from(alerts)
    .where(and(eq(alerts.status, 'open')));

  const meta: CrawlMeta = {
    crawlId: latest.id,
    status: latest.status,
    finishedAt: latest.finishedAt ?? nowSeconds(),
    openAlerts,
    trigger: latest.trigger,
  };

  // 取本轮（latest.id）产生的告警，喂给 ⑦ 告警摘要做人话翻译（未启用则自动跳过）
  const thisRound = await db
    .select({ type: alerts.type, severity: alerts.severity, message: alerts.message })
    .from(alerts)
    .where(eq(alerts.crawlId, latest.id))
    .orderBy(desc(alerts.createdAt))
    .limit(50);
  const alertItems: AlertDigestItem[] = thisRound.map((a) => ({
    type: a.type,
    severity: a.severity,
    message: a.message,
  }));

  const results = await notifyCrawlResult(summary, meta, fetch, alertItems);
  for (const r of results) {
    console.log(`[schedule] 告警通道 ${r.channel}: ${r.ok ? '推送成功' : '推送失败 ' + r.error}`);
  }
  if (results.length === 0) {
    console.log('[schedule] 本轮完成，未配置告警通道');
  }
}

/**
 * 守护进程模式：每分钟检查一次是否命中调度规格，命中且本分钟未跑过则执行。
 * 本质与「系统级 cron / Windows 任务计划调 pnpm schedule」等价，提供进程内选项。
 * 返回停止函数。
 */
export function startDaemon(spec: ScheduleSpec, opts: CrawlOpts = {}): () => void {
  let lastKey = '';
  const tick = async () => {
    if (!isScheduleDue(spec)) return;
    // 去重键同样按北京口径（shared/time 统一封装），与 isScheduleDue 判定窗口一致
    const bj = bjParts();
    const key = `${bj.year}-${pad2(bj.month)}-${pad2(bj.day)} ${pad2(bj.hour)}:${pad2(bj.minute)}`;
    if (key === lastKey) return;
    lastKey = key;
    try {
      await runScheduledCrawl(opts);
    } catch (e) {
      console.error('[schedule] 运行失败：', (e as Error).message);
    }
  };
  const timer = setInterval(tick, 60_000);
  void tick();
  return () => clearInterval(timer);
}
