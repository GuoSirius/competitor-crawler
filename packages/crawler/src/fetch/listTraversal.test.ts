import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildPageUrl, traverseList } from './listTraversal.js';
import { fetchPage } from './page.js';

// 用 mock 替换 page.js 的 fetchPage，避免真实网络请求
vi.mock('./page.js', () => ({
  fetchPage: vi.fn(),
}));

const mockFetch = vi.mocked(fetchPage);
afterEach(() => mockFetch.mockReset());

describe('buildPageUrl', () => {
  it('完整 URL 模板 → 直接替换 {page}', () => {
    expect(buildPageUrl('https://a.com/list', 'https://a.com/list?page={page}', 2)).toBe(
      'https://a.com/list?page=2',
    );
  });

  it('查询串后缀 ?page={page} → 合并进 base query，保留 base 原有参数', () => {
    expect(buildPageUrl('https://a.com/list?lcid=5', '?page={page}', 3)).toBe(
      'https://a.com/list?lcid=5&page=3',
    );
  });

  it('查询串后缀 &p={page} → 合并为 ?p=1', () => {
    expect(buildPageUrl('https://a.com/products', '&p={page}', 1)).toBe('https://a.com/products?p=1');
  });

  it('绝对路径模板 /c/{page} → origin + 路径', () => {
    expect(buildPageUrl('https://a.com/shop', '/c/{page}', 4)).toBe('https://a.com/c/4');
  });

  it('base 已含同名参数时，模板覆盖之', () => {
    expect(buildPageUrl('https://a.com/list?page=999', '?page={page}', 7)).toBe(
      'https://a.com/list?page=7',
    );
  });

  it('hash 模板（#page={page}）→ 显式报错（HTTP 不发送 fragment，静默翻不动优于晚发现）', () => {
    expect(() => buildPageUrl('https://a.com/list', '#page={page}', 2)).toThrow(/hash 翻页不被支持/);
    expect(() => buildPageUrl('https://a.com/list', 'https://a.com/list#page={page}', 2)).toThrow(
      /hash 翻页不被支持/,
    );
  });
});

describe('traverseList — pagination-url', () => {
  it('按 maxPages 顺序抓取，遇 0 条目提前终止', async () => {
    const urls: string[] = [];
    mockFetch.mockImplementation(async (url: string) => {
      urls.push(url);
      return '<html></html>';
    });
    const onPage = vi.fn(async (_html: string, pageNo: number) => (pageNo >= 3 ? 0 : 2));

    const res = await traverseList({
      url: 'https://x.com/list?lcid=5',
      traversal: { strategy: 'pagination-url', urlTemplate: '?page={page}', maxPages: 50 },
      listMode: 'ssr',
      maxPages: 50,
      onPage,
    });

    expect(urls).toEqual([
      'https://x.com/list?lcid=5&page=1',
      'https://x.com/list?lcid=5&page=2',
      'https://x.com/list?lcid=5&page=3',
    ]);
    expect(res.pages).toBe(3);
    expect(res.items).toBe(4); // 2 + 2 + 0
  });

  it('每页回调收到的第 3 个参数就是本页真实 URL', async () => {
    const seen: string[] = [];
    mockFetch.mockResolvedValue('<html></html>');
    const onPage = vi.fn(async (_h: string, _n: number, pageUrl: string) => {
      seen.push(pageUrl);
      return 1;
    });

    await traverseList({
      url: 'https://x.com/list',
      traversal: { strategy: 'pagination-url', urlTemplate: '?p={page}', maxPages: 3 },
      listMode: 'ssr',
      maxPages: 999,
      onPage,
    });

    expect(seen).toEqual([
      'https://x.com/list?p=1',
      'https://x.com/list?p=2',
      'https://x.com/list?p=3',
    ]);
  });

  it('调用方 maxPages 上限截断', async () => {
    mockFetch.mockResolvedValue('<html></html>');
    const onPage = vi.fn(async () => 1);

    const res = await traverseList({
      url: 'https://x.com/list',
      traversal: { strategy: 'pagination-url', urlTemplate: '?p={page}', maxPages: 3 },
      listMode: 'ssr',
      maxPages: 999, // 调用方上限远高于配置，应以配置 3 为准
      onPage,
    });

    expect(res.pages).toBe(3);
  });

  it('某页抓取抛错 → 默认重试 1 次后仍失败则跳过该页并继续翻页（记录缺失页）', async () => {
    const urls: string[] = [];
    mockFetch.mockImplementation(async (url: string) => {
      urls.push(url);
      if (url.includes('p=2')) throw new Error('HTTP 500'); // 第 2 页始终失败
      return '<html></html>';
    });
    const onPage = vi.fn(async () => 1);

    const res = await traverseList({
      url: 'https://x.com/list',
      traversal: { strategy: 'pagination-url', urlTemplate: '?p={page}', maxPages: 4 },
      listMode: 'ssr',
      maxPages: 4,
      onPage,
    });

    // 第 2 页：首次 + 1 次重试 = 2 次 fetch；其余页各 1 次；不终止整轮
    expect(urls.filter((u) => u === 'https://x.com/list?p=2')).toHaveLength(2);
    expect(res.pages).toBe(3); // 1/3/4 成功
    expect(res.missingPages).toEqual([2]);
  });

  it('listRetry=0：失败页不重试，跳过并继续翻页', async () => {
    const urls: string[] = [];
    mockFetch.mockImplementation(async (url: string) => {
      urls.push(url);
      if (url.includes('p=2')) throw new Error('HTTP 500');
      return '<html></html>';
    });

    const res = await traverseList({
      url: 'https://x.com/list',
      traversal: { strategy: 'pagination-url', urlTemplate: '?p={page}', maxPages: 4, listRetry: 0 },
      listMode: 'ssr',
      maxPages: 4,
      onPage: async () => 1,
    });

    expect(urls.filter((u) => u === 'https://x.com/list?p=2')).toHaveLength(1); // 不重试
    expect(res.pages).toBe(3);
    expect(res.missingPages).toEqual([2]);
  });

  it('listRetry=2：首次失败后重试成功，不记为缺失', async () => {
    let calls = 0;
    mockFetch.mockImplementation(async (url: string) => {
      calls++;
      if (url.includes('p=2') && calls <= 2) throw new Error('HTTP 500'); // 前 2 次失败，第 3 次成功
      return '<html></html>';
    });

    const res = await traverseList({
      url: 'https://x.com/list',
      traversal: { strategy: 'pagination-url', urlTemplate: '?p={page}', maxPages: 3, listRetry: 2 },
      listMode: 'ssr',
      maxPages: 3,
      onPage: async () => 1,
    });

    expect(res.pages).toBe(3); // 全部成功（第 2 页第 3 次重试成功）
    expect(res.missingPages).toEqual([]);
  });

  it('缺少 urlTemplate → 报错', async () => {
    await expect(
      traverseList({
        url: 'https://x.com/list',
        traversal: { strategy: 'pagination-url', maxPages: 3 },
        listMode: 'ssr',
        maxPages: 3,
        onPage: async () => 0,
      }),
    ).rejects.toThrow(/urlTemplate/);
  });

  it('pageStart 自定义起始页码', async () => {
    const urls: string[] = [];
    mockFetch.mockImplementation(async (url: string) => {
      urls.push(url);
      return '<html></html>';
    });
    const onPage = vi.fn(async () => 1);

    await traverseList({
      url: 'https://x.com/list',
      traversal: { strategy: 'pagination-url', urlTemplate: '?p={page}', maxPages: 2, pageStart: 5 },
      listMode: 'ssr',
      maxPages: 2,
      onPage,
    });

    expect(urls).toEqual(['https://x.com/list?p=5', 'https://x.com/list?p=6']);
  });

  it('pageEnd 终止页（闭区间）：翻到第 3 页即停，maxPages 再大也不越界', async () => {
    const urls: string[] = [];
    mockFetch.mockImplementation(async (url: string) => {
      urls.push(url);
      return '<html></html>';
    });
    const onPage = vi.fn(async () => 1);

    const res = await traverseList({
      url: 'https://x.com/list',
      traversal: { strategy: 'pagination-url', urlTemplate: '?p={page}', maxPages: 100 },
      listMode: 'ssr',
      maxPages: 100,
      pageEnd: 3,
      onPage,
    });

    expect(urls).toEqual([
      'https://x.com/list?p=1',
      'https://x.com/list?p=2',
      'https://x.com/list?p=3',
    ]);
    expect(res.pages).toBe(3);
  });

  it('pageStart + pageEnd 组合：只抓区间内页码', async () => {
    const urls: string[] = [];
    mockFetch.mockImplementation(async (url: string) => {
      urls.push(url);
      return '<html></html>';
    });
    const onPage = vi.fn(async () => 1);

    const res = await traverseList({
      url: 'https://x.com/list',
      traversal: { strategy: 'pagination-url', urlTemplate: '?p={page}', maxPages: 100, pageStart: 4 },
      listMode: 'ssr',
      maxPages: 100,
      pageEnd: 5,
      onPage,
    });

    expect(urls).toEqual(['https://x.com/list?p=4', 'https://x.com/list?p=5']);
    expect(res.pages).toBe(2);
  });
});
