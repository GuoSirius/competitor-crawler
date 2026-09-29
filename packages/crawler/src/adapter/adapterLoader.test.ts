import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadCodeAdapter, registeredAdapterDomains } from './adapterLoader.js';

describe('loadCodeAdapter（docs/16 🔴-2 接线）', () => {
  it('_example.ts 存在 → 加载出实现全部 4 个钩子的适配器', async () => {
    const adapter = await loadCodeAdapter('_example');
    expect(adapter).not.toBeNull();
    expect(typeof adapter!.preflight).toBe('function');
    expect(typeof adapter!.buildPageUrl).toBe('function');
    expect(typeof adapter!.postParseList).toBe('function');
    expect(typeof adapter!.postParseDetail).toBe('function');
  });

  it('同名重复调用返回缓存实例', async () => {
    const a = await loadCodeAdapter('_example');
    const b = await loadCodeAdapter('_example');
    expect(b).toBe(a);
  });

  it('无适配器文件的域名 → null（纯 YAML 零回归）', async () => {
    const adapter = await loadCodeAdapter('no-such-domain-xyz.example');
    expect(adapter).toBeNull();
  });

  it('elabscience 适配器：实现 preflight（docs/16 C5）', async () => {
    const adapter = await loadCodeAdapter('www.elabscience.cn');
    expect(adapter).not.toBeNull();
    expect(typeof adapter!.preflight).toBe('function');
    // 其余钩子未实现：纯 YAML 解析 + preflight 附加头
    expect(adapter!.postParseList).toBeUndefined();
  });

  it('注册表一致性：adapters/ 下每个适配器文件都必须登记，登记项必须有文件', () => {
    // 防新增适配器忘了在 registry 补行的静默失效
    const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../adapters');
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.ts') && f !== 'types.ts')
      .map((f) => f.replace(/\.ts$/, ''))
      .sort();
    const registered = registeredAdapterDomains();
    expect(registered).toEqual(files);
  });
});
