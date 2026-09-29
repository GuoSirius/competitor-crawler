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

  it('parseYamlConfig：缺 parseList 关键字段 → 明确报错', () => {
    expect(() => parseYamlConfig('```yaml\nparseList:\n  itemSelector: ".item"\n```', OPTS)).toThrow(
      /parseList/,
    );
    expect(() => parseYamlConfig('不是 YAML 输出：随便一段话', OPTS)).toThrow();
  });
});
