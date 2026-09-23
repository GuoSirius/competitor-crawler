import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 仓库根（`competitor-crawler/`）。
 *
 * 本文件在 `packages/shared/src/` 下 → 上溯 **三级**。
 * ⚠️ 之所以集中在这里导出，是因为「路径上溯层级」在本项目反复出错（已修 4 处：少退一层导致
 * 目录指错）。**新代码一律 import 这里的常量，不要再各自 `path.resolve(__dirname, '..'…)`。**
 *
 * 层级速查（相对各文件所在目录上溯到仓库根）：
 *   packages/shared/src/            → 3 级
 *   packages/<pkg>/src/             → 3 级
 *   packages/<pkg>/src/<子目录>/    → 4 级
 *   packages/<pkg>/                 → 2 级
 */
export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

/** 数据目录（`<repoRoot>/data`）：sqlite、seeds（输入）、exports（输出）都在其下。 */
export const dataDir = path.join(repoRoot, 'data');

/** 报告 / 导出产物的默认输出目录（`<repoRoot>/data/exports`）。调用方负责 mkdir -p。 */
export const exportsDir = path.join(dataDir, 'exports');
