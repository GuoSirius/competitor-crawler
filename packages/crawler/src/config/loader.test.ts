import { afterEach, describe, expect, it } from 'vitest';
import {
  pickSectionByUrl,
  resolveSections,
  listRenderMode,
  detailRenderMode,
  resolveTraversalLimits,
  slicePageItems,
  expandProxyVar,
  LIST_ONLY_TRAVERSAL,
} from './loader.js';
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

  it('listOnly 透传到栏目（逐 section 声明，不从顶层继承）', () => {
    const cfg: SiteConfig = {
      domain: 'f.com',
      listOnly: true, // 顶层声明：多规则站点不继承，仅单规则写法生效
      parseList: { itemSelector: '.i', fields: {} },
      sections: [
        { key: 'list', listOnly: true, startUrls: ['https://f.com/list'] },
        { key: 'full', startUrls: ['https://f.com/full'] },
      ],
    };
    const got = resolveSections(cfg);
    expect(got[0].listOnly).toBe(true);
    expect(got[1].listOnly).toBeUndefined();
  });

  it('listOnly 栏目默认只抓第一页（不被站点级 pagination-url/urlTemplate 带着翻页）', () => {
    const cfg: SiteConfig = {
      domain: 'g.com',
      listTraversal: { strategy: 'pagination-url', urlTemplate: '?page={page}', maxPages: 1000 },
      parseList: { itemSelector: '.i', fields: {} },
      sections: [
        // 显式声明 listTraversal 的栏目：尊重显式配置（仍然翻页）
        { key: 'explicit', listOnly: true, startUrls: ['https://g.com/a'], listTraversal: { strategy: 'pagination-html' } },
        // 未声明的 listOnly 栏目：默认单页，且不再继承站点级 urlTemplate
        { key: 'snapshot', listOnly: true, startUrls: ['https://g.com/b'] },
        { key: 'normal', startUrls: ['https://g.com/c'] },
      ],
    };
    const got = resolveSections(cfg);
    expect(got[0].listTraversal.strategy).toBe('pagination-html');
    expect(got[1].listTraversal).toEqual(LIST_ONLY_TRAVERSAL);
    expect(got[1].listTraversal.urlTemplate).toBeUndefined();
    // 普通栏目仍走原字段级合并（继承站点级模板）
    expect(got[2].listTraversal.strategy).toBe('pagination-url');
    expect(got[2].listTraversal.urlTemplate).toBe('?page={page}');
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
      renderList: 'browser',
      renderDetail: 'auto',
    };
    const [s] = resolveSections(cfg);
    expect(s.render).toBe('ssr');
    expect(s.renderList).toBe('browser');
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
        // 覆盖 renderList/renderDetail（列表 ssr、详情 browser），render 继承站点级
        { key: 'hybrid', renderList: 'ssr', renderDetail: 'browser', startUrls: ['https://h.com/b'] },
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
    expect(got[1].renderDetail).toBe('browser');
    expect(got[2].render).toBe('ssr'); // 全继承
    expect(got[2].renderList).toBeUndefined();
    expect(got[2].renderDetail).toBeUndefined();
  });
});

describe('listRenderMode / detailRenderMode — 回退链', () => {
  const base = { render: 'auto' as const };

  it('列表页：renderList > render > 回退值', () => {
    expect(listRenderMode({ ...base, renderList: 'ssr' }, 'browser')).toBe('ssr');
    expect(listRenderMode(base, 'browser')).toBe('auto'); // 无 renderList → render
    expect(listRenderMode({ render: undefined }, 'browser')).toBe('browser'); // 全无 → 回退
  });

  it('详情页：renderDetail > render > 回退值（与列表对称）', () => {
    expect(detailRenderMode({ ...base, renderDetail: 'browser' }, 'ssr')).toBe('browser');
    expect(detailRenderMode(base, 'ssr')).toBe('auto');
    expect(detailRenderMode({ render: undefined }, 'ssr')).toBe('ssr');
  });

  it('Hybrid 站点：同一栏目列表 ssr、详情 browser', () => {
    const s = { render: 'auto' as const, renderList: 'ssr' as const, renderDetail: 'browser' as const };
    expect(listRenderMode(s, 'auto')).toBe('ssr');
    expect(detailRenderMode(s, 'auto')).toBe('browser');
  });
});

describe('resolveTraversalLimits / slicePageItems — 分页条目控制', () => {
  it('字段级合并：section 只覆盖部分字段，其余回退顶层', () => {
    const cfg: SiteConfig = {
      domain: 't.com',
      parseList: { itemSelector: '.i', fields: {} },
      listTraversal: { strategy: 'pagination-url', urlTemplate: '?p={page}', maxPages: 30, offset: 5 },
      sections: [
        // 只覆盖 maxPages / limit，strategy/urlTemplate/offset 继承顶层
        { key: 'partial', listTraversal: { strategy: 'pagination-url', maxPages: 3, limit: 10 }, startUrls: ['https://t.com/a'] },
      ],
    };
    const [s] = resolveSections(cfg);
    expect(s.listTraversal.strategy).toBe('pagination-url'); // section 自带
    expect(s.listTraversal.urlTemplate).toBe('?p={page}'); // 继承顶层
    expect(s.listTraversal.maxPages).toBe(3); // section 覆盖
    expect(s.listTraversal.offset).toBe(5); // 继承顶层
    expect(s.listTraversal.limit).toBe(10); // section 覆盖
  });

  it('resolveTraversalLimits：YAML 缺省 → 默认值（maxPages 1000 / pageStart 1 / offset 0）', () => {
    const tv = resolveTraversalLimits({ strategy: 'pagination-url' });
    expect(tv).toEqual({ pageStart: 1, pageEnd: undefined, maxPages: 1000, offset: 0, perPage: undefined, listRetry: 1 });
  });

  it('resolveTraversalLimits：CLI 显式覆盖 YAML（pageStart/pageEnd/offset/perPage）', () => {
    const tv = resolveTraversalLimits(
      { strategy: 'pagination-url', pageStart: 2, pageEnd: 9, offset: 5, limit: 20 },
      { pageStart: 4, pageEnd: 6, offset: 10, perPage: 3 },
    );
    expect(tv).toEqual({ pageStart: 4, pageEnd: 6, maxPages: 1000, offset: 10, perPage: 3, listRetry: 1 });
  });

  it('resolveTraversalLimits：--pages 与 YAML maxPages 取小（安全护栏语义）', () => {
    expect(resolveTraversalLimits({ strategy: 'pagination-html', maxPages: 30 }, { pages: 5 }).maxPages).toBe(5);
    expect(resolveTraversalLimits({ strategy: 'pagination-html', maxPages: 3 }, { pages: 50 }).maxPages).toBe(3);
    // 双方都没显式写 maxPages → 硬兜底 1000
    expect(resolveTraversalLimits({ strategy: 'pagination-html' }, { pages: 5000 }).maxPages).toBe(1000);
  });

  it('resolveTraversalLimits：strategy=none（局部禁翻页）→ maxPages 恒 1，不受 CLI/YAML 数值影响', () => {
    expect(resolveTraversalLimits({ strategy: 'none' }).maxPages).toBe(1);
    expect(resolveTraversalLimits({ strategy: 'none', maxPages: 99 }, { pages: 50 }).maxPages).toBe(1);
  });

  it('slicePageItems：offset 起连取 perPage 条；无需截取时原样返回', () => {
    const items = [1, 2, 3, 4, 5, 6];
    expect(slicePageItems(items, { offset: 0, perPage: undefined })).toBe(items); // 无截取 → 原引用
    expect(slicePageItems(items, { offset: 2, perPage: undefined })).toEqual([3, 4, 5, 6]);
    expect(slicePageItems(items, { offset: 1, perPage: 3 })).toEqual([2, 3, 4]);
    expect(slicePageItems(items, { offset: 10, perPage: 3 })).toEqual([]); // 越界 → 空
    expect(slicePageItems(items, { offset: 4, perPage: 100 })).toEqual([5, 6]); // 尾部不足 → 到页尾
  });
});

describe('expandProxyVar — 代理占位符展开（YAML 是唯一裁决方）', () => {
  const orig = process.env.CRAWL_PROXY;

  afterEach(() => {
    if (orig === undefined) delete process.env.CRAWL_PROXY;
    else process.env.CRAWL_PROXY = orig;
  });

  it('未配 / 空串 → undefined（不配就是直连，代码层不做任何域名推断）', () => {
    expect(expandProxyVar(undefined)).toBeUndefined();
    expect(expandProxyVar('')).toBeUndefined();
  });

  it('字面量原样透传（不走占位符解析）', () => {
    expect(expandProxyVar('http://127.0.0.1:7890')).toBe('http://127.0.0.1:7890');
  });

  it('${CRAWL_PROXY} 展开为环境变量值', () => {
    process.env.CRAWL_PROXY = 'http://127.0.0.1:54212';
    expect(expandProxyVar('${CRAWL_PROXY}')).toBe('http://127.0.0.1:54212');
  });

  it('占位符但环境变量未设置 → 空串（等价于没配 → 直连，不报错）', () => {
    delete process.env.CRAWL_PROXY;
    expect(expandProxyVar('${CRAWL_PROXY}')).toBe('');
  });

  it('其他变量名走通用回退，未设置同样给空串', () => {
    delete process.env.CRAWL_PROXY;
    expect(expandProxyVar('${CRAWL_PROXY_ZH}')).toBe('');
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
