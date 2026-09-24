import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(REPO, 'packages', 'crawler', 'package.json'));
const cheerio = require('cheerio');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function ft(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' });
  return Buffer.from(await res.arrayBuffer()).toString('utf-8');
}

const T = [
  ['联科卡片', 'https://www.liankebio.com/product-category/fcm/fcm-antibody', 'div.product-inner'],
  ['格锐思-产品卡?', 'https://www.geruisi-bio.com/products/463.html?page=2&prop_filter=%7b%7d', 'div.pro_description'],
  ['格锐思-tr', 'https://www.geruisi-bio.com/products/463.html?page=2&prop_filter=%7b%7d', 'tbody tr'],
  ['盒子生工-product_header', 'https://www.boxbio.cn/products/762/?page=2&prop_filter=%7B%7D', 'div.product_header'],
  ['盒子生工-tr', 'https://www.boxbio.cn/products/762/?page=2&prop_filter=%7B%7D', 'tbody tr'],
  ['海狸-grid-inner', 'https://www.beaverbio.com/products/index/952.html?page=2', 'div.grid-inner'],
  ['Cytiva-woo卡', 'https://learning.cytivalifesciences.com.cn/product/category/cell-culture-and-fermentation/media-and-feeds/', 'ul.products li.product'],
  ['江莱-列表页', 'http://www.jonln.com/products/1536.html', null],
];

for (const [label, url, sel] of T) {
  console.log('\n===== ' + label + ' =====');
  try {
    const html = await ft(url);
    const $ = cheerio.load(html);
    if (!sel) {
      // 江莱：找产品链接 pattern
      const hrefs = new Set();
      $('a[href]').each((_, a) => { const h = $(a).attr('href') || ''; if (/goods|product|shop|item/i.test(h)) hrefs.add(h); });
      [...hrefs].slice(0, 8).forEach((h) => console.log('  link:', h.slice(0, 70)));
      continue;
    }
    const n = $(sel).length;
    console.log('  count:', n);
    $(sel).slice(0, 2).each((_, el) => console.log('  HTML:', $(el).toString().replace(/\s+/g, ' ').slice(0, 420)));
  } catch (e) { console.log('  ERR', String(e.message || e).slice(0, 100)); }
}
