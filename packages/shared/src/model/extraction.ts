import { z } from 'zod';
import type { IntroMedia, SpecItem } from '../types.js';

/**
 * 模型兜底提取的**输出契约**（docs/04 §4.3 防幻觉四件套之②：Zod 校验）。
 *
 * 放在 `shared` 的原因：`zod` 是本包的依赖（crawler/web 未单独声明），
 * 且该契约要跨「模型层 / crawler / 以后的可视化回填工具」共用——单一事实源。
 *
 * 设计取向：**对模型宽容、对本方严格**。
 * - 模型常把数字写成字符串（"1280"）、把缺失写成 "" 或漏字段 → 输入侧全部兜住；
 * - 输出侧一律归成我方可直接入库的形状（`SpecItem[]` / `IntroMedia[]` + 标量串）。
 */

/** 宽容字符串：接受 string/number/boolean，空串与 null/undefined 归为 null */
const looseString = z
  .union([z.string(), z.number(), z.boolean()])
  .nullish()
  .transform((v) => (v == null || v === '' ? null : String(v)));

/** 宽容置信度：接受 "0.9"，非法值归 null；越界钳到 [0,1] */
const looseConfidence = z
  .union([z.number(), z.string()])
  .nullish()
  .transform((v) => {
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : null;
  });

export const ModelSpecItemSchema = z.object({
  spec: looseString,
  priceNow: looseString,
  priceOriginal: looseString,
  priceActivity: looseString,
  pricePromo: looseString,
});

export const ModelIntroMediaSchema = z.object({
  image: looseString,
  description: looseString,
});

export const ModelExtractionSchema = z.object({
  /** 规格 × 多价格（形态 A~E 都归一到这里） */
  specs: z.array(ModelSpecItemSchema).nullish().transform((v) => v ?? []),
  /** 图文介绍 */
  introMedia: z.array(ModelIntroMediaSchema).nullish().transform((v) => v ?? []),
  /** 其他标量字段（name / sku / brand / description…），键名用我方内置字段名 */
  scalars: z
    .record(z.string(), looseString)
    .nullish()
    .transform((v) => v ?? {}),
  /** 模型自评置信度（0~1）；仅用于告警分级，不参与落库 */
  confidence: looseConfidence,
  /** 模型对判定的说明（不落库，仅日志/告警 payload） */
  notes: looseString,
});

export type ModelExtraction = z.infer<typeof ModelExtractionSchema>;
export type ModelSpecItem = z.infer<typeof ModelSpecItemSchema>;
export type ModelIntroMedia = z.infer<typeof ModelIntroMediaSchema>;

/** 尝试 JSON.parse，失败返回 undefined（区分「解析出 null」与「解析失败」） */
function tryParse(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * 从模型返回文本里抠出 JSON。
 * 容忍三种常见形态：```json 围栏、``` 围栏、以及夹在解说文字中的裸 JSON。
 * @returns 解析结果；失败返回 null（调用方据此判失败，勿静默放过）
 */
export function extractJsonBlock(text: string | null | undefined): unknown {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced ? fenced[1] : text).trim();
  if (!body) return null;

  const direct = tryParse(body);
  if (direct !== undefined) return direct;

  // 兜底：截取第一个 { / [ 到最后一个 } / ] 之间的片段（模型常在 JSON 前后加"好的，结果如下："）
  const start = body.search(/[[{]/);
  if (start < 0) return null;
  const end = Math.max(body.lastIndexOf('}'), body.lastIndexOf(']'));
  if (end <= start) return null;
  const sliced = tryParse(body.slice(start, end + 1));
  return sliced ?? null;
}

/** `toNormalizedFields` 的产出：只含「非空」字段，便于调用方按「仅补空」合并 */
export interface ModelDerivedFields {
  specs?: SpecItem[];
  introMedia?: IntroMedia[];
  /** 标量字段（键名已被模型归一为内置字段名） */
  scalars: Record<string, string>;
}

/** 一个规格项是否含有效信息（全是 null 的项是模型凑数的噪声） */
function specHasValue(s: ModelSpecItem): boolean {
  return Boolean(s.spec || s.priceNow || s.priceOriginal || s.priceActivity || s.pricePromo);
}

/** 一条图文是否含有效信息 */
function mediaHasValue(m: ModelIntroMedia): boolean {
  return Boolean(m.image || m.description);
}

/**
 * 校验后的模型输出 → 我方可直接使用的字段。
 * - 丢弃全空项（防「为凑数编造数组项」，见 docs/04 §4.4.1 红线）；
 * - `targets` 可限定只取其中几项（`specs` / `introMedia` / 标量字段名）；省略则全取。
 */
export function toNormalizedFields(e: ModelExtraction, targets?: string[]): ModelDerivedFields {
  const want = targets && targets.length > 0 ? new Set(targets) : null;
  const out: ModelDerivedFields = { scalars: {} };

  if (!want || want.has('specs')) {
    const specs: SpecItem[] = e.specs
      .filter(specHasValue)
      .map(({ spec, priceNow, priceOriginal, priceActivity, pricePromo }) => ({
        spec,
        priceNow,
        priceOriginal,
        priceActivity,
        pricePromo,
      }));
    if (specs.length > 0) out.specs = specs;
  }

  if (!want || want.has('introMedia')) {
    const media: IntroMedia[] = e.introMedia
      .filter(mediaHasValue)
      .map(({ image, description }) => ({ image, description }));
    if (media.length > 0) out.introMedia = media;
  }

  for (const [k, v] of Object.entries(e.scalars)) {
    if (v == null || v === '') continue;
    if (want && !want.has(k)) continue;
    out.scalars[k] = v;
  }

  return out;
}
