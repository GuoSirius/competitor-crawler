import OpenAI from 'openai';
import type { ModelMode } from '@competitor-crawler/shared';
import { loadModelFile, pickEndpoint, resolveModelMode } from './modelFile.js';

/** 消息内容：纯文本，或多模态分片（视觉模型读截图时用，见 docs/04 §4.2.1） */
export type ChatContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'auto' | 'low' | 'high' } };

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ChatContentPart[];
}

/** 具体走哪个模型端点（hybrid 由 chat() 展开为 local→cloud 再依次尝试） */
export type ModelTarget = 'local' | 'cloud';

export interface ModelConfig {
  baseURL: string;
  apiKey: string;
  model: string;
  maxRetries: number;
}

const DEFAULT_BASE_URL: Record<ModelTarget, string> = {
  local: 'http://localhost:11434/v1',
  cloud: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
};

const DEFAULT_MODEL: Record<ModelTarget, string> = {
  local: 'qwen2.5:14b-instruct',
  cloud: 'qwen-plus',
};

/** 读取数值型环境变量，非法/缺省时回退。 */
function numEnv(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * 解析指定端点的模型配置（独立函数，便于单测）。
 *
 * 取值优先级：**`.env` → `config/model.yaml` → 内置默认值**（docs/04 §4.2「二选一，env 优先覆盖」）。
 *
 * ⚠️ 环境变量名以仓库根 `.env.example` 为**唯一约定**（统一 `MODEL_` 前缀）：
 *    MODEL_LOCAL_BASE_URL / MODEL_LOCAL_API_KEY / MODEL_LOCAL_MODEL
 *    MODEL_CLOUD_BASE_URL / MODEL_CLOUD_API_KEY / MODEL_CLOUD_MODEL
 *    MODEL_MODE / MODEL_TEMPERATURE / MODEL_MAX_RETRIES
 *    该约定由 `src/envContract.test.ts` 与 `.env.example` 双向校验。
 *
 *    注意：此处**必须直写 `process.env.XXX`**，不要抽象成 `env` 参数 ——
 *    否则契约测试的静态扫描会看不到这些键，防线等于被绕过（测试单测时会用
 *    `vi.stubEnv` 注入，不影响可测性）。
 */
export function resolveModelConfig(target: ModelTarget): ModelConfig {
  const file = loadModelFile();
  const section = target === 'local' ? file.local : file.cloud;

  const baseURL = pickEndpoint(
    target === 'local' ? process.env.MODEL_LOCAL_BASE_URL : process.env.MODEL_CLOUD_BASE_URL,
    section?.baseURL,
    DEFAULT_BASE_URL[target],
  );
  const apiKey = pickEndpoint(
    target === 'local' ? process.env.MODEL_LOCAL_API_KEY : process.env.MODEL_CLOUD_API_KEY,
    section?.apiKey,
    // 本地端点（Ollama/vLLM）通常不校验 key；云端留空则下方立即报错
    target === 'local' ? 'ollama' : '',
  );
  const model = pickEndpoint(
    target === 'local' ? process.env.MODEL_LOCAL_MODEL : process.env.MODEL_CLOUD_MODEL,
    section?.model,
    DEFAULT_MODEL[target],
  );

  // 云端缺 key 时立即给出可操作的报错，避免发出空 key 换来一个看不懂的 401。
  if (target === 'cloud' && !apiKey) {
    throw new Error('云模型未配置 API Key：请在 .env 设置 MODEL_CLOUD_API_KEY（或将 MODEL_MODE 改为 local）');
  }

  return {
    baseURL,
    apiKey,
    model,
    maxRetries: numEnv(process.env.MODEL_MAX_RETRIES, file.maxRetries ?? 1),
  };
}

/** 解析采样温度；默认 0（防幻觉，配置生成要求确定性可复现）。可被 config/model.yaml 的 temperature 兜底。 */
export function resolveTemperature(): number {
  return numEnv(process.env.MODEL_TEMPERATURE, loadModelFile().temperature ?? 0);
}

/**
 * 模型客户端（复用已装的 openai SDK，兼容 Ollama / vLLM / 通义 / DeepSeek / Claude）。
 * - MODEL_MODE: local | cloud | hybrid（默认 hybrid：本地优先、云端兜底）
 * - temperature 默认 0（防幻觉，配置生成要求稳定可复现）
 */
function clientFor(target: ModelTarget): { client: OpenAI; model: string } {
  const cfg = resolveModelConfig(target);
  return {
    client: new OpenAI({ baseURL: cfg.baseURL, apiKey: cfg.apiKey, maxRetries: cfg.maxRetries }),
    model: cfg.model,
  };
}

/** openai SDK 的入参类型（避免手写一份容易漂移的消息联合类型） */
type ChatParams = Parameters<OpenAI['chat']['completions']['create']>[0];
/** 非流式返回（create 的返回类型是「流式 | 非流式」联合，需显式收窄） */
type ChatResult = OpenAI.Chat.Completions.ChatCompletion;

export async function chat(messages: ChatMessage[], opts: { temp?: number } = {}): Promise<string> {
  const mode: ModelMode = resolveModelMode();
  const temp = opts.temp ?? resolveTemperature();
  const tryModes: ModelTarget[] = mode === 'hybrid' ? ['local', 'cloud'] : [mode];
  let lastErr: unknown;
  for (const m of tryModes) {
    try {
      const { client, model } = clientFor(m);
      const params = { model, messages, temperature: temp, stream: false } as ChatParams;
      const resp = (await client.chat.completions.create(params)) as ChatResult;
      return resp.choices[0]?.message?.content ?? '';
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(`模型调用失败（已尝试 ${tryModes.join(',')}）: ${String(lastErr)}`);
}
