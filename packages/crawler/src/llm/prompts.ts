import fs from 'node:fs';
import path from 'node:path';
import { repoRoot } from '@competitor-crawler/shared';

/**
 * 集中式提示词系统（docs/04 §4.4）：所有模型任务的 system 提示词统一放 `config/prompts/*.md`，
 * 由本加载器读取并做变量注入，确保「单一事实源 + 统一红线 + 可集中调优」。
 *
 * - `_common.md` 是全局公约（防幻觉四件套之①的通用表述），自动前置到每个任务提示词之前；
 * - 任务模板用 `{{VAR}}` 占位，由调用方通过 `vars` 注入（如 extraction 的 TARGET_FIELDS）；
 * - 结果进程内缓存，避免重复读盘；模板为运行期只读，改模板需重启进程（仅开发期影响）。
 */

const PROMPT_DIR = path.join(repoRoot, 'config', 'prompts');
const tplCache = new Map<string, string>();
let commonCache: string | undefined;

function readFileSafe(p: string): string {
  try {
    return fs.readFileSync(p, 'utf-8');
  } catch {
    return '';
  }
}

/** 读取 `_common.md` 全局公约（缺失则空串，不阻塞） */
function commonBlock(): string {
  if (commonCache === undefined) {
    commonCache = readFileSafe(path.join(PROMPT_DIR, '_common.md')).trim();
  }
  return commonCache;
}

/** 纯函数：把 `{{KEY}}` 替换为 vars[KEY]（未提供则空串） */
export function injectVars(tpl: string, vars?: Record<string, string | undefined>): string {
  if (!vars) return tpl;
  return tpl.replace(/\{\{\s*([A-Z0-9_]+)\s*\}\}/g, (_, k: string) => vars[k] ?? '');
}

function loadTemplate(name: string): string {
  const cached = tplCache.get(name);
  if (cached !== undefined) return cached;
  const raw = readFileSafe(path.join(PROMPT_DIR, `${name}.md`));
  tplCache.set(name, raw);
  return raw;
}

/**
 * 取某任务的 system 提示词：全局公约 + 任务模板（已注入变量）。
 * @param name 模板名（对应 `config/prompts/<name>.md`）
 * @param vars `{{KEY}}` 占位变量的实际值
 */
export function loadPrompt(name: string, vars?: Record<string, string | undefined>): string {
  const tpl = injectVars(loadTemplate(name), vars).trim();
  const pre = commonBlock();
  return pre ? `${pre}\n\n${tpl}` : tpl;
}
