import { describe, it, expect } from 'vitest';
import { dedupeListItems, uniqueBy } from './listDedupe.js';
import type { ListItem } from '@competitor-crawler/shared';

const item = (detailUrl: string, name?: string): ListItem => ({ detailUrl, name });

describe('uniqueBy', () => {
  it('按 key 保留首个，顺序不变', () => {
    const out = uniqueBy([{ k: 'a', v: 1 }, { k: 'b', v: 2 }, { k: 'a', v: 3 }], (x) => x.k);
    expect(out).toEqual([{ k: 'a', v: 1 }, { k: 'b', v: 2 }]);
  });

  it('空数组 → 空数组', () => {
    expect(uniqueBy([], (x: string) => x)).toEqual([]);
  });

  it('key 全相同 → 只剩一个', () => {
    expect(uniqueBy(['x', 'x', 'x'], (s) => s)).toEqual(['x']);
  });
});

describe('dedupeListItems（列表重复链接去重）', () => {
  it('同一详情链接出现两次 → 只留一条，duplicates=1', () => {
    const r = dedupeListItems([
      item('https://x.com/p/1', '产品1'),
      item('https://x.com/p/2', '产品2'),
      item('https://x.com/p/1', '产品1'),
    ]);
    expect(r.items.map((i) => i.detailUrl)).toEqual(['https://x.com/p/1', 'https://x.com/p/2']);
    expect(r.duplicates).toBe(1);
  });

  it('canonical 等价的链接视为同一条（末尾 /、大小写、utm 追踪参数）', () => {
    const r = dedupeListItems([
      item('https://X.com/p/1/?utm_source=home'),
      item('https://x.com/p/1'),
    ]);
    expect(r.items).toHaveLength(1);
    expect(r.duplicates).toBe(1);
  });

  it('不同产品（含不同 query）不去重', () => {
    const r = dedupeListItems([
      item('https://x.com/Products/info.aspx?itemid=682'),
      item('https://x.com/Products/info.aspx?itemid=683'),
    ]);
    expect(r.items).toHaveLength(2);
    expect(r.duplicates).toBe(0);
  });

  it('pc/web 双套模板：16 条锚点 / 8 个真实产品 → 8 条（真实站点形态复现）', () => {
    const eight = Array.from({ length: 8 }, (_, i) => `https://x.com/Products/info.aspx?itemid=${100 + i}`);
    const r = dedupeListItems([...eight.map((u) => item(u)), ...eight.map((u) => item(u))]);
    expect(r.items).toHaveLength(8);
    expect(r.duplicates).toBe(8);
  });

  it('丢弃无 detailUrl 的条目，且不计入 duplicates', () => {
    const r = dedupeListItems([item(''), item('https://x.com/p/1')]);
    expect(r.items.map((i) => i.detailUrl)).toEqual(['https://x.com/p/1']);
    expect(r.duplicates).toBe(0);
  });

  it('保留首个出现条目的 name（先到者胜，与落库 ON CONFLICT 一致）', () => {
    const r = dedupeListItems([item('https://x.com/p/1', '先'), item('https://x.com/p/1', '后')]);
    expect(r.items[0].name).toBe('先');
  });
});
