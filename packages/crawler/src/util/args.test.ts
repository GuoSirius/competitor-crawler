import { describe, expect, it } from 'vitest';
import { parseFlags, normalizeAliases, FLAG_ALIASES } from './args.js';

describe('parseFlags', () => {
  it('--key value 与 --flag 布尔', () => {
    expect(parseFlags(['--domain', 'a.com', '--dry-run'])).toEqual({ domain: 'a.com', 'dry-run': true });
    // 下一个以 -- 开头 → 该 flag 视为布尔，值不吞
    expect(parseFlags(['--dry-run', '--domain', 'a.com'])).toEqual({ 'dry-run': true, domain: 'a.com' });
  });

  // --no- 前缀（2026-10-05 补）：此前会被记成 key='no-fingerprint'，命令侧读不到，
  // 导致 `pnpm diagnose --no-fingerprint` 照样开窗跑指纹体检。
  it('--no-<flag> 翻成布尔 false（默认开、可关的开关）', () => {
    expect(parseFlags(['--no-fingerprint'])).toEqual({ fingerprint: false });
    expect(parseFlags(['--domain', 'a.com', '--no-fingerprint', '--json'])).toEqual({
      domain: 'a.com',
      fingerprint: false,
      json: true,
    });
  });

  it('--no-<flag> 后面跟值时不吞值（仍按 key=value 解析）', () => {
    // `--no-fingerprint true` 语义上矛盾，但不应把 true 丢掉、也不该串到别的 flag
    expect(parseFlags(['--no-fingerprint', 'true'])).toEqual({ fingerprint: 'true' });
  });

  it('无 -- 前缀的参数被忽略（不产生垃圾 key）', () => {
    expect(parseFlags(['diagnose', '--json'])).toEqual({ json: true });
  });
});

describe('normalizeAliases — 参数统一（旧名全部保留，零破坏）', () => {
  it('站点参数：--site 归一到 --domain（旧名 site 保留可读）', () => {
    const f = normalizeAliases(parseFlags(['--site', 'a.com']));
    expect(f.domain).toBe('a.com');
    expect(f.site).toBe('a.com'); // 旧名没被删，老脚本照样能读
    expect(normalizeAliases(parseFlags(['--domain', 'a.com'])).domain).toBe('a.com');
  });

  it('数量护栏：--pages 归一到 --max-pages（与「页码起点」--page-start 区分）', () => {
    expect(normalizeAliases(parseFlags(['--pages', '10']))['max-pages']).toBe('10');
    expect(normalizeAliases(parseFlags(['--max-pages', '10']))['max-pages']).toBe('10');
    // 页码起点不受影响
    expect(normalizeAliases(parseFlags(['--page-start', '10']))['page-start']).toBe('10');
  });

  it('页内切片：--offset/--per-page 归一到 --page-offset/--page-size', () => {
    const f = normalizeAliases(parseFlags(['--offset', '5', '--per-page', '20']));
    expect(f['page-offset']).toBe('5');
    expect(f['page-size']).toBe('20');
  });

  it('规范名显式给出时优先，不被旧名覆盖；幂等', () => {
    const f = normalizeAliases(parseFlags(['--domain', 'new.com', '--site', 'old.com']));
    expect(f.domain).toBe('new.com');
    const once = normalizeAliases(parseFlags(['--site', 'a.com']));
    expect(normalizeAliases(once).domain).toBe('a.com');
  });

  it('FLAG_ALIASES 只做别名、不丢原键（旧名仍可读）', () => {
    const f = normalizeAliases(parseFlags(['--site', 'a.com', '--pages', '3']));
    expect(f.site).toBe('a.com'); // 旧名没被删
    expect(f.pages).toBe('3');
    expect(f.domain).toBe('a.com');
    expect(f['max-pages']).toBe('3');
    expect(Object.keys(FLAG_ALIASES).sort()).toEqual(['domain', 'max-pages', 'page-offset', 'page-size']);
  });
});
