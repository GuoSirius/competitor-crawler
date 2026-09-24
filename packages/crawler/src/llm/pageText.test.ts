import { describe, it, expect } from 'vitest';
import { htmlToVisibleText } from './pageText.js';

describe('htmlToVisibleText', () => {
  it('剔除 script / style / noscript，只留可见文本', () => {
    const html = `<html><head><style>.a{color:red}</style></head>
      <body><h1>胎牛血清</h1><script>var skuList=[{price:1}];</script>
      <p>规格：500mL</p><noscript>需开启 JS</noscript></body></html>`;
    const t = htmlToVisibleText(html);
    expect(t).toContain('胎牛血清');
    expect(t).toContain('规格：500mL');
    expect(t).not.toContain('skuList');
    expect(t).not.toContain('color:red');
    expect(t).not.toContain('需开启 JS');
  });

  it('块级元素保留换行：表格每个单元格独占一行', () => {
    const html = `<body><table><tr><td>100μL</td><td>1280</td></tr>
      <tr><td>1mL</td><td>3280</td></tr></table></body>`;
    const lines = htmlToVisibleText(html).split('\n');
    expect(lines).toEqual(['100μL', '1280', '1mL', '3280']);
  });

  it('压缩连续空白与空行', () => {
    const html = '<body><p>  多   空格  </p>\n\n\n<p></p><div>  </div></body>';
    expect(htmlToVisibleText(html)).toBe('多 空格');
  });

  it('超长内容截断并标注', () => {
    const html = `<body><p>${'甲'.repeat(300)}</p></body>`;
    const t = htmlToVisibleText(html, 100);
    expect(t).toContain('…（内容超长已截断）');
    expect(t.split('\n')[0]).toHaveLength(100);
  });

  it('保留被隐藏的节点内容（多 Tab 面板常被 hidden/aria-hidden 藏起来，规格参数就在里面）', () => {
    const html = `<body>
      <div role="tabpanel" class="tab-pane active">基本信息：胎牛血清</div>
      <div role="tabpanel" class="tab-pane" hidden>规格：500mL / ￥1280</div>
      <div role="tabpanel" class="tab-pane" aria-hidden="true" style="display:none">货号：ZQ1273</div>
    </body>`;
    const t = htmlToVisibleText(html);
    expect(t).toContain('基本信息：胎牛血清');
    expect(t).toContain('规格：500mL / ￥1280');
    expect(t).toContain('货号：ZQ1273');
  });

  it('空输入返回空串', () => {
    expect(htmlToVisibleText('')).toBe('');
  });
});
