import OpenAI from 'openai';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

type Mode = 'local' | 'cloud';

/**
 * 模型客户端（复用已装的 openai SDK，兼容 Ollama / vLLM / 通义 / DeepSeek / Claude）。
 * - MODEL_MODE: local | cloud | hybrid（hybrid 先本地、失败回退云端）
 * - 统一 temperature=0（防幻觉，配置生成要求稳定可复现）
 */
function clientFor(mode: Mode): { client: OpenAI; model: string } {
  const baseURL =
    mode === 'local'
      ? process.env.LOCAL_MODEL_BASE_URL || 'http://localhost:11434/v1'
      : process.env.CLOUD_MODEL_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
  const apiKey =
    mode === 'local' ? process.env.LOCAL_MODEL_API_KEY || 'ollama' : process.env.OPENAI_API_KEY || '';
  const model =
    mode === 'local'
      ? process.env.LOCAL_MODEL_NAME || 'qwen2.5:14b-instruct'
      : process.env.CLOUD_MODEL_NAME || 'qwen-plus';
  return { client: new OpenAI({ baseURL, apiKey }), model };
}

export async function chat(messages: ChatMessage[], opts: { temp?: number } = {}): Promise<string> {
  const mode = (process.env.MODEL_MODE || 'local') as 'local' | 'cloud' | 'hybrid';
  const temp = opts.temp ?? 0;
  const tryModes: Mode[] = mode === 'hybrid' ? ['local', 'cloud'] : [mode];
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
