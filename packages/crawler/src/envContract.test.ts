import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 环境变量契约测试。
 *
 * 背景：`process.env.XXX` 里的变量名是**字符串**，TypeScript 与单测都无法察觉拼写错误，
 * 曾出现「代码读 `OPENAI_API_KEY`，而 .env 里写的是 `MODEL_CLOUD_API_KEY`」这类
 * 跑起来才暴露、且报错信息完全看不出根因的缺陷。
 *
 * 约定：仓库根 `.env.example` 是环境变量的**唯一真相源**。本测试双向校验：
 *   1. 代码读取的每个键 → 必须在 .env.example 中声明（读而未声明 = 命名写错/臆造）；
 *   2. .env.example 声明的每个键 → 必须有代码读取（声明而未读 = 配置闲置/未接线）。
 * 任一不成立即失败，在提交前拦下。
 */

const SELF = 'envContract.test.ts';
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SCAN_DIRS = ['packages', 'scripts'];
const SKIP_DIRS = new Set(['node_modules', '.git', '.nuxt', '.output', 'dist', 'coverage', 'data']);
const SOURCE_EXT = new Set(['.ts', '.mts', '.mjs', '.cjs']);
const ENV_RE = /process\.env\.([A-Za-z_][A-Za-z0-9_]*)/g;
/**
 * 由运行环境 / CI / 终端注入、无需写进 .env.example 的键。
 * - NODE_ENV / CI：运行环境与 CI 平台注入；
 * - NO_COLOR：终端通用的「禁用彩色输出」约定（https://no-color.org/），由用户环境设置，非应用配置。
 */
const EXTERNAL_KEYS = new Set(['NODE_ENV', 'CI', 'NO_COLOR']);

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    let isDir = false;
    try {
      isDir = statSync(full).isDirectory();
    } catch {
      continue;
    }
    if (isDir) walk(full, out);
    else if (SOURCE_EXT.has(extname(name)) && name !== SELF) out.push(full);
  }
  return out;
}

/** 解析 .env.example 中声明（未注释）的键。 */
function declaredKeys(): Set<string> {
  const txt = readFileSync(join(repoRoot, '.env.example'), 'utf8');
  const keys = new Set<string>();
  for (const line of txt.split(/\r?\n/)) {
    const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=/.exec(line);
    if (m) keys.add(m[1]);
  }
  return keys;
}

/**
 * 去掉注释后再扫描：避免**文档注释里的示例**（如 `process.env.XXX`）被误判成真实读取。
 * 块注释用等量空白/newline 替换以保持行号不变；行注释的 `//` 前若是 `:`（http://）则不动。
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/gm, '$1');
}

/** 扫描源码中 `process.env.XXX` 的读取点，返回 键 → 文件:行号 列表。 */
function readKeys(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const file of SCAN_DIRS.flatMap((d) => walk(join(repoRoot, d)))) {
    const lines = stripComments(readFileSync(file, 'utf8')).split(/\r?\n/);
    lines.forEach((line, i) => {
      ENV_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = ENV_RE.exec(line)) !== null) {
        const key = m[1];
        const loc = `${relative(repoRoot, file).replace(/\\/g, '/')}:${i + 1}`;
        found.set(key, [...(found.get(key) ?? []), loc]);
      }
    });
  }
  return found;
}

describe('环境变量契约（.env.example 为唯一真相源）', () => {
  const declared = declaredKeys();
  const read = readKeys();

  it('.env.example 存在且解析出变量', () => {
    expect(declared.size).toBeGreaterThan(0);
  });

  it('代码读取的变量都已在 .env.example 声明（防命名写错 / 臆造）', () => {
    const undeclared = [...read.entries()]
      .filter(([k]) => !declared.has(k) && !EXTERNAL_KEYS.has(k))
      .map(([k, locs]) => `${k}  ← ${locs.join(', ')}`);
    expect(undeclared).toEqual([]);
  });

  it('.env.example 声明的变量都被代码读取（防声明后闲置 / 未接线）', () => {
    const unused = [...declared].filter((k) => !read.has(k));
    expect(unused).toEqual([]);
  });
});
