import fs from 'node:fs';
import path from 'node:path';
import yaml from 'yaml';
import { repoRoot, type ModelMode } from '@competitor-crawler/shared';

/**
 * `config/model.yaml` 的读取与解析（docs/04 §4.2）。
 *
 * 设计要点：
 * - **与 `.env` 二选一，`.env` 优先**：两处都能配，改配置不碰代码；
 * - **宽松解析、绝不抛异常**：配置文件写错不该让整轮爬取崩掉，非法值一律忽略并降级到默认值；
 * - 分辨率逻辑拆成**纯函数**（`parseModelFile` / `pickTaskTemperature` / `pickEndpoint`），
 *   便于单测而不依赖磁盘与环境。
 */

/** 单个模型端点（local / cloud 各一份） */
export interface EndpointFileConfig {
  baseURL?: string;
  apiKey?: string;
  model?: string;
}

/** `config/model.yaml` 的宽松结构（字段可缺；非法值被忽略） */
export interface ModelFileConfig {
  mode?: ModelMode;
  local?: EndpointFileConfig;
  cloud?: EndpointFileConfig;
  temperature?: number;
  maxRetries?: number;
  /** 按任务覆写（键 = 任务名：extraction / normalization / attribution / summary） */
  tasks?: Record<string, { temperature?: number; maxRetries?: number }>;
}

const MODES: readonly ModelMode[] = ['local', 'cloud', 'hybrid'];
const MODEL_FILE = path.join(repoRoot, 'config', 'model.yaml');

function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() !== '' ? v : undefined;
}

function asNumber(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : Number.NaN;
  return Number.isFinite(n) ? n : undefined;
}

function asEndpoint(v: unknown): EndpointFileConfig | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  const out: EndpointFileConfig = {};
  const baseURL = asString(o.baseURL);
  const apiKey = asString(o.apiKey);
  const model = asString(o.model);
  if (baseURL) out.baseURL = baseURL;
  if (apiKey) out.apiKey = apiKey;
  if (model) out.model = model;
  return out;
}

/** YAML 解析结果（unknown）→ 宽松结构；任何非法内容都被丢弃而非抛错 */
export function parseModelFile(raw: unknown): ModelFileConfig {
  if (!raw || typeof raw !== 'object') return {};
  const o = raw as Record<string, unknown>;
  const out: ModelFileConfig = {};

  if (MODES.includes(o.mode as ModelMode)) out.mode = o.mode as ModelMode;
  const local = asEndpoint(o.local);
  const cloud = asEndpoint(o.cloud);
  if (local) out.local = local;
  if (cloud) out.cloud = cloud;
  const temperature = asNumber(o.temperature);
  const maxRetries = asNumber(o.maxRetries);
  if (temperature !== undefined) out.temperature = temperature;
  if (maxRetries !== undefined) out.maxRetries = maxRetries;

  if (o.tasks && typeof o.tasks === 'object') {
    const tasks: NonNullable<ModelFileConfig['tasks']> = {};
    for (const [name, rawTask] of Object.entries(o.tasks as Record<string, unknown>)) {
      if (!rawTask || typeof rawTask !== 'object') continue;
      const t = rawTask as Record<string, unknown>;
      const taskTemp = asNumber(t.temperature);
      const taskRetries = asNumber(t.maxRetries);
      if (taskTemp === undefined && taskRetries === undefined) continue;
      tasks[name] = {
        ...(taskTemp !== undefined ? { temperature: taskTemp } : {}),
        ...(taskRetries !== undefined ? { maxRetries: taskRetries } : {}),
      };
    }
    if (Object.keys(tasks).length > 0) out.tasks = tasks;
  }
  return out;
}

let cached: ModelFileConfig | undefined;

/**
 * 读取 `config/model.yaml`（进程内缓存一次）。
 * 文件不存在 / YAML 语法错 / 读取失败 → 返回空配置，交由 `.env` 与内置默认值兜底。
 */
export function loadModelFile(): ModelFileConfig {
  if (cached) return cached;
  try {
    cached = parseModelFile(yaml.parse(fs.readFileSync(MODEL_FILE, 'utf-8')));
  } catch {
    cached = {};
  }
  return cached;
}

/** 展开字符串里的 `${VAR}` 为环境变量值（未设置则空串），避免把 apiKey 明文写进 yaml */
export function interpolateEnv(value: string): string {
  return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, key: string) => process.env[key] ?? '');
}

/**
 * 部署模式：`MODEL_MODE`（.env）优先 → `config/model.yaml` 的 `mode` → `hybrid`。
 * 三种取值 local / cloud / hybrid 的语义见 docs/04 §4.2。
 */
export function resolveModelMode(): ModelMode {
  const env = process.env.MODEL_MODE;
  if (MODES.includes(env as ModelMode)) return env as ModelMode;
  return loadModelFile().mode ?? 'hybrid';
}

/**
 * 取某端点的最终配置：`env`（.env，已做 `${VAR}` 展开的 yaml 值次之）→ `fallback`。
 * 纯函数，便于单测。
 */
export function pickEndpoint(
  envValue: string | undefined,
  fileValue: string | undefined,
  fallback: string,
): string {
  const fromEnv = asString(envValue);
  if (fromEnv) return fromEnv;
  const fromFile = fileValue ? asString(interpolateEnv(fileValue)) : undefined;
  return fromFile ?? fallback;
}

/**
 * 按任务解析温度。
 * 优先级：`MODEL_TEMPERATURE`（显式设置时）＞ `tasks[task].temperature` ＞ 顶层 `temperature` ＞ 0。
 * 纯函数，便于单测。
 */
export function pickTaskTemperature(
  task: string,
  envTemp: string | undefined,
  file: ModelFileConfig,
): number {
  const fromEnv = asNumber(envTemp);
  if (fromEnv !== undefined) return fromEnv;
  const taskTemp = file.tasks?.[task]?.temperature;
  if (taskTemp !== undefined) return taskTemp;
  return file.temperature ?? 0;
}

/** 读磁盘版：`resolveTaskTemperature('extraction')` */
export function resolveTaskTemperature(task: string): number {
  return pickTaskTemperature(task, process.env.MODEL_TEMPERATURE, loadModelFile());
}

/** 清空缓存（仅单测用：需要重新读取改动后的 yaml 时调用） */
export function resetModelFileCache(): void {
  cached = undefined;
}
