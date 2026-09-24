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

describe('detectSpecPriceShape — 多 Tab（与形态正交的维度）', () => {
  it('非激活面板已有内容 → static：明确「不需要点击」并给出面板选择器', () => {
    const html = `
      <div role="tablist"><button role="tab">基本信息</button><button role="tab">规格参数</button></div>
      <div role="tabpanel" class="tab-pane active">基本信息：胎牛血清</div>
      <div role="tabpanel" class="tab-pane" hidden>规格参数 100μL ￥1280 / 1mL ￥8800</div>`;
    const f = detectSpecPriceShape(html);
    expect(f.tabs?.detected).toBe(true);
    expect(f.tabs?.kind).toBe('static');
    expect(f.tabs?.hiddenFilledCount).toBe(1);
    expect(f.evidence.join()).toMatch(/不需要点击/);
    expect(f.howTo).toContain('tabpanel');
    expect(f.needsApi).toBe(false);
  });

  it('Tab 内是表格 → 形态仍是 A-table，同时回报 Tab 信息', () => {
    const html = `
      <div class="tab-content">
        <div class="tab-pane active"><table><tr><td>a</td><td>￥1</td></tr></table></div>
        <div class="tab-pane" style="display:none"><table>
          <tr><td>100μL</td><td>￥1,280</td></tr><tr><td>1mL</td><td>￥8,800</td></tr>
        </table></div>
      </div>`;
    const f = detectSpecPriceShape(html);
    expect(f.shape).toBe('A-table');
    expect(f.tabs?.panelCount).toBe(2);
    expect(f.tabs?.kind).toBe('static');
  });

  it('非激活面板在 HTML 里为空 → lazy，归入形态 D 并说明「不支持点击」', () => {
    const html = `
      <div class="el-tabs"><div class="el-tabs__item">规格参数</div></div>
      <div class="el-tab-pane active">基本信息</div>
      <div class="el-tab-pane"></div>`;
    const f = detectSpecPriceShape(html);
    expect(f.shape).toBe('D-async');
    expect(f.needsApi).toBe(true);
    expect(f.tabs?.kind).toBe('lazy');
    expect(f.howTo).toMatch(/不支持点击/);
  });

  it('误命中防护：class 含 table / ytable / price-table 不算 Tab（"table" 里含 "tab"）', () => {
    const html = `
      <table class="ytable"><tr><td>100μL</td><td>￥1,280</td></tr><tr><td>1mL</td><td>￥8,800</td></tr></table>
      <table class="price-table"><tr><td>100μL</td><td>￥1,280</td></tr></table>`;
    const f = detectSpecPriceShape(html);
    expect(f.tabs?.detected).toBe(false);
    expect(f.shape).toBe('A-table');
  });

  it('无 Tab 结构时不回报 tabs', () => {
    const f = detectSpecPriceShape(`<h1>培养基</h1><div class="price">￥56.00</div>`);
    expect(f.tabs?.detected).toBe(false);
  });
});
