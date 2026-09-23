import { describe, expect, it } from 'vitest';
import { absoluteUrl, canonicalizeUrl, domainOf, pickDedupeKey } from './url.js';

describe('canonicalizeUrl', () => {
  it('去掉 hash、末尾斜杠并转小写', () => {
    expect(canonicalizeUrl('https://X.com/Product/A/')).toBe('https://x.com/product/a');
    expect(canonicalizeUrl('https://x.com/a#section')).toBe('https://x.com/a');
  });

  it('剔除 utm_* / gclid / fbclid / spm 等追踪参数，保留业务参数', () => {
    expect(canonicalizeUrl('https://x.com/p?id=7&utm_source=a&gclid=b&fbclid=c')).toBe(
      'https://x.com/p?id=7',
    );
    expect(canonicalizeUrl('https://x.com/p?fid=9&nums=2&p=2')).toBe('https://x.com/p?fid=9&nums=2&p=2');
  });

  it('非法 URL 退化为 trim + 小写（仍有稳定键）', () => {
    expect(canonicalizeUrl('  not-a-url  ')).toBe('not-a-url');
    expect(canonicalizeUrl('')).toBe('');
  });
});

describe('absoluteUrl', () => {
  it('相对链接按 base 解析为绝对链接', () => {
    expect(absoluteUrl('/a/b.html', 'https://x.com/list/1.html')).toBe('https://x.com/a/b.html');
    expect(absoluteUrl('b.html', 'https://x.com/list/1.html')).toBe('https://x.com/list/b.html');
  });

  it('空值返回空串', () => {
    expect(absoluteUrl('', 'https://x.com/')).toBe('');
    expect(absoluteUrl(null, 'https://x.com/')).toBe('');
  });
});

describe('domainOf', () => {
  it('取 hostname 并小写', () => {
    expect(domainOf('https://WWW.Example.com/a')).toBe('www.example.com');
  });
  it('非法 URL 返回空串', () => {
    expect(domainOf('nope')).toBe('');
  });
});

describe('pickDedupeKey（去重口径：站点id → canonical(url)，货号不参与）', () => {
  it('有站点产品 id 时直接用 id（原样，不做规范化）', () => {
    expect(pickDedupeKey('SKU-1', 'https://x.com/p/1')).toBe('SKU-1');
  });

  it('无站点 id 时用 canonical(detail_url)', () => {
    expect(pickDedupeKey(null, 'https://X.com/p/1/?utm_source=a')).toBe('https://x.com/p/1');
  });

  it('两者都空返回空串（调用方据此跳过该条）', () => {
    expect(pickDedupeKey(null, null)).toBe('');
  });

  it('同货号不同规格页会产生**不同**去重键（证明货号未参与去重）', () => {
    const a = pickDedupeKey(null, 'https://x.com/p_more/pid/9731.html');
    const b = pickDedupeKey(null, 'https://x.com/p_more/pid/9732.html');
    expect(a).not.toBe(b);
  });
});
