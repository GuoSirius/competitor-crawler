import {
  ModelExtractionSchema,
  extractJsonBlock,
  toNormalizedFields,
  toNumber,
  type ModelDerivedFields,
  type NormalizedProduct,
} from '@competitor-crawler/shared';
import { chat, type ChatContentPart, type ChatMessage } from './client.js';
import { htmlToVisibleText } from './pageText.js';
import { resolveTaskRetries, resolveTaskTemperature } from './modelFile.js';
import { fetchScreenshot } from '../fetch/page.js';
import type { ModelFallbackConfig } from '../config/types.js';

/**
 * 形态 E「前端计算」的**模型兜底适配器**（docs/04 §4.3~§4.4.1、docs/05 §5.3.4/§5.3.5）。
 *
 * 定位（用户明确要求）：模型**不是替代品**，而是「通用兜底」。
 * 所以：
 * - 只有 section 显式写了 `parseDetail.modelFallback` 才会调用，默认零开销；
 * - 模型结果**只补空**，绝不覆盖静态选择器 / 异步接口已抽到的值；
 * - 任一步失败都只降级（不写脏数据、不阻塞整轮），由上层记 `MODEL_FAILURE` 告警。
 *
 * 模型自身的选择完全由配置决定：`MODEL_MODE`（local/cloud/hybrid）+ `config/model.yaml`，
 * 见 `./client.ts` 与 `./modelFile.ts`。本模块只负责「任务契约」：
 * 强提示词 + Zod 校验 + temp=0 + 失败重试一次（防幻觉四件套）。
 */

/** 本任务名（对应 `config/model.yaml` 的 `tasks` 键，用于按任务覆写温度 / 重试） */
export const MODEL_FALLBACK_TASK = 'extraction';

/** 能被提升为 products 顶层**字符串列**的标量字段；其余键只进 `row`，避免把表拍成常空列 */
const STRING_SCALAR_KEYS = new Set([
  'name',
  'englishName',
  'sourceProductId',
  'sku',
  'brand',
  'priceText',
  'specText',
  'description',
  'cloneNumber',
  'detailUrl',
]);

/** 把 `boolean | ModelFallbackConfig | undefined` 归一化为配置对象；未启用返回 null */
export function normalizeModelFallback(
  cfg: boolean | ModelFallbackConfig | undefined,
): ModelFallbackConfig | null {
  if (!cfg) return null; // undefined / false
  if (cfg === true) return { enabled: true };
  if (cfg.enabled === false) return null;
  return cfg;
}

/** 该 section 是否启用模型兜底（probe / crawl 共用同一判据） */
export function isModelFallbackEnabled(cfg: boolean | ModelFallbackConfig | undefined): boolean {
  return normalizeModelFallback(cfg) !== null;
}

/** 强约束提示词（防幻觉四件套之①） */
const SYSTEM_PROMPT = `你是竞品详情页的信息抽取器。用户会给你「页面可见文本」（可能来自多个 Tab 面板，
非激活面板的内容也会一并给出）。请抽取结构化字段，**只输出 JSON 本体**，不要解释、不要 Markdown 围栏。

输出结构（严格遵守）：
{
  "specs": [ { "spec": "规格，如 100μL", "priceNow": "现价", "priceOriginal": "原价", "priceActivity": "活动价", "pricePromo": "优惠价" } ],
  "introMedia": [ { "image": "图片URL", "description": "图片说明" } ],
  "scalars": { "name": "产品名", "sku": "货号", "englishName": "英文名", "brand": "品牌", "priceText": "价格原文", "specText": "规格原文", "description": "纯文本描述" },
  "confidence": 0.0 到 1.0 之间的数字,
  "notes": "一句话说明判断依据"
}

红线（违反即视为失败）：
1. 只抽取文本中【确有出处】的信息。没有的字段填 null 或直接省略，**禁止根据常识补全价格、货号、克隆号**。
2. **禁止为凑数编造数组项**：specs / introMedia 的每一行都必须能在文本里找到依据；一个规格都没有就返回空数组。
3. 价格**照抄原文**（保留币种与单位），不要做单位换算、不要做乘法或任何计算。
4. 文本含多个 Tab 面板时请综合判断；同一规格重复出现只保留一条。
5. 只输出 JSON 本体。`;

export interface ModelFallbackContext {
  detailUrl: string;
  /** 列表页拿到的产品名（仅作参考上下文） */
  name?: string | null;
  /** 已取到的截图；省略且 `cfg.screenshot=true` 时自行用 Playwright 截取（测试可注入以跳过浏览器） */
  image?: Buffer;
}

export interface ModelFallbackOutcome {
  ok: boolean;
  /** 实际补上的字段名（specs / introMedia / 标量名）；未启用时为调用方传入的初值 */
  filled: string[];
  /** 实际尝试次数（1 = 首次成功；>1 表示发生过重试） */
  attempts: number;
  confidence?: number | null;
  notes?: string | null;
  /** 失败原因（ok=false 时） */
  error?: string;
  /** 通过校验的归一化结果 */
  fields?: ModelDerivedFields;
}

/** 组装 user 消息：文本 + 可选截图（多模态） */
function buildUserContent(
  text: string,
  ctx: ModelFallbackContext,
  image?: Buffer,
): string | ChatContentPart[] {
  const head = [
    ctx.name ? `产品名称（来自列表页，仅供参考）：${ctx.name}` : '',
    `详情页 URL：${ctx.detailUrl}`,
    '',
    '===== 页面可见文本 =====',
    text,
  ]
    .filter(Boolean)
    .join('\n');

  if (!image) return head;
  return [
    { type: 'text', text: `${head}\n\n另附该页整页截图，请结合截图核对（图文冲突时以截图为准）。` },
    { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${image.toString('base64')}` } },
  ];
}

/**
 * 调模型抽取结构化结果（含 Zod 校验 + 失败重试）。
 * @returns 成功时 `fields` 为归一化结果；失败时 `ok=false` 且带可读原因
 */
export async function extractWithModel(
  html: string,
  ctx: ModelFallbackContext,
  cfg: ModelFallbackConfig,
): Promise<ModelFallbackOutcome> {
  const text = htmlToVisibleText(html);
  if (!text) return { ok: false, filled: [], attempts: 0, error: '页面无可见文本，跳过模型兜底' };

  // 截图失败不阻塞：降级为纯文本，比整条失败好
  let image = ctx.image;
  if (!image && cfg.screenshot) {
    try {
      image = await fetchScreenshot(ctx.detailUrl);
    } catch {
      image = undefined;
    }
  }

  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: buildUserContent(text, ctx, image) },
  ];

  const temperature = resolveTaskTemperature(MODEL_FALLBACK_TASK);
  // 「失败重试一次」：MODEL_MAX_RETRIES=1 → 最多 2 次尝试（docs/04 §4.3）
  const maxAttempts = Math.max(1, resolveTaskRetries(MODEL_FALLBACK_TASK) + 1);
  let lastErr = '';

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const raw = await chat(messages, { temp: temperature });
      const parsed = ModelExtractionSchema.safeParse(extractJsonBlock(raw));
      if (!parsed.success) {
        const brief = parsed.error.issues
          .slice(0, 2)
          .map((i) => `${i.path.join('.') || '(根)'}: ${i.message}`)
          .join('；');
        lastErr = `模型输出未通过 Zod 校验（${brief}）`;
        continue;
      }
      return {
        ok: true,
        filled: [],
        attempts: attempt,
        confidence: parsed.data.confidence,
        notes: parsed.data.notes,
        fields: toNormalizedFields(parsed.data, cfg.targets),
      };
    } catch (e) {
      lastErr = (e as Error).message;
    }
  }

  return { ok: false, filled: [], attempts: maxAttempts, error: lastErr || '模型调用失败' };
}

/**
 * 把模型结果合并进 `NormalizedProduct`：**只补空**，绝不覆盖已有值。
 * 「模型是兜底不是替代」——静态选择器 / 异步接口取到的值永远优先。
 * @returns 实际补上的字段名
 */
export function mergeModelFields(np: NormalizedProduct, fields: ModelDerivedFields): string[] {
  const filled: string[] = [];

  if (fields.specs && fields.specs.length > 0 && np.specs.length === 0) {
    np.specs = fields.specs;
    filled.push('specs');
  }
  if (fields.introMedia && fields.introMedia.length > 0 && np.introMedia.length === 0) {
    np.introMedia = fields.introMedia;
    filled.push('introMedia');
  }

  const target = np as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(fields.scalars)) {
    const current = target[key];
    if (current != null && current !== '') continue; // 已有值 → 保留静态结果

    if (key === 'price') {
      const n = toNumber(value);
      if (n === null) continue;
      target.price = n;
      np.row.price = n;
      filled.push('price');
      continue;
    }

    if (!STRING_SCALAR_KEYS.has(key)) {
      // 非内置列：只进 row，避免把 products 表拍成十几列常空字段
      if (!(key in np.row)) np.row[key] = value;
      filled.push(key);
      continue;
    }

    target[key] = value;
    np.row[key] = value;
    filled.push(key);
  }

  return filled;
}

/**
 * 一个 section 的完整模型兜底流程：未启用返回 `null`；启用则调模型 + 只补空合并。
 * crawl（落库）与 probe（验证）共用，保证两侧行为一致。
 */
export async function applyModelFallback(
  np: NormalizedProduct,
  html: string,
  ctx: ModelFallbackContext,
  cfg: boolean | ModelFallbackConfig | undefined,
): Promise<ModelFallbackOutcome | null> {
  const conf = normalizeModelFallback(cfg);
  if (!conf) return null;

  const outcome = await extractWithModel(html, ctx, conf);
  if (outcome.ok && outcome.fields) outcome.filled = mergeModelFields(np, outcome.fields);
  return outcome;
}
