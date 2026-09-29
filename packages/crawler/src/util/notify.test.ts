import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  formatCrawlSummary,
  sendAlert,
  notifyCrawlResult,
  loadAlertChannels,
  type CrawlSummaryLike,
  type CrawlMeta,
} from './notify.js';

// alertSummary 默认关闭（MODEL_SUMMARY_ENABLED 未置 true），不调模型，保证既有推送链路零回归
vi.mock('../llm/alertSummary.js', () => ({
  summarizeAlerts: vi.fn().mockResolvedValue(null),
  isModelSummaryEnabled: () => false,
}));
import { summarizeAlerts } from '../llm/alertSummary.js';

const summary: CrawlSummaryLike = {
  companies: 2,
  categories: 3,
  sections: 3,
  new: 10,
  updated: 5,
  delisted: 1,
  pricePoints: 12,
  failed: 0,
  adapterSites: 0,
};
const meta: CrawlMeta = {
  crawlId: 1,
  status: 'success',
  finishedAt: 1_700_000_000,
  openAlerts: 2,
  trigger: 'schedule',
};

describe('formatCrawlSummary', () => {
  it('包含关键指标与触发来源', () => {
    const t = formatCrawlSummary(summary, meta);
    expect(t).toContain('竞品爬虫运行报告');
    expect(t).toContain('| 新增 | 10 |');
    expect(t).toContain('| 待处理告警 | 2 |');
    expect(t).toContain('schedule');
  });
  it('启用代码适配器时额外展示该行', () => {
    const t = formatCrawlSummary({ ...summary, adapterSites: 1 }, meta);
    expect(t).toContain('| 代码适配器站点 | 1 |');
  });
});

describe('sendAlert', () => {
  it('wecom 发送正确 body 且返回 ok', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const r = await sendAlert({ type: 'wecom', url: 'https://x' }, 'hello', fetchMock as unknown as typeof fetch);
    expect(r.ok).toBe(true);
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.msgtype).toBe('markdown');
    expect(body.markdown.content).toBe('hello');
  });
  it('dingtalk 含 title 字段', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    await sendAlert({ type: 'dingtalk', url: 'https://x' }, 'hi', fetchMock as unknown as typeof fetch);
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.markdown.title).toBeTruthy();
    expect(body.markdown.text).toBe('hi');
  });
  it('webhook 返回非 2xx 时 ok:false 不抛', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    const r = await sendAlert({ type: 'wecom', url: 'https://x' }, 'x', fetchMock as unknown as typeof fetch);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('HTTP 500');
  });
  it('网络异常时 ok:false 不抛', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network'));
    const r = await sendAlert({ type: 'wecom', url: 'https://x' }, 'x', fetchMock as unknown as typeof fetch);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('network');
  });
});

describe('loadAlertChannels', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });
  it('仅读取已配置通道', () => {
    delete process.env.ALERT_WECOM_WEBHOOK;
    delete process.env.ALERT_DINGTALK_WEBHOOK;
    delete process.env.ALERT_EMAIL_WEBHOOK;
    process.env.ALERT_WECOM_WEBHOOK = ' https://wecom ';
    const ch = loadAlertChannels();
    expect(ch).toHaveLength(1);
    expect(ch[0]).toEqual({ type: 'wecom', url: 'https://wecom' });
  });
});

describe('notifyCrawlResult', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });
  it('无通道时返回空且不抛', async () => {
    delete process.env.ALERT_WECOM_WEBHOOK;
    delete process.env.ALERT_DINGTALK_WEBHOOK;
    delete process.env.ALERT_EMAIL_WEBHOOK;
    const r = await notifyCrawlResult(summary, meta, vi.fn() as unknown as typeof fetch);
    expect(r).toEqual([]);
  });
  it('多通道均发送并汇总结果', async () => {
    delete process.env.ALERT_EMAIL_WEBHOOK;
    process.env.ALERT_WECOM_WEBHOOK = 'https://wecom';
    process.env.ALERT_DINGTALK_WEBHOOK = 'https://ding';
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const r = await notifyCrawlResult(summary, meta, fetchMock as unknown as typeof fetch);
    expect(r).toHaveLength(2);
    expect(r.every((x) => x.ok)).toBe(true);
  });
  it('传入 alerts 时调用摘要生成，且默认摘要关闭时不改变正文', async () => {
    delete process.env.ALERT_EMAIL_WEBHOOK;
    process.env.ALERT_WECOM_WEBHOOK = 'https://wecom';
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    await notifyCrawlResult(
      summary,
      meta,
      fetchMock as unknown as typeof fetch,
      [
        { severity: 'critical', type: 'SITE_UNREACHABLE', message: '斯达特 502' },
        { severity: 'warning', type: 'PRICE_DROP', message: 'A 降价' },
      ],
    );
    // 默认 MODEL_SUMMARY_ENABLED 未开启 → summarizeAlerts 被调但返回 null → 正文仍是确定性摘要
    expect(summarizeAlerts).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.markdown.content).toContain('竞品爬虫运行报告');
    expect(body.markdown.content).not.toContain('本轮告警人话摘要');
  });
});
