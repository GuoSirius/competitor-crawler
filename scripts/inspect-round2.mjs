import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(REPO, 'packages', 'crawler', 'package.json'));
const cheerio = require('cheerio');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function fetchText(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: ctrl.signal });
    clearTimeout(t);
    return { status: res.status, html: Buffer.from(await res.arrayBuffer()).toString('utf-8'), final: res.url };
  } catch (e) { clearTimeout(t); return { status: 0, html: '', error: String(e.message || e).slice(0, 80) }; }
}

/** 找「产品卡片」：含详情 pattern 链接 + (img 或 名称文本) 的最小共同容器 */
const DET = /\/product\/|\/products\/|\/goods\/|\/item\/|\/p-|\/p\/|\/detail|\.html\?id=|\/prod\//i;
const EXC = /cart|login|register|about|news|article|contact|javascript:|mailto:|tel:|service|solution|support/i;

function cards(html, base) {
  const $ = cheerio.load(html);
  // 统计每个祖先元素下「独立详情链接」数量，找密度最高的层级
  const detailAnchors = [];
  $('a[href]').each((_, a) => {
    const h = $(a).attr('href') || '';
    if (DET.test(h) && !EXC.test(h)) detailAnchors.push({ a, href: h });
  });
  if (!detailAnchors.length) return { n: 0 };
  // 卡片 = 每个锚点的祖先里「包含>=2个锚点的最小元素」的共同父级；简化：取锚点向上第2层并按签名聚类
  const sigCount = {};
  for (const { a } of detailAnchors) {
    let el = a;
    for (let i = 0; i < 2; i++) { const p = $(el).parent(); if (!p.length) break; el = p[0]; }
    if (!el || el.tagName === 'body' || el.tagName === 'html') continue;
    const cls = ($(el).attr('class') || '').split(/\s+/).slice(0, 3).join('.');
    const sig = el.tagName + (cls ? '.' + cls : '');
    sigCount[sig] = (sigCount[sig] || 0) + 1;
  }
  const top = Object.entries(sigCount).sort((x, y) => y[1] - x[1]).slice(0, 4);
  // 用第一签名的选择器试抽 3 张卡片
  let samples = [];
  if (top.length) {
    const sel = top[0][0].replace(/\./g, '.');
    try {
      $(sel).slice(0, 3).each((_, el) => {
        const a = $(el).find('a[href]').filter((_, x) => DET.test($(x).attr('href') || '')).first();
        samples.push({
          href: (a.attr('href') || '').slice(0, 60),
          text: $(el).text().replace(/\s+/g, ' ').trim().slice(0, 80),
          hasImg: $(el).find('img').length > 0,
        });
      });
    } catch {}
  }
  return { n: detailAnchors.length, top, samples };
}

const TARGETS = [
  ['联科-流式抗体', 'https://www.liankebio.com/product-category/fcm/fcm-antibody'],
  ['联科-ELISA', 'https://www.liankebio.com/product-category/elisa/elisa-kit'],
  ['格锐思-page2(真实URL验证)', 'https://www.geruisi-bio.com/products/463.html?page=2&prop_filter=%7b%7d'],
  ['盒子生工-page2(真实URL验证)', 'https://www.boxbio.cn/products/762/?page=2&prop_filter=%7B%7D'],
  ['海狸-page2(真实URL验证)', 'https://www.beaverbio.com/products/index/952.html?page=2'],
  ['江莱-首页找分类', 'http://www.jonln.com/'],
  ['赛业-首页找分类', 'https://www.oricellbio.cn/'],
  ['Cytiva-品类页', 'https://learning.cytivalifesciences.com.cn/product/category/cell-culture-and-fermentation/media-and-feeds/'],
  ['Promega-品类页', 'https://www.promega.com.cn/products/cell-health-assays/'],
];

for (const [label, url] of TARGETS) {
  const r = await fetchText(url);
  console.log('\n===== ' + label + ' ===== status ' + r.status + ' bytes ' + r.html.length + (r.final !== url ? ' → ' + r.final : ''));
  if (!r.html) { console.log('  ERR', r.error); continue; }
  const c = cards(r.html, url);
  console.log('  详情链接数:', c.n, '| 卡片签名:', (c.top || []).map(([k, v]) => k + '(' + v + ')').join(' | '));
  for (const s of (c.samples || [])) console.log('    card:', s.href, '| img:' + s.hasImg, '|', s.text.slice(0, 60));
  // 分类候选（江莱/赛业找真实列表页）
  if (/江莱|赛业/.test(label)) {
    const $ = cheerio.load(r.html);
    const cats = new Set();
    $('a[href]').each((_, a) => {
      const h = $(a).attr('href') || '';
      const t = $(a).text().replace(/\s+/g, '').trim();
      if (/product|goods|list|catalog/i.test(h) && !/\.pdf|javascript:|mailto/i.test(h) && t && t.length < 12) cats.add(t + ' → ' + h.slice(0, 60));
    });
    [...cats].slice(0, 15).forEach((x) => console.log('    cat:', x));
  }
}
