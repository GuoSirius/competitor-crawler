import { describe, expect, it } from 'vitest';
import { detectSpecPriceShape } from './shapeDetect.js';

describe('detectSpecPriceShape — 形态 A（表格行）', () => {
  const html = `
    <table class="price-table"><tbody>
      <tr><td>100μL</td><td>￥1,280.00</td><td>￥1,600.00</td></tr>
      <tr><td>1mL</td><td>￥8,800.00</td><td>￥9,600.00</td></tr>
    </tbody></table>`;
  it('识别为静态可抽（不需接口）', () => {
    const f = detectSpecPriceShape(html);
    expect(f.shape).toBe('A-table');
    expect(f.staticExtractable).toBe(true);
    expect(f.needsApi).toBe(false);
    expect(f.howTo).toContain('list: true');
  });
});

describe("detectSpecPriceShape — 形态 B（下拉项自带属性）", () => {
  const html = `
    <select id="spec">
      <option data-spec="100μL" data-price="1280">100μL</option>
      <option data-spec="1mL" data-price="8800">1mL</option>
    </select>`;
  it('识别为静态可抽，指引里给 $self 写法', () => {
    const f = detectSpecPriceShape(html);
    expect(f.shape).toBe('B-option-attr');
    expect(f.staticExtractable).toBe(true);
    expect(f.needsApi).toBe(false);
    expect(f.howTo).toContain("$self");
    expect(f.evidence.join()).toMatch(/data-\*/);
  });
});

describe('detectSpecPriceShape — 形态 C（内联 JSON）', () => {
  it('识别 <script> 里的 skuList 变量', () => {
    const html = `<html><body><script>var skuList = [{"specName":"100μL","price":1280}];</script></body></html>`;
    const f = detectSpecPriceShape(html);
    expect(f.shape).toBe('C-inline-json');
    expect(f.staticExtractable).toBe(true);
    expect(f.howTo).toContain('json: true');
  });

  it('识别框架内联状态（__NEXT_DATA__）', () => {
    const html = `<html><body><script id="__NEXT_DATA__" type="application/json">{"props":{"skus":[]}}</script></body></html>`;
    const f = detectSpecPriceShape(html);
    expect(f.shape).toBe('C-inline-json');
    expect(f.evidence.join()).toMatch(/框架内联状态/);
  });
});

describe('detectSpecPriceShape — 形态 D（异步接口）', () => {
  const html = `
    <h1>CD3 Antibody</h1>
    <div class="price-area">价格：￥--</div>
    <select id="spec"><option value="1">100μL</option><option value="2">1mL</option></select>`;

  it('有 <select> 但 option 无属性、页面无静态数据 → 需要人工提供接口', () => {
    const f = detectSpecPriceShape(html);
    expect(f.shape).toBe('D-async');
    expect(f.needsApi).toBe(true);
    expect(f.staticExtractable).toBe(false);
  });

  it('指引里必须写清「在哪配」「怎么配」（含配置路径与步骤）', () => {
    const f = detectSpecPriceShape(html);
    expect(f.howTo).toContain('parseDetail.api');       // 在哪配
    expect(f.howTo).toContain('config/sites/');          // 哪个文件
    expect(f.howTo).toContain('Network');                // 怎么找到接口
    expect(f.howTo).toContain('target: specs');          // 怎么填
    expect(f.howTo).toContain('pnpm probe');             // 怎么验证
  });
});

describe('detectSpecPriceShape — 形态 E（前端计算）', () => {
  const html = `
    <select id="spec"><option>100μL</option><option>1mL</option></select>
    <script>function calc(price){ return price * qty; } var unitPrice = 1280;</script>`;

  it('脚本里出现价格计算 → E，需要接口/模型兜底', () => {
    const f = detectSpecPriceShape(html);
    expect(f.shape).toBe('E-computed');
    expect(f.needsApi).toBe(true);
  });
});

describe('detectSpecPriceShape — 无规格结构', () => {
  it('单规格产品 → none，不告警', () => {
    const html = `<h1>RPMI-1640 培养基</h1><div class="price">￥56.00</div><p>500ml</p>`;
    const f = detectSpecPriceShape(html);
    expect(f.shape).toBe('none');
    expect(f.needsApi).toBe(false);
  });
});
