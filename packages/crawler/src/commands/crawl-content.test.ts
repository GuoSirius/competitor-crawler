import { describe, it, expect } from 'vitest';
import { parseDateStr, toPendingContent } from './crawl.js';
import { unixFromBjParts } from '@competitor-crawler/shared';
import type { ListItem, NormalizedProduct } from '@competitor-crawler/shared';

describe('parseDateStr · 常见日期写法 → Unix 秒（北京时间口径）', () => {
  it('YYYY-MM-DD（- / . 分隔）按北京时间零点', () => {
    const s = parseDateStr('2026-09-29');
    expect(s).toBe(unixFromBjParts(2026, 9, 29));
    expect(parseDateStr('2026/9/5')).toBe(unixFromBjParts(2026, 9, 5));
    expect(parseDateStr('2026.09.05')).toBe(unixFromBjParts(2026, 9, 5));
  });

  it('YYYY-MM-DD HH:mm[:ss] 带时间', () => {
    const s = parseDateStr('2026-09-29 12:30');
    expect(s).toBe(unixFromBjParts(2026, 9, 29, 12, 30, 0));
    const s2 = parseDateStr('2026-09-29 12:30:45');
    expect(s2).toBe(unixFromBjParts(2026, 9, 29, 12, 30, 45));
  });

  it('数字时间戳：秒 / 毫秒自动判别，过小不猜', () => {
    expect(parseDateStr(1789000000)).toBe(1789000000); // >=1e9 视为秒
    expect(parseDateStr(1789000000000)).toBe(1789000000); // >=1e12 视为毫秒
    expect(parseDateStr(12345)).toBeNull(); // 过小不猜
  });

  it('ISO / RFC 等可 Date.parse 的字符串', () => {
    const s = parseDateStr('2026-09-29T08:00:00Z');
    expect(s).toBe(Math.floor(Date.parse('2026-09-29T08:00:00Z') / 1000));
  });

  it('空 / 乱字符串 / 非字符串 → null', () => {
    expect(parseDateStr('')).toBeNull();
    expect(parseDateStr('   ')).toBeNull();
    expect(parseDateStr('发布中')).toBeNull();
    expect(parseDateStr(null)).toBeNull();
    expect(parseDateStr(undefined)).toBeNull();
    expect(parseDateStr({ a: 1 })).toBeNull();
  });
});

describe('toPendingContent · NormalizedProduct → PendingContent 映射', () => {
  const baseItem: ListItem = { detailUrl: 'https://x.com/news/1', name: '列表标题', sectionKey: 'news' };

  function np(partial: Partial<NormalizedProduct> & { row?: Record<string, unknown> }): NormalizedProduct {
    return { specs: [], introMedia: [], row: partial.row ?? {}, ...partial } as NormalizedProduct;
  }

  it('title 优先级：详情 name → row.title → 列表名', () => {
    const full = toPendingContent(np({ name: '详情标题', row: {} }), baseItem, baseItem.detailUrl, 1, 'news', 'news');
    expect(full?.title).toBe('详情标题');

    const fromRow = toPendingContent(np({ row: { title: 'row标题' } }), baseItem, baseItem.detailUrl, 1, 'news', 'news');
    expect(fromRow?.title).toBe('row标题');

    const fromList = toPendingContent(np({ row: {} }), baseItem, baseItem.detailUrl, 1, 'news', 'news');
    expect(fromList?.title).toBe('列表标题');
  });

  it('无标题（详情/row/列表全空）→ 丢弃返回 null', () => {
    const item: ListItem = { detailUrl: 'https://x.com/news/2', sectionKey: 'news' };
    expect(toPendingContent(np({ row: {} }), item, item.detailUrl, 1, 'news', 'news')).toBeNull();
  });

  it('summary/body/author/publishedAt 按映射表取值', () => {
    const c = toPendingContent(
      np({
        description: '描述文本',
        row: {
          summary: '摘要文本',
          body: '正文文本',
          author: '市场部',
          date: '2026-09-01',
        },
      }),
      baseItem,
      baseItem.detailUrl,
      1,
      'news',
      'news',
    );
    expect(c?.summary).toBe('摘要文本'); // row.summary 优先于 description
    expect(c?.body).toBe('正文文本');
    expect(c?.author).toBe('市场部');
    expect(c?.publishedAt).toBe(Math.floor(new Date(2026, 8, 1).getTime() / 1000));
  });

  it('description 兜底为 summary；body/content/text 依次尝试', () => {
    const c = toPendingContent(np({ description: '只有描述', row: {} }), baseItem, baseItem.detailUrl, 1, 'news', 'news');
    expect(c?.summary).toBe('只有描述');
    expect(c?.body).toBeNull();

    const c2 = toPendingContent(np({ row: { content: 'content 正文' } }), baseItem, baseItem.detailUrl, 1, 'news', 'news');
    expect(c2?.body).toBe('content 正文');

    const c3 = toPendingContent(np({ row: { text: 'text 正文' } }), baseItem, baseItem.detailUrl, 1, 'news', 'news');
    expect(c3?.body).toBe('text 正文');
  });

  it('dedupeKey：sourceId 优先，缺省退 canonical(detailUrl)', () => {
    const withId = toPendingContent(np({ sourceProductId: 'a-001', row: {} }), baseItem, baseItem.detailUrl, 1, 'news', 'news');
    expect(withId?.dedupeKey).toBe('a-001');

    const noId = toPendingContent(np({ row: {} }), baseItem, baseItem.detailUrl, 1, 'news', 'news');
    expect(noId?.dedupeKey).toBeTruthy();
    expect(noId?.dedupeKey).not.toBe(''); // canonical(url) 非空
  });

  it('row 快照保留原始字段 + listTitle', () => {
    const c = toPendingContent(np({ row: { views: 1024 } }), baseItem, baseItem.detailUrl, 1, 'news', 'news');
    expect(c?.row.views).toBe(1024);
    expect(c?.row.listTitle).toBe('列表标题');
  });
});
