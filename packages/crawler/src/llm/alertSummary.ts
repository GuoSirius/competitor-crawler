import { AlertSummarySchema, extractJsonBlock } from '@competitor-crawler/shared';
import { chat, type ChatMessage } from './client.js';
import { loadPrompt } from './prompts.js';
import { resolveTaskRetries, resolveTaskTemperature } from './modelFile.js';

/**
 * ⑦ 告警摘要（docs/04 §4.4.4）：把结构化告警翻成市场/产品部能读的人话。
 *
 * 设计（与项目「防幻觉四件套」一致：强提示词 + Zod 校验 + temp=0 + 失败重试一次）：
 * - **默认关闭**（MODEL_SUMMARY_ENABLED 不为 true 时零开销、不调模型）；
 * - 模型只做「翻译」，不替人工决策（红线）；
 * - 任何失败 / 关闭 / 无告警 都返回 null，由调用方回退到确定性摘要，绝不阻塞推送。
 */

/** 本任务名（对应 config/model.yaml 的 tasks 键，用于按任务覆写温度 / 重试） */
export const MODEL_SUMMARY_TASK = 'summary';

/** 喂给模型的精简告警项（只传必要字段，降低 token 与隐私面） */
export interface AlertDigestItem {
  type: string;
  severity: string;
  message: string;
}

/** 是否启用模型告警摘要（默认 false，零开销） */
export function isModelSummaryEnabled(): boolean {
  return process.env.MODEL_SUMMARY_ENABLED?.trim() === 'true';
}

// 强约束提示词统一收口到 config/prompts/summary.md（由 loadPrompt 拼装「全局公约 + 任务模板」）
const SYSTEM_PROMPT = loadPrompt('summary');

/** 组装 user 消息：把告警列表摊开成可读文本 */
function buildUserContent(items: AlertDigestItem[]): string {
  const list = items
    .map((a, i) => `${i + 1}. [${a.severity}] ${a.type}: ${a.message}`)
    .join('\n');
  return `本轮共 ${items.length} 条告警：\n${list}\n\n请输出上述 JSON（只含 digest 字段）。`;
}

/**
 * 生成本轮告警的人话摘要。
 * @returns 摘要文本（markdown 友好）；未启用 / 无告警 / 模型失败 均返回 null（调用方回退确定性摘要）
 */
export async function summarizeAlerts(items: AlertDigestItem[]): Promise<string | null> {
  // 默认关闭：不在 .env 显式置 true 就完全不调模型（零开销、零延迟）
  if (!isModelSummaryEnabled()) return null;
  if (items.length === 0) return null;

  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: buildUserContent(items) },
  ];

  const temperature = resolveTaskTemperature(MODEL_SUMMARY_TASK);
  // 「失败重试一次」：MODEL_MAX_RETRIES=1 → 最多 2 次尝试（docs/04 §4.3）
  const maxAttempts = Math.max(1, resolveTaskRetries(MODEL_SUMMARY_TASK) + 1);
  let lastErr = '';

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const raw = await chat(messages, { temp: temperature });
      const parsed = AlertSummarySchema.safeParse(extractJsonBlock(raw));
      if (!parsed.success || !parsed.data.digest) {
        lastErr = parsed.success ? '模型返回空摘要' : '模型输出未通过结构校验';
        continue;
      }
      return parsed.data.digest;
    } catch (e) {
      lastErr = (e as Error).message;
    }
  }

  console.warn(`[alertSummary] 模型摘要生成失败（已重试 ${maxAttempts - 1} 次）：${lastErr}`);
  return null; // 降级：交由调用方回退到确定性摘要
}
