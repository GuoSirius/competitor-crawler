import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 仓库根（`competitor-crawler/`）。
 *
 * ⚠️ 关键修改：旧实现基于 `import.meta.url` 上溯三级，但在 Nuxt/Nitro 把 shared 打包进
 * 服务端产物后，`import.meta.url` 指向打包文件，导致 repoRoot 指错目录 —— 表现为
 * `web:dev` 下 `.env` 与 sqlite 路径都解析到 `packages/web` 下（env 注入显示 (0)、看板查不到数据）。
 *
 * 新实现：从 `process.cwd()` 向上查找含 `pnpm-workspace.yaml` 或 `config/sites` 的目录作为仓库根。
 * 两种上下文都成立：
 *   - 爬虫经 tsx 从仓库根运行：CWD = 仓库根，立即可命中。
 *   - Nuxt/Nitro 从 `packages/web` 启动：CWD = packages/web，上溯两级即到仓库根。
 * 兜底仍保留基于 import.meta.url 的旧写法。
 */
function findRepoRoot(): string {
  let dir = process.cwd();
  for (;;) {
    if (
      fs.existsSync(path.join(dir, 'pnpm-workspace.yaml')) ||
      fs.existsSync(path.join(dir, 'config/sites'))
    ) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // 兜底：原始基于 import.meta.url 的写法（适用于无 sentinel 可达的极端情况）
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
}

export const repoRoot = findRepoRoot();

/** 数据目录（`<repoRoot>/data`）：sqlite、seeds（输入）、exports（输出）都在其下。 */
export const dataDir = path.join(repoRoot, 'data');

/** 报告 / 导出产物的默认输出目录（`<repoRoot>/data/exports`）。调用方负责 mkdir -p。 */
export const exportsDir = path.join(dataDir, 'exports');
