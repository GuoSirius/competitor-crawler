import { formatBj } from '@competitor-crawler/shared';

/** 与 crawler 内 CrawlSummary 结构对齐（packages/crawler/src/commands/crawl.ts） */
export interface CrawlSummaryLike {
  companies: number;
  categories: number;
  sections: number;
  new: number;
  updated: number;
  delisted: number;
  pricePoints: number;
  failed: number;
  adapterSites: number;
}

export interface CrawlMeta {
  crawlId: number;
  status: string;
  /** 完成时间，Unix 秒 */
  finishedAt: number;
  /** 待处理（open）告警数，供摘要展示 */
  openAlerts: number;
  trigger: string;
}

export type ChannelType = 'wecom' | 'dingtalk' | 'email-webhook';

export interface AlertChannel {
  type: ChannelType;
  url: string;
}

/**
 * 从环境变量加载告警通道（零依赖，纯 fetch 推送）：
 * - ALERT_WECOM_WEBHOOK    企微群机器人 webhook
 * - ALERT_DINGTALK_WEBHOOK 钉钉群机器人 webhook
 * - ALERT_EMAIL_WEBHOOK    邮件网关 webhook（如 Server酱 / 自建邮件 API，POST JSON 即发信）
 * 任意未配置则跳过对应通道，不抛错。
 */
export function loadAlertChannels(): AlertChannel[] {
  const ch: AlertChannel[] = [];
  const wecom = process.env.ALERT_WECOM_WEBHOOK?.trim();
  if (wecom) ch.push({ type: 'wecom', url: wecom });
  const ding = process.env.ALERT_DINGTALK_WEBHOOK?.trim();
  if (ding) ch.push({ type: 'dingtalk', url: ding });
  const email = process.env.ALERT_EMAIL_WEBHOOK?.trim();
  if (email) ch.push({ type: 'email-webhook', url: email });
  return ch;
}

/** 把摘要渲染成 Markdown（企微/钉钉通用） */
export function formatCrawlSummary(s: CrawlSummaryLike, meta: CrawlMeta): string {
  const bj = formatBj(meta.finishedAt);
  const rows: string[] = [
    `| 指标 | 数值 |`,
    `| --- | --- |`,
    `| 公司 | ${s.companies} |`,
    `| 品类 / 栏目 | ${s.categories} / ${s.sections} |`,
    `| 新增 | ${s.new} |`,
    `| 更新 | ${s.updated} |`,
    `| 下架 | ${s.delisted} |`,
    `| 价格点 | ${s.pricePoints} |`,
    `| 失败 | ${s.failed} |`,
    `| 待处理告警 | ${meta.openAlerts} |`,
  ];
  if (s.adapterSites > 0) rows.push(`| 代码适配器站点 | ${s.adapterSites} |`);
  return [
    `### 竞品爬虫运行报告`,
    `> 触发：${meta.trigger} ｜ 状态：${meta.status} ｜ 完成：${bj}`,
    ``,
    ...rows,
  ].join('\n');
}

/** 按通道类型构造 webhook body（企微/邮件网关用 content；钉钉额外要 title） */
function buildWebhookBody(type: ChannelType, text: string): unknown {
  if (type === 'dingtalk') {
    return { msgtype: 'markdown', markdown: { title: '竞品爬虫运行报告', text } };
  }
  return { msgtype: 'markdown', markdown: { content: text } };
}

export interface SendResult {
  ok: boolean;
  error?: string;
}

/**
 * 向单个通道推送（纯 fetch，失败不抛，返回结果供汇总）。
 * fetchImpl 可注入，便于单测 mock。
 */
export async function sendAlert(
  channel: AlertChannel,
  text: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SendResult> {
  try {
    const res = await fetchImpl(channel.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(buildWebhookBody(channel.type, text)),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * 向全部已配置通道推送爬取结果。
 * - 无通道时返回 [] 并打印提示，不抛错（团队未配置 webhook 也不阻塞）。
 * - fetchImpl 可注入，便于单测 mock。
 */
export async function notifyCrawlResult(
  summary: CrawlSummaryLike,
  meta: CrawlMeta,
  fetchImpl: typeof fetch = fetch,
): Promise<Array<{ channel: ChannelType; ok: boolean; error?: string }>> {
  const channels = loadAlertChannels();
  if (channels.length === 0) {
    console.log('[notify] 未配置告警通道（ALERT_*_WEBHOOK），跳过推送');
    return [];
  }
  const text = formatCrawlSummary(summary, meta);
  const out: Array<{ channel: ChannelType; ok: boolean; error?: string }> = [];
  for (const ch of channels) {
    const r = await sendAlert(ch, text, fetchImpl);
    out.push({ channel: ch.type, ...r });
  }
  return out;
}
