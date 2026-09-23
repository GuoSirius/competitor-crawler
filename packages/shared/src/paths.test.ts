import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { repoRoot, dataDir, exportsDir } from './paths.js';

/**
 * 「路径上溯层级」是本项目反复出错的系统性坑（已修 4 处：少退一层导致目录指错，
 * 症状是 probe/crawl 报「无适配器配置」、sqlite 报 directory does not exist）。
 * 这些断言把 repoRoot 的正确性钉住——以后谁改坏了 paths.ts，这里立刻红。
 */
describe('paths（仓库根 / 数据目录集中定义）', () => {
  it('repoRoot 确实落在仓库根，而不是 packages/ 或子包目录', () => {
    expect(fs.existsSync(path.join(repoRoot, 'package.json'))).toBe(true);
    expect(fs.existsSync(path.join(repoRoot, 'pnpm-workspace.yaml'))).toBe(true);
    expect(fs.existsSync(path.join(repoRoot, 'packages'))).toBe(true);
    expect(path.basename(repoRoot)).not.toBe('packages');
    expect(path.basename(repoRoot)).not.toBe('shared');
    expect(path.basename(repoRoot)).not.toBe('src');
  });

  it('dataDir / exportsDir 挂在 repoRoot 下', () => {
    expect(dataDir).toBe(path.join(repoRoot, 'data'));
    expect(exportsDir).toBe(path.join(repoRoot, 'data', 'exports'));
  });

  it('回归：config/sites 与 data/seeds 都能从 repoRoot 定位到', () => {
    expect(fs.existsSync(path.join(repoRoot, 'config', 'sites'))).toBe(true);
    expect(fs.existsSync(path.join(repoRoot, 'data', 'seeds'))).toBe(true);
    expect(fs.existsSync(path.join(repoRoot, 'config', 'sites', '_template.yaml'))).toBe(true);
  });
});
