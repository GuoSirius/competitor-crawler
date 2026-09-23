import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resolveModelConfig, resolveTemperature } from './client.js';

/**
 * 说明：vitest 会把仓库根 `.env` 注入 `process.env`，因此每个用例前先清空这批键，
 * 让断言只依赖用例自身 stub 的值，与跑测机器上的真实配置解耦。
 */
const MODEL_KEYS = [
  'MODEL_MODE',
  'MODEL_LOCAL_BASE_URL',
  'MODEL_LOCAL_API_KEY',
  'MODEL_LOCAL_MODEL',
  'MODEL_CLOUD_BASE_URL',
  'MODEL_CLOUD_API_KEY',
  'MODEL_CLOUD_MODEL',
  'MODEL_TEMPERATURE',
  'MODEL_MAX_RETRIES',
] as const;

beforeEach(() => {
  for (const k of MODEL_KEYS) vi.stubEnv(k, undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('resolveModelConfig - cloud', () => {
  it('读取 MODEL_CLOUD_* 三项', () => {
    vi.stubEnv('MODEL_CLOUD_BASE_URL', 'https://apihub.example.com/v1');
    vi.stubEnv('MODEL_CLOUD_API_KEY', 'sk-test-123');
    vi.stubEnv('MODEL_CLOUD_MODEL', 'agnes-2.5-flash');

    const cfg = resolveModelConfig('cloud');
    expect(cfg.baseURL).toBe('https://apihub.example.com/v1');
    expect(cfg.apiKey).toBe('sk-test-123');
    expect(cfg.model).toBe('agnes-2.5-flash');
  });

  it('回归防护：不再读取 OPENAI_API_KEY（历史缺陷：与 .env 约定不符）', () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-wrong');
    vi.stubEnv('MODEL_CLOUD_API_KEY', 'sk-right');

    expect(resolveModelConfig('cloud').apiKey).toBe('sk-right');
  });

  it('未配置 BASE_URL 时回退官方默认端点', () => {
    vi.stubEnv('MODEL_CLOUD_API_KEY', 'k');
    expect(resolveModelConfig('cloud').baseURL).toBe('https://dashscope.aliyuncs.com/compatible-mode/v1');
  });

  it('云端缺 API Key 时抛出可操作的报错', () => {
    expect(() => resolveModelConfig('cloud')).toThrowError(/MODEL_CLOUD_API_KEY/);
  });
});

describe('resolveModelConfig - local', () => {
  it('读取 MODEL_LOCAL_* 三项', () => {
    vi.stubEnv('MODEL_LOCAL_BASE_URL', 'http://127.0.0.1:8000/v1');
    vi.stubEnv('MODEL_LOCAL_API_KEY', 'vllm');
    vi.stubEnv('MODEL_LOCAL_MODEL', 'my-model');

    const cfg = resolveModelConfig('local');
    expect(cfg.baseURL).toBe('http://127.0.0.1:8000/v1');
    expect(cfg.apiKey).toBe('vllm');
    expect(cfg.model).toBe('my-model');
  });

  it('缺省时用 Ollama 默认值且不报错', () => {
    const cfg = resolveModelConfig('local');
    expect(cfg.baseURL).toBe('http://localhost:11434/v1');
    expect(cfg.apiKey).toBe('ollama');
    expect(cfg.model).toBe('qwen2.5:14b-instruct');
  });
});

describe('resolveModelConfig - 通用参数', () => {
  it('maxRetries 读 MODEL_MAX_RETRIES，缺省为 1', () => {
    vi.stubEnv('MODEL_MAX_RETRIES', '3');
    expect(resolveModelConfig('local').maxRetries).toBe(3);

    vi.stubEnv('MODEL_MAX_RETRIES', undefined);
    expect(resolveModelConfig('local').maxRetries).toBe(1);
  });

  it('maxRetries 非法值回退为 1', () => {
    vi.stubEnv('MODEL_MAX_RETRIES', 'abc');
    expect(resolveModelConfig('local').maxRetries).toBe(1);
  });

  it('temperature 默认 0，可被 MODEL_TEMPERATURE 覆盖，非法值回退 0', () => {
    expect(resolveTemperature()).toBe(0);

    vi.stubEnv('MODEL_TEMPERATURE', '0.7');
    expect(resolveTemperature()).toBe(0.7);

    vi.stubEnv('MODEL_TEMPERATURE', 'x');
    expect(resolveTemperature()).toBe(0);
  });
});
