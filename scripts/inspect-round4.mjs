import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(REPO, 'packages', 'crawler', 'package.json'));
const cheerio = require('cheerio');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
async function ft(url){ const r=await fetch(url,{headers:{'User-Agent':UA},redirect:'follow'}); return {s:r.status, h:Buffer.from(await r.arrayBuffer()).toString('utf-8')}; }
const T=[
 ['格锐思详情','https://www.geruisi-bio.com/product/G0427W48'],
 ['盒子生工详情','https://www.boxbio.cn/product/591.html'],
 ['海狸详情','https://www.beaverbio.com/products/list/1056.html'],
 ['Cytiva叶子分类','https://learning.cytivalifesciences.com.cn/product/category/cell-culture-and-fermentation/media-and-feeds/classical-media/'],
];
for(const [label,url] of T){
  console.log('\n===== '+label+' =====');
  const {s,h}=await ft(url); console.log('status',s,'bytes',h.length);
  const $=cheerio.load(h);
  console.log('h1:',($('h1').first().text()||'-').replace(/\s+/g,' ').trim().slice(0,60));
  console.log('title:',($('title').first().text()||'-').replace(/\s+/g,' ').trim().slice(0,70));
  // 最小价格/货号元素
  const small=(pred)=>{ let best=null,bl=1e9; $('*').each((_,el)=>{ if(['script','style','head','html','body'].includes(el.tagName))return; const own=$(el).clone().children().remove().end().text().replace(/\s+/g,' ').trim(); if(own&&pred(own)&&own.length<bl){bl=own.length;best={el,own};} }); if(!best)return null; const cls=($(best.el).attr('class')||'').split(/\s+/).slice(0,4).join('.'); return best.el.tagName+'.'+cls+' ⇒ '+best.own.slice(0,50); };
  console.log('price:',small(t=>/[¥￥]\s*[\d,]+/.test(t)||/价格[:：]/.test(t))||'-');
  console.log('sku:',small(t=>/货号|Cat\.?\s*No|Catalog/i.test(t)&&t.length<50)||'-');
  console.log('jsonld:',($('script[type="application/ld+json"]').length||'-'));
  if(label==='Cytiva叶子分类'){
    const li=$('ul.products li.product'); console.log('li.product:',li.length);
    li.slice(0,2).each((_,el)=>console.log('  card:',$(el).find('a').first().attr('href'),'|',$(el).text().replace(/\s+/g,' ').trim().slice(0,60)));
  }
}
