import { describe, expect, it } from 'vitest';
import { extractObject, type FieldSpec } from '@competitor-crawler/shared';
import { CheerioDomRead } from './cheerioDom.js';

/** 按 FieldSpec 从 HTML 抽取一组字段（与 yamlAdapter 同一入口） */
function extract(html: string, fields: Record<string, FieldSpec>): Record<string, unknown> {
  return extractObject(CheerioDomRead.fromHtml(html), fields);
}

describe('FieldSpec 三种取值方式', () => {
  const html = `
    <h2 class="pd-name">  CD3 Antibody  </h2>
    <a class="pd-link" href="/product/12345">详情</a>
    <div class="title">克隆号：OTI3A1  货号：ZQ1273</div>`;

  it('取文本（自动 trim）', () => {
    expect(extract(html, { name: { sel: '.pd-name', text: true } })).toEqual({ name: 'CD3 Antibody' });
  });

  it('不写 attr 等价于取文本', () => {
    expect(extract(html, { name: { sel: '.pd-name' } })).toEqual({ name: 'CD3 Antibody' });
  });

  it('取属性值', () => {
    expect(extract(html, { detailUrl: { sel: 'a.pd-link', attr: 'href' } })).toEqual({
      detailUrl: '/product/12345',
    });
  });

  it('regex 优先第 1 捕获组', () => {
    expect(extract(html, { pid: { sel: 'a.pd-link', attr: 'href', regex: '/product/(\\d+)' } })).toEqual({
      pid: '12345',
    });
    expect(extract(html, { sku: { sel: '.title', text: true, regex: '货号[:：]\\s*([A-Za-z0-9\\-]+)' } })).toEqual({
      sku: 'ZQ1273',
    });
  });

  it('regex 无捕获组时取全匹配；不匹配返回 null', () => {
    expect(extract(html, { x: { sel: '.title', text: true, regex: '克隆号' } })).toEqual({ x: '克隆号' });
    expect(extract(html, { x: { sel: '.title', text: true, regex: '不存在' } })).toEqual({ x: null });
  });

  it('选择器无匹配返回 null', () => {
    expect(extract(html, { x: { sel: '.nope', text: true } })).toEqual({ x: null });
  });
});

describe('number: true 数值抽取', () => {
  const html = `
    <span class="p1">￥1,280.00</span>
    <span class="p2">1280元</span>
    <span class="p3">价格面议</span>`;

  it('去千分位与币种符号后转数值', () => {
    expect(extract(html, { price: { sel: '.p1', text: true, regex: '[\\d,]+\\.?\\d*', number: true } })).toEqual({
      price: 1280,
    });
    expect(extract(html, { price: { sel: '.p2', text: true, number: true } })).toEqual({ price: 1280 });
  });

  it('无法解析为数值时返回 null（而非 NaN）', () => {
    expect(extract(html, { price: { sel: '.p3', text: true, number: true } })).toEqual({ price: null });
  });
});

describe('list 结构修饰', () => {
  const html = `<ul class="apps"><li>WB</li><li>IHC</li><li>FC</li></ul>`;

  it('list: true 收集为数组', () => {
    expect(extract(html, { applications: { sel: '.apps li', list: true, text: true } })).toEqual({
      applications: ['WB', 'IHC', 'FC'],
    });
  });

  it('list 结果为空时返回空数组', () => {
    expect(extract(html, { x: { sel: '.nope li', list: true, text: true } })).toEqual({ x: [] });
  });
});

describe('map / list+map 嵌套', () => {
  const html = `
    <table><tbody>
      <tr class="spec-row"><td class="spec">100μL</td><td class="price-now">￥1,280.00</td><td class="price-origin">￥1,600.00</td></tr>
      <tr class="spec-row"><td class="spec">1mL</td><td class="price-now">￥8,800.00</td><td class="price-origin">￥9,600.00</td></tr>
    </tbody></table>
    <div class="meta-box"><span class="catalog">C123</span></div>`;

  it('形态 A：list + map → 规格对象数组', () => {
    const got = extract(html, {
      specs: {
        sel: 'tr.spec-row',
        list: true,
        map: {
          spec: { sel: '.spec', text: true },
          priceNow: { sel: '.price-now', text: true, regex: '[\\d,]+', number: true },
          priceOriginal: { sel: '.price-origin', text: true },
        },
      },
    });
    expect(got.specs).toEqual([
      { spec: '100μL', priceNow: 1280, priceOriginal: '￥1,600.00' },
      { spec: '1mL', priceNow: 8800, priceOriginal: '￥9,600.00' },
    ]);
  });

  it('仅 map（无 list）→ 取第一个匹配内的子字段对象', () => {
    expect(extract(html, { meta: { sel: '.meta-box', map: { catalog: { sel: '.catalog', text: true } } } })).toEqual({
      meta: { catalog: 'C123' },
    });
  });

  it('map 内再 map（任意深度）', () => {
    const nested = `<div class="g"><span class="g-title">G1</span><a class="item" href="/i/1">A</a></div>`;
    const got = extract(nested, {
      groups: {
        sel: '.g',
        list: true,
        map: {
          title: { sel: '.g-title', text: true },
          items: { sel: '.item', list: true, map: { url: { sel: '$self', attr: 'href' } } },
        },
      },
    });
    expect(got.groups).toEqual([{ title: 'G1', items: [{ url: '/i/1' }] }]);
  });
});

describe("sel: '$self' 读元素自身属性（形态 B）", () => {
  const html = `
    <select id="spec">
      <option data-spec="100μL" data-price="1280" data-market-price="1600" data-sku="A-100">100μL</option>
      <option data-spec="1mL"   data-price="8800" data-market-price="9600" data-sku="A-1000">1mL</option>
    </select>`;

  it('从 <option> 自身属性抽出规格与多种价格', () => {
    const got = extract(html, {
      specs: {
        sel: 'select#spec option',
        list: true,
        map: {
          spec: { sel: '$self', attr: 'data-spec' },
          priceNow: { sel: '$self', attr: 'data-price', number: true },
          priceOriginal: { sel: '$self', attr: 'data-market-price', number: true },
          sku: { sel: '$self', attr: 'data-sku' },
        },
      },
    });
    expect(got.specs).toEqual([
      { spec: '100μL', priceNow: 1280, priceOriginal: 1600, sku: 'A-100' },
      { spec: '1mL', priceNow: 8800, priceOriginal: 9600, sku: 'A-1000' },
    ]);
  });

  it("$self 也支持取元素自身文本（用外层先选中元素）", () => {
    expect(extract(html, { first: { sel: 'select#spec option', text: true } })).toEqual({ first: '100μL' });
  });

  it('属性不存在时返回 null', () => {
    expect(
      extract(html, {
        specs: { sel: 'select#spec option', list: true, map: { x: { sel: '$self', attr: 'data-nope' } } },
      }),
    ).toEqual({ specs: [{ x: null }, { x: null }] });
  });
});

describe('json + jsonPath + pick（形态 C：内联 JSON）', () => {
  it('从 <script> 里抠出数组并映射成 specs', () => {
    const html = `<script>var skuList = [{"specName":"100μL","price":1280,"marketPrice":1600}];var t=1;</script>`;
    const got = extract(html, {
      specs: {
        sel: 'script',
        text: true,
        regex: 'skuList\\s*=\\s*(\\[[\\s\\S]*?\\]);',
        json: true,
        pick: { spec: 'specName', priceNow: 'price', priceOriginal: 'marketPrice' },
      },
    });
    expect(got.specs).toEqual([{ spec: '100μL', priceNow: 1280, priceOriginal: 1600 }]);
  });

  it('jsonPath 定位到嵌套层级后再 pick', () => {
    const html = `<script>window.__DATA__ = {"props":{"skus":[{"n":"100μL","p":1280}]}};</script>`;
    const got = extract(html, {
      specs: {
        sel: 'script',
        text: true,
        regex: 'window\\.__DATA__\\s*=\\s*(\\{[\\s\\S]*?\\});',
        json: true,
        jsonPath: 'props.skus',
        pick: { spec: 'n', priceNow: 'p' },
      },
    });
    expect(got.specs).toEqual([{ spec: '100μL', priceNow: 1280 }]);
  });

  it('JSON 解析失败返回 null（不抛错）', () => {
    const html = `<script>var skuList = 这不是JSON;</script>`;
    const got = extract(html, {
      specs: { sel: 'script', text: true, regex: '(.*)', json: true },
    });
    expect(got.specs).toBeNull();
  });
});

describe('多字段一次抽取（列表页/详情页真实形态）', () => {
  it('列表行 → detailUrl + name + sku + 价格', () => {
    const html = `
      <table class="table"><tbody>
        <tr class="traaa"><th>货号</th><th>名称</th><th>规格</th><th>价格</th></tr>
        <tr>
          <td><a href="/Index/p_more/pid/9731.html">ZQ1273</a></td>
          <td><a href="/Index/p_more/pid/9731.html">FreeStyle 293-F人胚肾细胞</a></td>
          <td><a href="/Index/p_more/pid/9731.html">1 x 10^6 cells/vial</a></td>
          <td>￥8300.00</td>
        </tr>
      </tbody></table>`;
    const got = extract(html, {
      detailUrl: { sel: "a[href*='/p_more/']", attr: 'href' },
      name: { sel: 'td:nth-child(2) a', text: true },
      sku: { sel: 'td:nth-child(1) a', text: true },
      specText: { sel: 'td:nth-child(3) a', text: true },
      priceText: { sel: 'td:nth-child(4)', text: true },
      price: { sel: 'td:nth-child(4)', text: true, regex: '[\\d,]+\\.?\\d*', number: true },
    });
    expect(got).toEqual({
      detailUrl: '/Index/p_more/pid/9731.html',
      name: 'FreeStyle 293-F人胚肾细胞',
      sku: 'ZQ1273',
      specText: '1 x 10^6 cells/vial',
      priceText: '￥8300.00',
      price: 8300,
    });
  });
});
