import { describe, it, expect } from 'vitest';
import { parseBreadcrumb } from './breadcrumb.js';

const page = (items: string[]) => `
<ul class="breadcrumb">${items.map((t) => `<li><a href="#">${t}</a></li>`).join('')}</ul>`;

describe('parseBreadcrumb（categoryFromPage 面包屑动态分类）', () => {
  it('标准面包屑：默认丢弃末段（产品名），返回根→叶', () => {
    const segs = parseBreadcrumb(page(['首页', '产品中心', '抗体', 'XX抗体']), {
      itemSelector: '.breadcrumb li',
      strip: ['首页', '产品中心'],
    });
    expect(segs).toEqual(['抗体']);
  });

  it('不配置 strip 时保留全部非末段；无末段可丢时（仅 1 段）返回空', () => {
    expect(parseBreadcrumb(page(['试剂', '抗体', 'XX抗体']), { itemSelector: '.breadcrumb li' }))
      .toEqual(['试剂', '抗体']);
    expect(parseBreadcrumb(page(['XX抗体']), { itemSelector: '.breadcrumb li' })).toEqual([]);
  });

  it('keepLast: true 保留末段（页面本身没有产品名末段的站点）', () => {
    const segs = parseBreadcrumb(page(['试剂', '抗体']), { itemSelector: '.breadcrumb li', keepLast: true });
    expect(segs).toEqual(['试剂', '抗体']);
  });

  it('纯分隔符段（> / »）被剔除，相邻重复去重；末段（抗体）默认视为产品名丢弃', () => {
    const html = `<ul class="breadcrumb"><li>试剂</li><li>&gt;</li><li>试剂</li><li>»</li><li>抗体</li></ul>`;
    expect(parseBreadcrumb(html, { itemSelector: '.breadcrumb li' })).toEqual(['试剂']);
  });

  it('maxDepth 限制深度', () => {
    const segs = parseBreadcrumb(page(['A', 'B', 'C', 'D', 'E']), { itemSelector: '.breadcrumb li', maxDepth: 2 });
    expect(segs).toEqual(['A', 'B']);
  });

  it('选择器未命中或非法 HTML 返回空数组（调用方回落静态分类）', () => {
    expect(parseBreadcrumb('<div>没有面包屑</div>', { itemSelector: '.breadcrumb li' })).toEqual([]);
    expect(parseBreadcrumb('<ul class=breadcrumb><li>x</li></ul', { itemSelector: '.breadcrumb li' })).toEqual([]);
    expect(parseBreadcrumb(page(['A', 'B']), { itemSelector: '' })).toEqual([]);
  });

  it('取文本时压缩内部空白', () => {
    const html = `<ul class="breadcrumb"><li>  细胞
      生物学  </li><li>XX细胞</li></ul>`;
    expect(parseBreadcrumb(html, { itemSelector: '.breadcrumb li' })).toEqual(['细胞 生物学']);
  });
});
