// B类站点 Playwright 渲染批量探查：列表页渲染后找产品卡结构
// 用法: node scripts/probe-render.mjs  →  .tmp/render-analysis.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(REPO, 'packages', 'crawler', 'package.json'));
const { chromium } = require('playwright');

const OUT_DIR = path.join(REPO, '.tmp');
fs.mkdirSync(OUT_DIR, { recursive: true });

const DET = /\/product|\/goods|\/item|\/p\/|\/p-|\/detail|\.html\?id=|goodsno|\/catalog\//i;
const EXC = /cart|login|register|about|news|article|contact|service|solution|support|javascript:|mailto:|tel:|search\?|document|account/i;

const TARGETS = [
  ['Abcam', 'https://www.abcam.com/en-us/products/primary-antibodies'],
  ['赛默飞', 'https://www.thermofisher.cn/cn/zh/home/life-science/antibodies/antibody-search.html'],
  ['ATCC', 'https://www.atcc.org/cell-products'],
  ['康宁', 'https://www.corning.com/cn/zh/products/life-sciences/products/cell-Culture.html'],
  ['R&D Systems', 'https://www.rndsystems.com/products/elisas'],
  ['Proteintech', 'https://www.ptglab.com/results?category=&q=antibodies&target='],
  ['ScienCell', 'https://sciencellonline.com/en/products-services/cell-culture-media/'],
  ['STEMCELL', 'https://www.stemcell.com/products/product-types/antibodies.html'],
  ['Bio X Cell', 'https://bioxcell.com/in-vivo-antibodies'],
  ['BioAssay Systems', 'https://bioassaysys.com/product-category/blood-urine-chemistry/'],
  ['华美 CUSABIO', 'https://www.cusabio.cn/catalog-30-1.html'],
  ['诺唯赞', 'https://bio.vazyme.com/products_4/1428441065069035520-0-12.html'],
  ['Capricorn', 'https://www.capricorn-scientific.com/en/products'],
  ['海星 hycyte', 'https://www.hycyte.com/'],
];

async function probe(browser, label, url) {
  const page = await browser.newPage({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36' });
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2500);
    const html = await page.content();
    const finalUrl = page.url();
    // cheerio 侧统计
    const cheerio = require('cheerio');
    const $ = cheerio.load(html);
    const anchors = [];
    $('a[href]').each((_, a) => {
      const h = $(a).attr('href') || '';
      if (DET.test(h) && !EXC.test(h)) anchors.push({ href: h, el: a });
    });
    const sig = {};
    for (const { el } of anchors) {
      let e = el;
      for (let i = 0; i < 2; i++) { const p = $(e).parent(); if (!p.length) break; e = p[0]; }
      if (!e || ['body', 'html'].includes(e.tagName)) continue;
      const cls = ($(e).attr('class') || '').split(/\s+/).slice(0, 3).join('.');
      const k = e.tagName + (cls ? '.' + cls : '');
      sig[k] = (sig[k] || 0) + 1;
    }
    const top = Object.entries(sig).sort((x, y) => y[1] - x[1]).slice(0, 3);
    let card0 = null;
    if (anchors.length) {
      let card = anchors[0].el;
      for (let i = 0; i < 2; i++) { const p = $(card).parent(); if (p.length) card = p[0]; }
      card0 = $(card).toString().replace(/\s+/g, ' ').slice(0, 320);
    }
    return { label, url, finalUrl, status: 'ok', bytes: html.length, detailAnchors: anchors.length, sigs: top, card0 };
  } catch (e) {
    return { label, url, status: 'ERR', error: String(e.message || e).slice(0, 100) };
  } finally {
    await page.close().catch(() => {});
  }
}

async function main() {
  const browser = await chromium.launch();
  const out = [];
  for (const [label, url] of TARGETS) {
    const r = await probe(browser, label, url);
    out.push(r);
    if (r.status === 'ok') process.stderr.write(`[${r.label}] anchors=${r.detailAnchors} | ${(r.sigs || []).map(([k, v]) => k + '(' + v + ')').join(' ')}\n`);
    else process.stderr.write(`[${r.label}] ERR ${r.error}\n`);
  }
  await browser.close();
  fs.writeFileSync(path.join(OUT_DIR, 'render-analysis.json'), JSON.stringify(out, null, 2), 'utf-8');
  console.log('\nwrote .tmp/render-analysis.json');
}
main().catch((e) => { console.error(e); process.exit(1); });
