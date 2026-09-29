import { describe, it, expect, vi, afterEach } from 'vitest';

// 把 chat() 替换成可控 mock（不真调模型）
vi.mock('./client.js', () => ({
  chat: vi.fn(),
}));
// modelFile 走真实逻辑（读 process.env / config/model.yaml），无需 mock
import { chat } from './client.js';
import { summarizeAlerts, isModelSummaryEnabled, type AlertDigestItem } from './alertSummary.js';

const items: AlertDigestItem[] = [
  { severity: 'critical', type: 'SITE_UNREACHABLE', message: '斯达特官网 502' },
  { severity: 'warning', type: 'PRICE_DROP', message: 'A 产品降价 10%' },
];

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
  vi.mocked(chat).mockReset();
});

describe('isModelSummaryEnabled', () => {
  it('默认关闭', () => {
    delete process.env.MODEL_SUMMARY_ENABLED;
    expect(isModelSummaryEnabled()).toBe(false);
  });
  it('仅 true 开启', () => {
    process.env.MODEL_SUMMARY_ENABLED = 'true';
    expect(isModelSummaryEnabled()).toBe(true);
    process.env.MODEL_SUMMARY_ENABLED = 'false';
    expect(isModelSummaryEnabled()).toBe(false);
    process.env.MODEL_SUMMARY_ENABLED = '1';
    expect(isModelSummaryEnabled()).toBe(false);
  });
});

describe('summarizeAlerts', () => {
  it('未启用时返回 null 且不调模型（零开销）', async () => {
    delete process.env.MODEL_SUMMARY_ENABLED;
    const r = await summarizeAlerts(items);
    expect(r).toBeNull();
    expect(chat).not.toHaveBeenCalled();
  });

  it('启用但无告警时返回 null 且不调模型', async () => {
    process.env.MODEL_SUMMARY_ENABLED = 'true';
    const r = await summarizeAlerts([]);
    expect(r).toBeNull();
    expect(chat).not.toHaveBeenCalled();
  });

  it('模型返回合法 JSON 时返回 digest', async () => {
    process.env.MODEL_SUMMARY_ENABLED = 'true';
    vi.mocked(chat).mockResolvedValue('```json\n{"digest":"本轮 1 条 critical：斯达特官网 502，建议排查源站。"}\n```');
    const r = await summarizeAlerts(items);
    expect(r).toContain('斯达特官网 502');
    expect(chat).toHaveBeenCalledTimes(1);
  });

  it('模型连续失败（含重试一次）后降级返回 null', async () => {
    process.env.MODEL_SUMMARY_ENABLED = 'true';
    vi.mocked(chat).mockResolvedValue('不是 JSON');
    const r = await summarizeAlerts(items);
    expect(r).toBeNull();
    // MODEL_MAX_RETRIES=1 → 首次 + 重试共 2 次
    expect(chat).toHaveBeenCalledTimes(2);
  });

  it('模型抛错时降级返回 null', async () => {
    process.env.MODEL_SUMMARY_ENABLED = 'true';
    vi.mocked(chat).mockRejectedValue(new Error('network'));
    const r = await summarizeAlerts(items);
    expect(r).toBeNull();
    expect(chat).toHaveBeenCalledTimes(2);
  });
});
