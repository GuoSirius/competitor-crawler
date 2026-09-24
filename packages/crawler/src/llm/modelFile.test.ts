import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  parseModelFile,
  pickEndpoint,
  pickTaskTemperature,
  pickTaskRetries,
  interpolateEnv,
  resolveModelMode,
  loadModelFile,
  resetModelFileCache,
} from './modelFile.js';

/** vitest 会把仓库根 .env 注入 process.env，用例前先清掉这批键，与跑测机器解耦 */
const MODEL_KEYS = ['MODEL_MODE', 'MODEL_TEMPERATURE', 'MODEL_MAX_RETRIES'] as const;

beforeEach(() => {
  resetModelFileCache();
  for (const k of MODEL_KEYS) vi.stubEnv(k, undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('parseModelFile', () => {
  it('解析 mode / 端点 / 通用温度 / 任务覆写', () => {
    const cfg = parseModelFile({
      mode: 'cloud',
      local: { baseURL: 'http://127.0.0.1:8000/v1', apiKey: 'vllm', model: 'm1' },
      cloud: { baseURL: 'https://x/v1', apiKey: '${MODEL_CLOUD_API_KEY}', model: 'qwen-max' },
      temperature: 0,
      maxRetries: 2,
      tasks: { extraction: { temperature: 0 }, summary: { temperature: 0.3 } },
    });
    expect(cfg.mode).toBe('cloud');
    expect(cfg.local?.model).toBe('m1');
    expect(cfg.cloud?.model).toBe('qwen-max');
    expect(cfg.maxRetries).toBe(2);
    expect(cfg.tasks?.summary?.temperature).toBe(0.3);
  });

  it('非法值一律忽略（配置写错不抛异常）', () => {
    const cfg = parseModelFile({
      mode: 'weird',
      temperature: 'abc',
      maxRetries: null,
      local: 'not-an-object',
      tasks: { extraction: {} },
    });
    expect(cfg.mode).toBeUndefined();
    expect(cfg.temperature).toBeUndefined();
    expect(cfg.maxRetries).toBeUndefined();
    expect(cfg.local).toBeUndefined();
    expect(cfg.tasks).toBeUndefined();
  });

  it('非对象输入返回空配置', () => {
    expect(parseModelFile(null)).toEqual({});
    expect(parseModelFile('hello')).toEqual({});
    expect(parseModelFile([])).toEqual({});
  });

  it('数字字符串可解析为数值（yaml 里写 "0.3" 也认）', () => {
    expect(parseModelFile({ temperature: '0.3' }).temperature).toBe(0.3);
  });
});

describe('pickEndpoint', () => {
  it('.env 优先于 config/model.yaml', () => {
    expect(pickEndpoint('https://env/v1', 'https://file/v1', 'https://fallback')).toBe('https://env/v1');
  });

  it('.env 为空串时用文件值', () => {
    expect(pickEndpoint('', 'https://file/v1', 'https://fallback')).toBe('https://file/v1');
  });

  it('文件值是 ${VAR} 时展开环境变量', () => {
    vi.stubEnv('MODEL_CLOUD_API_KEY', 'sk-from-env');
    expect(pickEndpoint(undefined, '${MODEL_CLOUD_API_KEY}', '')).toBe('sk-from-env');
  });

  it('${VAR} 未设置时展开为空串、视同未配置，回退内置默认值', () => {
    // 用真实环境必然不存在的变量名（.env 里的 MODEL_CLOUD_API_KEY 会被 vitest 注入）
    expect(pickEndpoint(undefined, '${__UNSET_TEST_KEY__}', 'ollama')).toBe('ollama');
  });

  it('两处都没有时用内置默认值', () => {
    expect(pickEndpoint(undefined, undefined, 'https://fallback')).toBe('https://fallback');
  });
});

describe('interpolateEnv', () => {
  it('替换已设置变量，未设置的替换为空串', () => {
    vi.stubEnv('A_KEY', 'aaa');
    expect(interpolateEnv('x-${A_KEY}-y')).toBe('x-aaa-y');
    expect(interpolateEnv('x-${NOPE}-y')).toBe('x--y');
  });

  it('无占位符时原样返回', () => {
    expect(interpolateEnv('plain')).toBe('plain');
  });
});

describe('pickTaskTemperature', () => {
  const file = parseModelFile({ temperature: 0.2, tasks: { extraction: { temperature: 0 }, summary: { temperature: 0.3 } } });

  it('MODEL_TEMPERATURE（显式设置）优先于按任务覆写', () => {
    expect(pickTaskTemperature('extraction', '0.7', file)).toBe(0.7);
  });

  it('未设 env 时用 tasks[task].temperature', () => {
    expect(pickTaskTemperature('extraction', undefined, file)).toBe(0);
    expect(pickTaskTemperature('summary', undefined, file)).toBe(0.3);
  });

  it('任务未覆写时用顶层 temperature', () => {
    expect(pickTaskTemperature('attribution', undefined, file)).toBe(0.2);
  });

  it('全都缺省时为 0', () => {
    expect(pickTaskTemperature('attribution', undefined, {})).toBe(0);
  });

  it('env 非法值时忽略，继续走文件优先级', () => {
    expect(pickTaskTemperature('summary', 'abc', file)).toBe(0.3);
  });
});

describe('pickTaskRetries', () => {
  const file = parseModelFile({ maxRetries: 2, tasks: { extraction: { maxRetries: 0 } } });

  it('env 优先于按任务覆写', () => {
    expect(pickTaskRetries('extraction', '3', file)).toBe(3);
  });

  it('未设 env 时用 tasks[task].maxRetries（0 表示不重试）', () => {
    expect(pickTaskRetries('extraction', undefined, file)).toBe(0);
  });

  it('任务未覆写时用顶层 maxRetries', () => {
    expect(pickTaskRetries('summary', undefined, file)).toBe(2);
  });

  it('全都缺省时为 1（失败重试一次）', () => {
    expect(pickTaskRetries('summary', undefined, {})).toBe(1);
  });
});

describe('resolveModelMode', () => {
  it('.env 的 MODEL_MODE 优先', () => {
    vi.stubEnv('MODEL_MODE', 'local');
    expect(resolveModelMode()).toBe('local');
  });

  it('env 非法/未设时回退 config/model.yaml 的 mode', () => {
    vi.stubEnv('MODEL_MODE', 'nonsense');
    const expected = loadModelFile().mode ?? 'hybrid';
    expect(resolveModelMode()).toBe(expected);
  });
});

describe('loadModelFile', () => {
  it('读取仓库真实 config/model.yaml 并进程内缓存同一对象', () => {
    const a = loadModelFile();
    const b = loadModelFile();
    expect(a).toBe(b);
    expect(['local', 'cloud', 'hybrid']).toContain(a.mode);
  });

  it('resetModelFileCache 后重新读取', () => {
    const a = loadModelFile();
    resetModelFileCache();
    expect(loadModelFile()).not.toBe(a);
    expect(loadModelFile()).toEqual(a);
  });
});
