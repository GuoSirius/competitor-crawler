import { describe, expect, it } from 'vitest';
import { buildModelHtml, extractYaml, parseYamlConfig } from './genSite.js';

const OPTS = { domain: 'example.com', listUrl: 'https://www.example.com/list' };

describe('genSite 模型产出解析（docs/16 Q2）', () => {
  it('buildModelHtml：去 head/script/style/注释 并压缩空白', () => {
    const html =
      '<html><head><style>.a{color:red}</style><script>var x=1;</script></head>' +
      '<body><!-- 注释 --><div  class="card">  <a href="/p/1">A</a>  </div></body></html>';
    const out = buildModelHtml(html);
    expect(out).not.toMatch(/<style|<script|<head|<!--/);
    expect(out).toContain('class="card"');
    expect(out).not.toMatch(/\s{2,}/);
  });

  it('buildModelHtml：超预算时按链接密度选窗，窗口包含商品卡而非纯导航', () => {
    // 前 40KB 只有 1 个链接（导航壳），后面 80 张商品卡每张 2 个链接 → 密度最高的块在卡片区
    const nav = '<div class="nav">' + '<span>x</span>'.repeat(20000) + '<a href="/nav">N</a></div>';
    const cards = Array.from({ length: 80 }, (_, i) => `<div class="product-card"><a href="/p/${i}">P${i}</a><a href="/p/${i}?t">T</a></div>`).join('');
    const out = buildModelHtml(nav + cards, 20000);
    expect(out.length).toBeLessThanOrEqual(20000);
    expect(out).toContain('product-card'); // 窗口命中卡片区，而不是把预算全花在导航上
  });

  it('parseYamlConfig：NEED_MORE_HTML（截断看不到条目）给出针对性指引', () => {
    expect(() =>
      parseYamlConfig('```yaml\nparseList:\n  itemSelector: null # NEED_MORE_HTML\n```', OPTS),
    ).toThrow(/NEED_MORE_HTML.*列表页 URL|看不到商品条目/);
  });

  it('extractYaml：优先 yaml 围栏，退回普通围栏/整段', () => {
    expect(extractYaml('前言```yaml\ndomain: a\n```后记')).toBe('domain: a');
    expect(extractYaml('```\ndomain: b\n```')).toBe('domain: b');
    expect(extractYaml('domain: c')).toBe('domain: c');
  });

  it('parseYamlConfig：合法产出补全 domain/startUrl/traversal/detail 缺省', () => {
    const cfg = parseYamlConfig(
      '```yaml\nparseList:\n  itemSelector: ".item"\n  fields:\n    detailUrl: { sel: "a", attr: href }\n```',
      OPTS,
    );
    expect(cfg.domain).toBe('example.com');
    expect(cfg.startUrl).toBe('https://www.example.com/list');
    expect(cfg.listTraversal?.strategy).toBe('pagination-html');
    expect(cfg.parseDetail?.captureRest).toBe(true);
  });

  it('parseYamlConfig：company 优先用用户传入，模型值仅兜底', () => {
    const yamlIn = '```yaml\ncompany: 模型猜的公司\nparseList:\n  itemSelector: ".item"\n  fields:\n    detailUrl: { sel: "a", attr: href }\n```';
    expect(parseYamlConfig(yamlIn, { ...OPTS, companyKey: '用户指定' }).company).toBe('用户指定');
    expect(parseYamlConfig(yamlIn, OPTS).company).toBe('模型猜的公司');
  });

  it('parseYamlConfig：competitorType/role 用户传入为准，未传入不注水', () => {
    const yamlIn = '```yaml\nparseList:\n  itemSelector: ".item"\n  fields:\n    detailUrl: { sel: "a", attr: href }\n```';
    const withAttrs = parseYamlConfig(yamlIn, { ...OPTS, competitorType: '多肽合成试剂', role: 'own' });
    expect(withAttrs.competitorType).toBe('多肽合成试剂');
    expect(withAttrs.role).toBe('own');
    const withoutAttrs = parseYamlConfig(yamlIn, OPTS);
    expect(withoutAttrs.competitorType).toBeUndefined();
    expect(withoutAttrs.role).toBeUndefined();
  });

  it('parseYamlConfig：已存在文件身份字段（currency/role/company）在模型未产出时兜底保留', () => {
    const yamlIn = '```yaml\nparseList:\n  itemSelector: ".item"\n  fields:\n    detailUrl: { sel: "a", attr: href }\n```';
    const existing = { domain: 'old.com', company: '老公司', role: 'own', currency: '元' } as const;
    const cfg = parseYamlConfig(yamlIn, OPTS, existing);
    expect(cfg.currency).toBe('元');
    expect(cfg.role).toBe('own');
    expect(cfg.company).toBe('老公司');
  });

  it('parseYamlConfig：CLI 传入优先级高于已存在文件的身份字段', () => {
    const yamlIn = '```yaml\nparseList:\n  itemSelector: ".item"\n  fields:\n    detailUrl: { sel: "a", attr: href }\n```';
    const existing = { domain: 'old.com', role: 'own', currency: '元' } as const;
    const cfg = parseYamlConfig(yamlIn, { ...OPTS, role: 'competitor', currency: 'USD' }, existing);
    expect(cfg.role).toBe('competitor');
    expect(cfg.currency).toBe('USD');
  });

  it('parseYamlConfig：render 从已存在文件兜底并写回（批量混合 ssr/spa 无需逐站指定）', () => {
    const yamlIn = '```yaml\nparseList:\n  itemSelector: ".item"\n  fields:\n    detailUrl: { sel: "a", attr: href }\n```';
    const existing = { domain: 'old.com', render: 'spa' as const };
    expect(parseYamlConfig(yamlIn, OPTS, existing).render).toBe('spa');
    // 无已存在文件且无 CLI 传入 → 默认 auto 并写回
    expect(parseYamlConfig(yamlIn, OPTS).render).toBe('auto');
    // CLI 显式传入优先
    expect(parseYamlConfig(yamlIn, { ...OPTS, render: 'ssr' }, existing).render).toBe('ssr');
  });

  it('parseYamlConfig：startUrl 合并优先级 CLI --list-url > 已存在文件 > 模型产出（必须等于实际抓取入口）', () => {
    const yamlIn =
      '```yaml\nstartUrl: https://www.example.com/MODEL-WRONG\nparseList:\n  itemSelector: ".item"\n  fields:\n    detailUrl: { sel: "a", attr: href }\n```';
    const existing = { domain: 'old.com', startUrl: 'https://www.example.com/search' } as const;
    // 省略 --list-url、桩文件带 startUrl：保留桩的真值（不采模型产出的错误 URL）
    expect(parseYamlConfig(yamlIn, { ...OPTS, listUrl: undefined }, existing).startUrl).toBe(
      'https://www.example.com/search',
    );
    // 传 --list-url：覆盖桩与模型产出
    expect(parseYamlConfig(yamlIn, { ...OPTS, listUrl: 'https://www.example.com/CLI' }, existing).startUrl).toBe(
      'https://www.example.com/CLI',
    );
  });

  it('parseYamlConfig：缺 parseList 关键字段 → 明确报错', () => {
    expect(() => parseYamlConfig('```yaml\nparseList:\n  itemSelector: ".item"\n```', OPTS)).toThrow(
      /parseList/,
    );
    expect(() => parseYamlConfig('不是 YAML 输出：随便一段话', OPTS)).toThrow();
  });
});
