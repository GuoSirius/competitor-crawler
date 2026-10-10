import { describe, it, expect } from 'vitest';
import { parseDateStr, toPendingContent } from './crawl.js';
import { unixFromBjParts } from '@competitor-crawler/shared';
import type { ListItem, NormalizedProduct } from '@competitor-crawler/shared';

// 新表结构：toPendingContent 第 5 参为 sections 表主键 sectionId（number），第 6 参仍为 contentType
const SID_NEWS = 101;
const SID_SCHOOL = 102;

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
    const full = toPendingContent(np({ name: '详情标题', row: {} }), baseItem, baseItem.detailUrl, 1, SID_NEWS, 'news');
    expect(full?.title).toBe('详情标题');

    const fromRow = toPendingContent(np({ row: { title: 'row标题' } }), baseItem, baseItem.detailUrl, 1, SID_NEWS, 'news');
    expect(fromRow?.title).toBe('row标题');

    const fromList = toPendingContent(np({ row: {} }), baseItem, baseItem.detailUrl, 1, SID_NEWS, 'news');
    expect(fromList?.title).toBe('列表标题');
  });

  it('title 兜底：列表 raw.title（listOnly 等无详情场景的唯一兜底，缺它会被静默丢弃）', () => {
    const item: ListItem = { detailUrl: 'https://x.com/news/3', raw: { title: 'raw标题' }, sectionKey: 'news' };
    const c = toPendingContent(np({ row: {} }), item, item.detailUrl, 1, SID_NEWS, 'news');
    expect(c?.title).toBe('raw标题');
    // 前级仍在时优先于 raw.title
    const c2 = toPendingContent(np({ row: {} }), { ...baseItem, raw: { title: 'raw标题' } }, baseItem.detailUrl, 1, SID_NEWS, 'news');
    expect(c2?.title).toBe('列表标题');
  });

  it('无标题（详情/row/列表全空）→ 丢弃返回 null', () => {
    const item: ListItem = { detailUrl: 'https://x.com/news/2', sectionKey: 'news' };
    expect(toPendingContent(np({ row: {} }), item, item.detailUrl, 1, SID_NEWS, 'news')).toBeNull();
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
      SID_NEWS,
      'news',
    );
    expect(c?.summary).toBe('摘要文本'); // row.summary 优先于 description
    expect(c?.body).toBe('正文文本');
    expect(c?.author).toBe('市场部');
    expect(c?.publishedAt).toBe(Math.floor(new Date(2026, 8, 1).getTime() / 1000));
  });

  it('description 兜底为 summary；body/content/text 依次尝试', () => {
    const c = toPendingContent(np({ description: '只有描述', row: {} }), baseItem, baseItem.detailUrl, 1, SID_NEWS, 'news');
    expect(c?.summary).toBe('只有描述');
    expect(c?.body).toBeNull();

    const c2 = toPendingContent(np({ row: { content: 'content 正文' } }), baseItem, baseItem.detailUrl, 1, SID_NEWS, 'news');
    expect(c2?.body).toBe('content 正文');

    const c3 = toPendingContent(np({ row: { text: 'text 正文' } }), baseItem, baseItem.detailUrl, 1, SID_NEWS, 'news');
    expect(c3?.body).toBe('text 正文');
  });

  it('bodyHtml：YAML 配 html:true 抽的富文本（row.bodyHtml），缺省 null 不占空间', () => {
    const withHtml = toPendingContent(
      np({ row: { bodyHtml: '<p>富文本正文</p>' } }),
      baseItem,
      baseItem.detailUrl,
      1,
      SID_NEWS,
      'news',
    );
    expect(withHtml?.bodyHtml).toBe('<p>富文本正文</p>');

    // 未配 bodyHtml 的栏目：恒 null（不误把纯文本 body 塞进富文本列）
    const plain = toPendingContent(np({ row: { body: '纯文本正文' } }), baseItem, baseItem.detailUrl, 1, SID_NEWS, 'news');
    expect(plain?.bodyHtml).toBeNull();
  });

  it('identityKey：sourceId 优先，缺省退 canonical(detailUrl)', () => {
    const withId = toPendingContent(np({ sourceProductId: 'a-001', row: {} }), baseItem, baseItem.detailUrl, 1, SID_NEWS, 'news');
    expect(withId?.identityKey).toBe('a-001');

    const noId = toPendingContent(np({ row: {} }), baseItem, baseItem.detailUrl, 1, SID_NEWS, 'news');
    expect(noId?.identityKey).toBeTruthy();
    expect(noId?.identityKey).not.toBe(''); // canonical(url) 非空
  });

  it('sourceId 配在 parseList 时：列表阶段抽到的值兜底进 source_id / identity_key（否则恒 null）', () => {
    // YAML 把 sourceId 写在 parseList（列表页 URL 自带 id），值落在 ListItem.raw 上
    const item = { ...baseItem, raw: { sourceId: '503' } };
    const c = toPendingContent(np({ row: {} }), item, item.detailUrl, 1, SID_SCHOOL, 'school');
    expect(c?.sourceId).toBe('503');
    expect(c?.identityKey).toBe('503'); // 身份键随之改为幂等 id，不再退 canonical(url)

    // 详情抽到时仍以详情为准（详情优先）
    const withDetail = toPendingContent(
      np({ row: { sourceId: 'd-9' } }),
      { ...baseItem, raw: { sourceId: '503' } },
      baseItem.detailUrl,
      1,
      SID_SCHOOL,
      'school',
    );
    expect(withDetail?.sourceId).toBe('d-9');

    // 列表兜底为空（列表没配 sourceId）→ 保持原样退 URL
    const noRaw = toPendingContent(np({ row: {} }), baseItem, baseItem.detailUrl, 1, SID_NEWS, 'news');
    expect(noRaw?.sourceId).toBeNull();
    expect(noRaw?.identityKey).not.toBe('503');
  });

  it('详情没抽到的字段回退列表阶段（详情非空优先、详情空则取列表）', () => {
    const item = {
      ...baseItem,
      raw: { sourceId: '503', summary: '列表摘要', cover: '/img/a.jpg' },
    };
    // 详情全空 → 列表兜底
    const fromList = toPendingContent(np({ row: {} }), item, item.detailUrl, 1, SID_SCHOOL, 'school');
    expect(fromList?.sourceId).toBe('503');
    expect(fromList?.summary).toBe('列表摘要');

    // 详情抽到非空 → 详情优先（不被列表覆盖）
    const fromDetail = toPendingContent(
      np({ row: { summary: '详情摘要' } }),
      item,
      item.detailUrl,
      1,
      SID_SCHOOL,
      'school',
    );
    expect(fromDetail?.summary).toBe('详情摘要');
  });

  it('row 快照：详情优先 + 列表独有字段补进来（如列表的 cover）', () => {
    const item = { ...baseItem, raw: { cover: '/img/a.jpg', sourceId: '503' } };
    const c = toPendingContent(np({ row: { views: 1024 } }), item, item.detailUrl, 1, SID_SCHOOL, 'school');
    expect(c?.row.cover).toBe('/img/a.jpg'); // 列表独有 → 补进 row
    expect(c?.row.views).toBe(1024); // 详情字段保留
    expect(c?.row.sourceId).toBe('503'); // 详情没抽过 sourceId → 落 row 便于溯源
  });

  it('row 快照保留原始字段 + listTitle', () => {
    const c = toPendingContent(np({ row: { views: 1024 } }), baseItem, baseItem.detailUrl, 1, SID_NEWS, 'news');
    expect(c?.row.views).toBe(1024);
    expect(c?.row.listTitle).toBe('列表标题');
  });
});
