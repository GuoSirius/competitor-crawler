import OpenAI from 'openai';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export type ModelMode = 'local' | 'cloud';

export interface ModelConfig {
  baseURL: string;
  apiKey: string;
  model: string;
  maxRetries: number;
}

const DEFAULT_BASE_URL: Record<ModelMode, string> = {
  local: 'http://localhost:11434/v1',
  cloud: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
};

const DEFAULT_MODEL: Record<ModelMode, string> = {
  local: 'qwen2.5:14b-instruct',
  cloud: 'qwen-plus',
};

/** 读取数值型环境变量，非法/缺省时回退。 */
function numEnv(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * 解析指定模式下的模型配置（独立函数，便于单测）。
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
export function resolveModelConfig(mode: ModelMode): ModelConfig {
  const baseURL =
    mode === 'local'
      ? process.env.MODEL_LOCAL_BASE_URL || DEFAULT_BASE_URL.local
      : process.env.MODEL_CLOUD_BASE_URL || DEFAULT_BASE_URL.cloud;
  const apiKey =
    mode === 'local' ? process.env.MODEL_LOCAL_API_KEY || 'ollama' : process.env.MODEL_CLOUD_API_KEY || '';
  const model =
    mode === 'local'
      ? process.env.MODEL_LOCAL_MODEL || DEFAULT_MODEL.local
      : process.env.MODEL_CLOUD_MODEL || DEFAULT_MODEL.cloud;

  // 云端缺 key 时立即给出可操作的报错，避免发出空 key 换来一个看不懂的 401。
  if (mode === 'cloud' && !apiKey) {
    throw new Error('云模型未配置 API Key：请在 .env 设置 MODEL_CLOUD_API_KEY（或将 MODEL_MODE 改为 local）');
  }

  return { baseURL, apiKey, model, maxRetries: numEnv(process.env.MODEL_MAX_RETRIES, 1) };
}

/** 解析采样温度；默认 0（防幻觉，配置生成要求确定性可复现）。 */
export function resolveTemperature(): number {
  return numEnv(process.env.MODEL_TEMPERATURE, 0);
}

/**
 * 模型客户端（复用已装的 openai SDK，兼容 Ollama / vLLM / 通义 / DeepSeek / Claude）。
 * - MODEL_MODE: local | cloud | hybrid（默认 hybrid：本地优先、云端兜底）
 * - 统一 temperature=0（防幻觉，配置生成要求稳定可复现）
 */
function clientFor(mode: ModelMode): { client: OpenAI; model: string } {
  const cfg = resolveModelConfig(mode);
  return {
    client: new OpenAI({ baseURL: cfg.baseURL, apiKey: cfg.apiKey, maxRetries: cfg.maxRetries }),
    model: cfg.model,
  };
}

export async function chat(messages: ChatMessage[], opts: { temp?: number } = {}): Promise<string> {
  const mode = (process.env.MODEL_MODE || 'hybrid') as 'local' | 'cloud' | 'hybrid';
  const temp = opts.temp ?? resolveTemperature();
  const tryModes: ModelMode[] = mode === 'hybrid' ? ['local', 'cloud'] : [mode];
  let lastErr: unknown;
  for (const m of tryModes) {
    try {
      const { client, model } = clientFor(m);
      const resp = await client.chat.completions.create({ model, messages, temperature: temp });
      return resp.choices[0]?.message?.content ?? '';
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(`模型调用失败（已尝试 ${tryModes.join(',')}）: ${String(lastErr)}`);
}
