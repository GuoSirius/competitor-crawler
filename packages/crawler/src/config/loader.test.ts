import { describe, expect, it } from 'vitest';
import { pickSectionByUrl, resolveSections, listRenderMode, detailRenderMode } from './loader.js';
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

describe('resolveSections — 渲染模式 Hybrid 合并', () => {
  it('单规则站点：站点级 render/renderList/renderDetail 透传到 default 栏目', () => {
    const cfg: SiteConfig = {
      ...single,
      render: 'ssr',
      renderList: 'spa',
      renderDetail: 'auto',
    };
    const [s] = resolveSections(cfg);
    expect(s.render).toBe('ssr');
    expect(s.renderList).toBe('spa');
    expect(s.renderDetail).toBe('auto');
  });

  it('多规则站点：section 覆盖站点级，未写则继承站点级', () => {
    const cfg: SiteConfig = {
      domain: 'h.com',
      render: 'ssr',
      parseList: { itemSelector: '.i', fields: {} },
      parseDetail: { fields: {} },
      sections: [
        // 仅覆盖 render（整栏目统一），renderList/renderDetail 继承站点级 ssr
        { key: 'all-ssr', render: 'ssr', startUrls: ['https://h.com/a'] },
        // 覆盖 renderList/renderDetail（列表 ssr、详情 spa），render 继承站点级
        { key: 'hybrid', renderList: 'ssr', renderDetail: 'spa', startUrls: ['https://h.com/b'] },
        // 全继承站点级
        { key: 'inherit', startUrls: ['https://h.com/c'] },
      ],
    };
    const got = resolveSections(cfg);
    expect(got[0].render).toBe('ssr');
    expect(got[0].renderList).toBeUndefined();
    expect(got[0].renderDetail).toBeUndefined();
    expect(got[1].render).toBe('ssr'); // 继承站点级
    expect(got[1].renderList).toBe('ssr');
    expect(got[1].renderDetail).toBe('spa');
    expect(got[2].render).toBe('ssr'); // 全继承
    expect(got[2].renderList).toBeUndefined();
    expect(got[2].renderDetail).toBeUndefined();
  });
});

describe('listRenderMode / detailRenderMode — 回退链', () => {
  const base = { render: 'auto' as const };

  it('列表页：renderList > render > 回退值', () => {
    expect(listRenderMode({ ...base, renderList: 'ssr' }, 'spa')).toBe('ssr');
    expect(listRenderMode(base, 'spa')).toBe('auto'); // 无 renderList → render
    expect(listRenderMode({ render: undefined }, 'spa')).toBe('spa'); // 全无 → 回退
  });

  it('详情页：renderDetail > render > 回退值（与列表对称）', () => {
    expect(detailRenderMode({ ...base, renderDetail: 'spa' }, 'ssr')).toBe('spa');
    expect(detailRenderMode(base, 'ssr')).toBe('auto');
    expect(detailRenderMode({ render: undefined }, 'ssr')).toBe('ssr');
  });

  it('Hybrid 站点：同一栏目列表 ssr、详情 spa', () => {
    const s = { render: 'auto' as const, renderList: 'ssr' as const, renderDetail: 'spa' as const };
    expect(listRenderMode(s, 'auto')).toBe('ssr');
    expect(detailRenderMode(s, 'auto')).toBe('spa');
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
