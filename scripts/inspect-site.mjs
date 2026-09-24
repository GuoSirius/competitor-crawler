import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('D:/workspace/resource/竞品爬虫项目/competitor-crawler/packages/crawler/package.json');
const cheerio = require('cheerio');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const TARGETS = [
  '盒子生工（Boxbio）|https://www.boxbio.cn/products/762/',
  '格锐思（Geruisi）|https://www.geruisi-bio.com/products/463/',
  '海狸（Beaver）|https://www.beaverbio.com/products/index/952.html',
  '菲恩生物（FineTest）|https://www.fn-test.cn/elisa-kits/',
];

function abs(base, h) { try { return new URL(h, base).href; } catch { return h; } }

async function inspect(label, url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' });
  const html = Buffer.from(await res.arrayBuffer()).toString('utf-8');
  const $ = cheerio.load(html);
  console.log('\n===== ' + label + ' =====');
  console.log('url:', url, '| status', res.status, '| bytes', html.length);
  const containers = [
    '.product-item', '.product', '.products > li', 'li.product', '[class*="product-item" i]',
    '[class*="prod-item" i]', '.item', '.goods', '.goods-item', '[class*="goods" i]',
  ];
  let best = null, bestN = 0;
  for (const s of containers) { const n = $(s).length; if (n > bestN) { bestN = n; best = s; } }
  console.log('best container:', best, 'x', bestN);
  if (best) {
    const details = new Set();
    $(best).each((_, el) => {
      const a = $(el).find('a[href]').first();
      const h = a.attr('href');
      if (h) details.add(abs(url, h).split('#')[0]);
    });
    console.log('sample detail hrefs:');
    [...details].slice(0, 5).forEach((d) => console.log('   ', d));
  }
  // 任意含产品含义的详情链接
  const allDet = new Set();
  $('a[href]').each((_, a) => {
    const h = $(a).attr('href') || '';
    if (/\/product\/|\/products\/|\/goods\/|\/item\/|\/p\/|\/detail|\.html\?id=|\/prod\//i.test(h)) allDet.add(abs(url, h).split('#')[0]);
  });
  console.log('all product-ish anchors (top5):');
  [...allDet].slice(0, 5).forEach((d) => console.log('   ', d));
  const pag = new Set();
  $('a[href]').each((_, a) => {
    const h = $(a).attr('href') || '';
    if (/[?&]page=|page\/\d+|paging|pageNum|pagenum|javascript:.*page=/i.test(h)) pag.add(abs(url, h).split('#')[0]);
  });
  console.log('pagination hrefs (top3):');
  [...pag].slice(0, 3).forEach((d) => console.log('   ', d));
}

async function main() {
  for (const t of TARGETS) {
    const [label, url] = t.split('|');
    try { await inspect(label, url); } catch (e) { console.log(label, 'ERR', String(e.message || e).slice(0, 120)); }
  }
}
main();
