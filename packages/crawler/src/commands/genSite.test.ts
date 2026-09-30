import { describe, expect, it } from 'vitest';
import { extractYaml, parseYamlConfig } from './genSite.js';

const OPTS = { domain: 'example.com', listUrl: 'https://www.example.com/list' };

describe('genSite 模型产出解析（docs/16 Q2）', () => {
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

  it('parseYamlConfig：缺 parseList 关键字段 → 明确报错', () => {
    expect(() => parseYamlConfig('```yaml\nparseList:\n  itemSelector: ".item"\n```', OPTS)).toThrow(
      /parseList/,
    );
    expect(() => parseYamlConfig('不是 YAML 输出：随便一段话', OPTS)).toThrow();
  });
});
