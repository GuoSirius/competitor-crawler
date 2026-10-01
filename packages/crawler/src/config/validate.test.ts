// validateSiteConfig 单测：必填/身份键缺失、拼写建议、阶段错位、数值未标 number、不误报自定义字段
import { describe, it, expect } from 'vitest';
import { validateSiteConfig, hasErrors, formatIssues } from './validate.js';
import type { SiteConfig } from './types.js';

function baseCfg(partial: Partial<SiteConfig>): SiteConfig {
  return { domain: 'x.com', ...partial } as SiteConfig;
}

describe('validateSiteConfig', () => {
  it('合法最小配置零问题', () => {
    const cfg = baseCfg({
      startUrl: 'https://x.com/list',
      parseList: { itemSelector: '.item', fields: { detailUrl: { sel: 'a', attr: 'href' }, name: { sel: '.t' } } },
      parseDetail: { fields: { name: { sel: 'h1' } } },
    });
    const issues = validateSiteConfig(cfg);
    expect(issues).toEqual([]);
  });

  it('缺必填 name → error 级 MISSING_REQUIRED', () => {
    const cfg = baseCfg({
      startUrl: 'https://x.com/list',
      parseList: { itemSelector: '.item', fields: { detailUrl: { sel: 'a', attr: 'href' } } },
      parseDetail: { fields: {} },
    });
    const issues = validateSiteConfig(cfg);
    expect(hasErrors(issues)).toBe(true);
    expect(issues[0].code).toBe('MISSING_REQUIRED');
    expect(issues[0].field).toBe('name');
  });

  it('缺身份键（无 detailUrl 无 sourceProductId）→ error 级 MISSING_IDENTITY', () => {
    const cfg = baseCfg({
      startUrl: 'https://x.com/list',
      parseList: { itemSelector: '.item', fields: { name: { sel: '.t' } } },
      parseDetail: { fields: { name: { sel: 'h1' } } },
    });
    const issues = validateSiteConfig(cfg);
    expect(issues.some((i) => i.code === 'MISSING_IDENTITY' && i.level === 'error')).toBe(true);
  });

  it('sourceProductId 在详情配了也算身份键齐备（二选一即可）', () => {
    const cfg = baseCfg({
      startUrl: 'https://x.com/list',
      parseList: { itemSelector: '.item', fields: { name: { sel: '.t' } } },
      parseDetail: { fields: { name: { sel: 'h1' }, sourceProductId: { sel: '[data-id]' } } },
    });
    const issues = validateSiteConfig(cfg);
    expect(issues.some((i) => i.code === 'MISSING_IDENTITY')).toBe(false);
  });

  it('productName 疑似拼写 → warn 级 UNKNOWN_FIELD_TYPO 且不阻断', () => {
    const cfg = baseCfg({
      startUrl: 'https://x.com/list',
      parseList: { itemSelector: '.item', fields: { detailUrl: { sel: 'a', attr: 'href' } } },
      parseDetail: { fields: { name: { sel: 'h1' }, productName: { sel: '.n' } } },
    });
    const issues = validateSiteConfig(cfg);
    const typo = issues.find((i) => i.code === 'UNKNOWN_FIELD_TYPO');
    expect(typo?.level).toBe('warn');
    expect(typo?.field).toBe('productName');
    expect(typo?.message).toContain("'name'");
  });

  it('真实自定义字段静默放行（不误报）', () => {
    const cfg = baseCfg({
      startUrl: 'https://x.com/list',
      parseList: { itemSelector: '.item', fields: { detailUrl: { sel: 'a', attr: 'href' } } },
      parseDetail: { fields: { name: { sel: 'h1' }, species: { sel: '.sp' }, host: { sel: '.h' }, cas: { sel: '.c' } } },
    });
    const issues = validateSiteConfig(cfg);
    expect(issues.filter((i) => i.code === 'UNKNOWN_FIELD_TYPO')).toEqual([]);
  });

  it('specs 只配在 parseList → info 级 STAGE_MISMATCH（不会进 typed 列）', () => {
    const cfg = baseCfg({
      startUrl: 'https://x.com/list',
      parseList: {
        itemSelector: '.item',
        fields: { detailUrl: { sel: 'a', attr: 'href' }, specs: { sel: '.s', list: true } },
      },
      parseDetail: { fields: { name: { sel: 'h1' } } },
    });
    const issues = validateSiteConfig(cfg);
    const sm = issues.find((i) => i.code === 'STAGE_MISMATCH' && i.field === 'specs');
    expect(sm?.level).toBe('info');
  });

  it('price 未标 number: true → info 级 NUMERIC_NOT_NUMBER', () => {
    const cfg = baseCfg({
      startUrl: 'https://x.com/list',
      parseList: { itemSelector: '.item', fields: { detailUrl: { sel: 'a', attr: 'href' } } },
      parseDetail: { fields: { name: { sel: 'h1' }, price: { sel: '.p' } } },
    });
    const issues = validateSiteConfig(cfg);
    expect(issues.some((i) => i.code === 'NUMERIC_NOT_NUMBER' && i.field === 'price')).toBe(true);
  });

  it('多规则站点逐 section 校验且带 sectionKey', () => {
    const cfg = baseCfg({
      sections: [
        {
          key: 'ab',
          parseList: { itemSelector: '.i', fields: { detailUrl: { sel: 'a', attr: 'href' } } },
          parseDetail: { fields: {} },
        },
      ],
    });
    const issues = validateSiteConfig(cfg);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.every((i) => i.sectionKey === 'ab')).toBe(true);
  });

  it('内容栏目（contentType=news）用 contents 注册表：缺 title 报错、name 不再必填', () => {
    const cfg = baseCfg({
      contentType: 'news',
      startUrl: 'https://x.com/news',
      parseList: { itemSelector: '.i', fields: { detailUrl: { sel: 'a', attr: 'href' } } },
      parseDetail: { fields: {} },
    });
    const issues = validateSiteConfig(cfg);
    expect(issues.some((i) => i.code === 'MISSING_REQUIRED' && i.field === 'title')).toBe(true);
    expect(issues.some((i) => i.code === 'MISSING_REQUIRED' && i.field === 'name')).toBe(false);
    // 内容栏目不做 products 身份键检查
    expect(issues.some((i) => i.code === 'MISSING_IDENTITY')).toBe(false);
  });

  it('配置桩（无 parseList）→ 只给 info 引导，不报缺 name/身份键', () => {
    const cfg = baseCfg({ company: '某公司', role: 'competitor', currency: 'CNY' });
    const issues = validateSiteConfig(cfg);
    expect(issues.length).toBe(1);
    expect(issues[0].level).toBe('info');
    expect(issues[0].message).toContain('gen-site');
    expect(hasErrors(issues)).toBe(false);
  });

  it('排序：error 在前，info 在后；formatIssues 空问题返回空数组', () => {
    const cfg = baseCfg({
      startUrl: 'https://x.com/list',
      parseList: { itemSelector: '.item', fields: { detailUrl: { sel: 'a', attr: 'href' } } },
      parseDetail: { fields: { price: { sel: '.p' } } },
    });
    const issues = validateSiteConfig(cfg);
    const levels = issues.map((i) => i.level);
    expect(levels.indexOf('error')).toBeLessThan(levels.indexOf('info'));
    expect(formatIssues('x.com', [])).toEqual([]);
  });
});
