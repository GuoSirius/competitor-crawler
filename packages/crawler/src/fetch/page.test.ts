import { describe, it, expect } from 'vitest';
import { resolveProxy } from './page.js';

const P = 'http://127.0.0.1:54212';

describe('代理裁决 resolveProxy', () => {
  it('未配置代理 → 直连（undefined）', () => {
    expect(resolveProxy('https://www.elabscience.com/search', undefined)).toBeUndefined();
    expect(resolveProxy('https://www.elabscience.com/search', '')).toBeUndefined();
  });

  it('境外站按配置走代理', () => {
    expect(resolveProxy('https://www.elabscience.com/search', P)).toBe(P);
    expect(resolveProxy('https://www.biolegend.com/en-us', P)).toBe(P);
  });

  it('中文站强制直连：即使配了代理也忽略（地域策略 WAF，代理只会更糟）', () => {
    expect(resolveProxy('https://www.elabscience.cn/search', P)).toBeUndefined();
    expect(resolveProxy('https://www.medchemexpress.cn/kits/cell-isolation.html', P)).toBeUndefined();
    // 大小写不敏感
    expect(resolveProxy('https://WWW.ELABSCIENCE.CN/search', P)).toBeUndefined();
  });

  it('非法 URL 不做特殊处理（交上层报错，代理照常返回）', () => {
    expect(resolveProxy('not-a-url', P)).toBe(P);
  });
});
