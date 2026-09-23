import { describe, expect, it } from 'vitest';
import { pickSectionByUrl, resolveSections } from './loader.js';
import type { SiteConfig } from './types.js';

const single: SiteConfig = {
  domain: 'a.com',
  startUrl: 'https://a.com/list',
  parseList: { itemSelector: '.item', fields: { detailUrl: { sel: 'a', attr: 'href' } } },
  parseDetail: { fields: { name: { sel: 'h1', text: true } } },
};

const multi: SiteConfig = {
  domain: 'b.com',
  currency: 'USD',
  listTraversal: { strategy: 'pagination-html', nextSelector: 'a.next', maxPages: 30 },
  parseList: { itemSelector: '.item', fields: { detailUrl: { sel: 'a', attr: 'href' } } },
  parseDetail: { fields: { name: { sel: 'h1', text: true } } },
  sections: [
    // 全继承顶层 + 自带 startUrls / category
    { key: 'cell-lines', category: '细胞系', startUrls: ['https://b.com/cells'], match: { listUrlIncludes: ['/cells'] } },
    // 覆盖 maxPages，并用自定义 parseList
    {
      key: 'media',
      listTraversal: { strategy: 'pagination-html', nextSelector: 'a.more', maxPages: 5 },
      parseList: { itemSelector: 'table tr', fields: { detailUrl: { sel: 'a', attr: 'href' } } },
      startUrls: ['https://b.com/media'],
      match: { listUrlIncludes: ['/media'] },
    },
  ],
};

describe('resolveSections — 单规则写法', () => {
  it('包成唯一的 key="default" 栏目，币种缺省 CNY', () => {
    const got = resolveSections(single);
    expect(got).toHaveLength(1);
    expect(got[0].key).toBe('default');
    expect(got[0].currency).toBe('CNY');
    expect(got[0].startUrls).toEqual(['https://a.com/list']);
    expect(got[0].listTraversal.strategy).toBe('pagination-html'); // 默认遍历策略
    expect(got[0].parseDetail.captureRest).toBeUndefined();
  });

  it('缺 parseList 时报错（引导改用 sections）', () => {
    expect(() => resolveSections({ domain: 'x.com' })).toThrow(/缺少 parseList/);
  });
});

describe('resolveSections — 多规则写法', () => {
  it('逐栏目展开并继承顶层默认值', () => {
    const got = resolveSections(multi);
    expect(got).toHaveLength(2);
    expect(got.map((s) => s.key)).toEqual(['cell-lines', 'media']);
    // 顶层 currency 透传到每个栏目
    expect(got.every((s) => s.currency === 'USD')).toBe(true);
    // cell-lines 全继承
    expect(got[0].listTraversal.maxPages).toBe(30);
    expect(got[0].category).toBe('细胞系');
    expect(got[0].startUrls).toEqual(['https://b.com/cells']);
    // media 覆盖 maxPages + parseList
    expect(got[1].listTraversal.maxPages).toBe(5);
    expect(got[1].listTraversal.nextSelector).toBe('a.more');
    expect(got[1].parseList.itemSelector).toBe('table tr');
    // media 未写 parseDetail → 继承顶层
    expect(got[1].parseDetail.fields.name).toBeDefined();
  });

  it('section 缺 parseList 且顶层也没有 → 报错并指出索引', () => {
    const bad: SiteConfig = {
      domain: 'c.com',
      sections: [{ key: 'only', startUrls: ['https://c.com/x'] }],
    };
    expect(() => resolveSections(bad)).toThrow(/sections\[0\].*缺少 parseList/);
  });

  it('section.key 缺省补 default', () => {
    const cfg: SiteConfig = {
      domain: 'd.com',
      parseList: { itemSelector: '.i', fields: {} },
      sections: [{ key: '', startUrls: ['https://d.com/x'] }],
    };
    expect(resolveSections(cfg)[0].key).toBe('default');
  });
});

describe('pickSectionByUrl', () => {
  const sections = resolveSections(multi);

  it('按 URL 命中对应栏目', () => {
    expect(pickSectionByUrl(sections, 'https://b.com/media?p=2', 'list')?.key).toBe('media');
    expect(pickSectionByUrl(sections, 'https://b.com/cells', 'list')?.key).toBe('cell-lines');
  });

  it('无命中返回 undefined（调用方自行兜底）', () => {
    expect(pickSectionByUrl(sections, 'https://b.com/other', 'list')).toBeUndefined();
  });

  it('未配置 match 的 section 不会被命中', () => {
    const noMatch = resolveSections({
      domain: 'e.com',
      parseList: { itemSelector: '.i', fields: {} },
      sections: [{ key: 'k', startUrls: ['https://e.com/x'] }],
    });
    expect(pickSectionByUrl(noMatch, 'https://e.com/x', 'list')).toBeUndefined();
  });
});
