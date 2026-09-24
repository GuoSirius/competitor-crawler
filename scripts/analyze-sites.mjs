import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(REPO, 'packages', 'crawler', 'package.json'));
const cheerio = require('cheerio');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const inv = JSON.parse(fs.readFileSync(path.join(REPO, 'data/seeds/crawl-inventory.json'), 'utf-8'));
const OUT_DIR = path.join(REPO, '.tmp', 'site-analysis');
fs.mkdirSync(OUT_DIR, { recursive: true });

const DETAIL_RE = /\/product\/|\/products\/|\/goods\/|\/item\/|\/p-|\/p\/|\/detail|\/mall\/|\.html\?id=|\/prod\//i;
const EXCLUDE_RE = /cart|login|register|about|news|article|contact|category|list\/?$|javascript:|mailto:|tel:/i;

function abs(base, h) {
  try { return new URL(h, base).href; } catch { return h; }
}

async function fetchText(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'zh-CN,en;q=0.8' }, redirect: 'follow', signal: ctrl.signal });
    clearTimeout(t);
    const buf = Buffer.from(await res.arrayBuffer());
    return { status: res.status, html: buf.toString('utf-8'), finalUrl: res.url };
  } catch (e) {
    clearTimeout(t);
    return { status: 0, html: '', error: String(e.message || e).slice(0, 100) };
  }
}

/** 从列表页提取：详情链接模式 + 每条锚点的祖先容器链（tag.class），取最频繁的「卡片级」容器 */
function analyzeList(url, html) {
  const $ = cheerio.load(html);
  const anchors = [];
  $('a[href]').each((_, a) => {
    const h = $(a).attr('href') || '';
    if (DETAIL_RE.test(h) && !EXCLUDE_RE.test(h)) anchors.push({ href: abs(url, h), el: a });
  });
  if (anchors.length === 0) return { detailAnchors: 0 };

  // href 模式聚类：把数字/编码替换成 *，取最多同类
  const patOf = (h) => h.replace(/^https?:\/\/[^/]+/, '').replace(/[\w-]{3,}/g, '*').replace(/\/$/, '') || '/';
  const patCount = {};
  for (const a of anchors) patCount[patOf(a.href)] = (patCount[patOf(a.href)] || 0) + 1;
  const bestPat = Object.entries(patCount).sort((x, y) => y[1] - x[1])[0];
  const mainAnchors = anchors.filter((a) => patOf(a.href) === bestPat[0]).slice(0, 40);

  // 卡片容器：从锚点向上找，直到该容器内的同类锚点数不再增长；记录 2~4 级祖先链
  const chainCount = {};
  for (const a of mainAnchors) {
    let el = a.el;
    const chain = [];
    for (let i = 0; i < 4; i++) {
      const p = $(el).parent();
      if (!p.length || p[0].tagName === 'body' || p[0].tagName === 'html') break;
      el = p[0];
      const cls = ($(el).attr('class') || '').trim().split(/\s+/).slice(0, 3).join('.');
      chain.push(el.tagName + (cls ? '.' + cls : ''));
    }
    const key = chain.slice(0, 2).join(' > ');
    if (key) chainCount[key] = (chainCount[key] || 0) + 1;
  }
  const topChains = Object.entries(chainCount).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([k, v]) => `${k} (${v})`);

  // 名称：锚点文本或其子元素
  const sample = mainAnchors.slice(0, 3).map((a) => ({
    href: a.href.replace(/^https?:\/\/[^/]+/, ''),
    text: $(a.el).text().replace(/\s+/g, ' ').trim().slice(0, 60),
  }));

  // 分页
  const pags = new Set();
  $('a[href]').each((_, a) => {
    const h = $(a).attr('href') || '';
    if (/[?&]page=|page\/\d+|pageNum|pagenum|&p=/i.test(h)) pags.add(abs(url, h).split('#')[0]);
  });
  const pagReal = [...pags].slice(0, 2);
  const pagJs = /\bpage\s*[:=]\s*\d|javascript:void\(0\)\?page=/i.test(html) && pagReal.length === 0 ? ['javascript:void(0)?page=N（JS 翻页）'] : [];

  return { detailAnchors: anchors.length, pattern: bestPat[0], patternCount: bestPat[1], chains: topChains, sample, paginationReal: pagReal, paginationJs: pagJs };
}

/** 详情页：name/price/sku 的最小候选元素（tag.class + 文本样例） */
function analyzeDetail(html) {
  const $ = cheerio.load(html);
  const out = {};
  const smallest = (pred) => {
    let best = null, bestLen = 1e9;
    $('*').each((_, el) => {
      if (['script', 'style', 'head', 'html', 'body'].includes(el.tagName)) return;
      const own = $(el).clone().children().remove().end().text();
      const t = own.replace(/\s+/g, ' ').trim();
      if (t && pred(t) && t.length < bestLen) { bestLen = t.length; best = { el, t }; }
    });
    if (!best) return null;
    const cls = ($(best.el).attr('class') || '').trim().split(/\s+/).slice(0, 4).join('.');
    const id = $(best.el).attr('id');
    return { sel: best.el.tagName + (id ? '#' + id : '') + (cls ? '.' + cls : ''), text: best.t.slice(0, 60) };
  };
  out.h1 = $('h1').first().text().replace(/\s+/g, ' ').trim().slice(0, 80) || null;
  out.price = smallest((t) => /[¥￥$]\s*[\d,]+(\.\d+)?/.test(t) || /价格[:：]\s*[\d.]/.test(t));
  out.sku = smallest((t) => /货号|Cat\.?\s*No|Catalog|SKU|型号|Item\s*No/i.test(t) && t.length < 60);
  // JSON-LD（形态 C 信号）
  const ld = $('script[type="application/ld+json"]').first().text();
  out.hasJsonLd = ld ? ld.slice(0, 120) : null;
  return out;
}

async function main() {
  const results = [];
  const targets = inv.filter((c) => c.verdict === 'SERVER_LIST');
  let done = 0;
  for (const c of targets) {
    const entry = { company: c.company, website: c.website, urls: [] };
    for (const uo of c.urls.slice(0, 2)) {
    const u = uo.url;
      const r = await fetchText(u);
      if (!r.html) { entry.urls.push({ url: u, error: r.error || r.status }); continue; }
      const list = analyzeList(u, r.html);
      const item = { url: u, ...list };
      // 抓第一个详情页
      if (list.sample && list.sample.length > 0) {
        const detHref = list.sample[0].href.startsWith('http') ? list.sample[0].href : new URL(list.sample[0].href, u).href;
        const d = await fetchText(detHref);
        if (d.html) item.detail = { url: detHref, ...analyzeDetail(d.html) };
      }
      entry.urls.push(item);
    }
    results.push(entry);
    done++;
    process.stderr.write(`[${done}/${targets.length}] ${c.company}\n`);
  }
  fs.writeFileSync(path.join(OUT_DIR, 'site-analysis.json'), JSON.stringify(results, null, 2), 'utf-8');
  console.log('wrote', path.join(OUT_DIR, 'site-analysis.json'));
}
main().catch((e) => { console.error(e); process.exit(1); });
