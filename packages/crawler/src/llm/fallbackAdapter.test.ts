import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NormalizedProduct } from '@competitor-crawler/shared';
import {
  applyModelFallback,
  extractWithModel,
  isModelFallbackEnabled,
  mergeModelFields,
  normalizeModelFallback,
} from './fallbackAdapter.js';
import { chat } from './client.js';

vi.mock('./client.js', () => ({ chat: vi.fn() }));
const chatMock = vi.mocked(chat);

/** 造一个「静态抽取什么都没拿到」的归一化产品（形态 E 的典型情形） */
function emptyProduct(): NormalizedProduct {
  return { specs: [], introMedia: [], row: {} };
}

const HTML = `<body><div class="tab-pane active">产品名：胎牛血清</div>
  <div class="tab-pane" hidden><table><tr><td>500mL</td><td>￥1,280</td></tr></table></div></body>`;

beforeEach(() => {
  chatMock.mockReset();
  // 与跑测机器的 .env 解耦：固定「重试一次 / 温度 0」
  vi.stubEnv('MODEL_MAX_RETRIES', '1');
  vi.stubEnv('MODEL_TEMPERATURE', '0');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('normalizeModelFallback / isModelFallbackEnabled', () => {
  it('省略 / false → 未启用（默认不调模型）', () => {
    expect(normalizeModelFallback(undefined)).toBeNull();
    expect(normalizeModelFallback(false)).toBeNull();
    expect(isModelFallbackEnabled(undefined)).toBe(false);
  });

  it('true → { enabled: true }', () => {
    expect(normalizeModelFallback(true)).toEqual({ enabled: true });
  });

  it('配置对象缺 enabled 视为启用；显式 false 则不启用', () => {
    expect(isModelFallbackEnabled({ screenshot: true })).toBe(true);
    expect(isModelFallbackEnabled({ enabled: false })).toBe(false);
  });
});

describe('mergeModelFields — 只补空', () => {
  it('specs 为空时才补；已有静态结果不覆盖', () => {
    const np = emptyProduct();
    expect(mergeModelFields(np, { specs: [{ spec: '500mL', priceNow: '1280' }], scalars: {} })).toContain('specs');
    expect(np.specs).toHaveLength(1);

    const np2: NormalizedProduct = { specs: [{ spec: '静态' }], introMedia: [], row: {} };
    mergeModelFields(np2, { specs: [{ spec: '模型' }], scalars: {} });
    expect(np2.specs[0].spec).toBe('静态');
  });

  it('标量：只补空，已有值保留', () => {
    const np: NormalizedProduct = { specs: [], introMedia: [], row: {}, name: '静态名' };
    const filled = mergeModelFields(np, { scalars: { name: '模型名', sku: 'ZQ1273' } });
    expect(np.name).toBe('静态名');
    expect(np.sku).toBe('ZQ1273');
    expect(filled).toEqual(['sku']);
  });

  it('price 由字符串转数值列；非内置键只进 row', () => {
    const np = emptyProduct();
    mergeModelFields(np, { scalars: { price: '￥1,280.00', 种属: '牛' } });
    expect(np.price).toBe(1280);
    expect(np.row.种属).toBe('牛');
    expect('种属' in np).toBe(false);
  });

  it('price 无法转数值时跳过', () => {
    const np = emptyProduct();
    mergeModelFields(np, { scalars: { price: '面议' } });
    expect(np.price).toBeUndefined();
  });
});

describe('extractWithModel', () => {
  it('成功：解析 JSON → Zod 校验通过 → 归一化字段', async () => {
    chatMock.mockResolvedValue(
      JSON.stringify({
        specs: [{ spec: '500mL', priceNow: '1280' }],
        scalars: { sku: 'ZQ1273' },
        confidence: 0.9,
      }),
    );
    const r = await extractWithModel(HTML, { detailUrl: 'https://x.com/p/1' }, { enabled: true });
    expect(r.ok).toBe(true);
    expect(r.attempts).toBe(1);
    expect(r.confidence).toBe(0.9);
    expect(r.fields?.specs).toHaveLength(1);
    expect(r.fields?.scalars.sku).toBe('ZQ1273');
  });

  it('容忍 ```json 围栏与前后解说', async () => {
    chatMock.mockResolvedValue('好的：\n```json\n{"specs":[{"spec":"1mL"}]}\n```\n以上。');
    const r = await extractWithModel(HTML, { detailUrl: 'https://x.com/p/1' }, { enabled: true });
    expect(r.ok).toBe(true);
    expect(r.fields?.specs).toHaveLength(1);
  });

  it('Zod 校验失败 → 重试一次后成功，attempts=2', async () => {
    chatMock.mockResolvedValueOnce('抱歉，我无法提取。').mockResolvedValueOnce('{"specs":[{"spec":"1mL"}]}');
    const r = await extractWithModel(HTML, { detailUrl: 'https://x.com/p/1' }, { enabled: true });
    expect(chatMock).toHaveBeenCalledTimes(2);
    expect(r.attempts).toBe(2);
    expect(r.ok).toBe(true);
  });

  it('连续失败 → ok=false 且给出可读原因（不写脏数据）', async () => {
    chatMock.mockResolvedValue('不是 JSON');
    const r = await extractWithModel(HTML, { detailUrl: 'https://x.com/p/1' }, { enabled: true });
    expect(r.ok).toBe(false);
    expect(r.attempts).toBe(2);
    expect(r.error).toMatch(/Zod 校验/);
    expect(r.fields).toBeUndefined();
  });

  it('模型调用抛异常（如云端缺 key）→ ok=false 并带原因', async () => {
    chatMock.mockRejectedValue(new Error('云模型未配置 API Key'));
    const r = await extractWithModel(HTML, { detailUrl: 'https://x.com/p/1' }, { enabled: true });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/API Key/);
  });

  it('页面无可见文本 → 直接跳过，不调模型', async () => {
    const r = await extractWithModel('<body><script>var a=1;</script></body>', { detailUrl: 'u' }, { enabled: true });
    expect(r.ok).toBe(false);
    expect(chatMock).not.toHaveBeenCalled();
  });

  it('提供了截图 → 走多模态消息（text + image_url）', async () => {
    chatMock.mockResolvedValue('{"specs":[]}');
    await extractWithModel(HTML, { detailUrl: 'u', image: Buffer.from('fake') }, { enabled: true, screenshot: true });
    const messages = chatMock.mock.calls[0][0];
    const user = messages[1];
    expect(Array.isArray(user.content)).toBe(true);
    const parts = user.content as Array<{ type: string }>;
    expect(parts.map((p) => p.type)).toEqual(['text', 'image_url']);
  });

  it('targets 限定后只产出被要求的目标', async () => {
    chatMock.mockResolvedValue(JSON.stringify({ specs: [{ spec: '1mL' }], scalars: { sku: 'A' } }));
    const r = await extractWithModel(HTML, { detailUrl: 'u' }, { enabled: true, targets: ['specs'] });
    expect(r.fields?.specs).toHaveLength(1);
    expect(r.fields?.scalars).toEqual({});
  });
});

describe('applyModelFallback', () => {
  it('未启用时返回 null 且不调模型', async () => {
    const np = emptyProduct();
    expect(await applyModelFallback(np, HTML, { detailUrl: 'u' }, undefined)).toBeNull();
    expect(chatMock).not.toHaveBeenCalled();
  });

  it('启用时把补上的字段写回 np 并回报 filled', async () => {
    chatMock.mockResolvedValue(
      JSON.stringify({ specs: [{ spec: '500mL', priceNow: '1280' }], scalars: { sku: 'ZQ1273' } }),
    );
    const np = emptyProduct();
    const r = await applyModelFallback(np, HTML, { detailUrl: 'u' }, true);
    expect(r?.ok).toBe(true);
    expect(r?.filled).toEqual(['specs', 'sku']);
    expect(np.specs).toHaveLength(1);
    expect(np.sku).toBe('ZQ1273');
  });
});
