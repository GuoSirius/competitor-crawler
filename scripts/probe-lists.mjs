import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// 仓库根 = scripts/ 上溯一级（相对脚本定位，换机器/挪目录均可用）
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(REPO, 'packages', 'crawler', 'package.json'));
const cheerio = require('cheerio');
const seeds = JSON.parse(fs.readFileSync(path.join(REPO, 'data/seeds/seeds.json'), 'utf-8'));
// 临时 HTML 统一放 .tmp/（gitignore），用完即删；只 sanitize 文件名，绝不动目录路径
const HTML_DIR = path.join(REPO, '.tmp', 'probe-html');
fs.mkdirSync(HTML_DIR, { recursive: true });
const safeName = (s) => s.replace(/[^\w.-]/g, '_');

const companies = new Map();
for (const s of seeds) {
  if (!companies.has(s.companyName)) companies.set(s.companyName, { website: s.website || '', urls: new Set() });
  companies.get(s.companyName).urls.add(s.categoryUrl);
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const CANDIDATE_SELECTORS = [
  '.product-item', '.product', '.products li', 'li.product', '[class*="product-item" i]',
  '[class*="prod-item" i]', '.item', '.goods-item', '.good', '[class*="goods" i] li',
  'a[href*="/product"]', 'a[href*="/p/"]', 'a[href*="/catalog"]', 'a[href*="/item"]',
];

function absolute(base, href) {
  try { return new URL(href, base).href; } catch { return href; }
}

function analyze($, html, base) {
  let bestSelector = null, bestCount = 0;
  for (const sel of CANDIDATE_SELECTORS) {
    const n = $(sel).length;
    if (n > bestCount) { bestCount = n; bestSelector = sel; }
  }
  const details = new Set();
  $('a[href]').each((_, a) => {
    const h = $(a).attr('href') || '';
    if (/product|products|\/p-|\/p\/|catalog|catalogue|\/item|\/detail|\/goods|\/prod|商品|产品|\/elisa|\/antibod/i.test(h) && !/^#/.test(h)) {
      details.add(absolute(base, h).split('#')[0]);
    }
  });
  const sampleDetails = [...details].slice(0, 3);
  const pages = new Set();
  $('a[href]').each((_, a) => {
    const h = $(a).attr('href') || '';
    if (/[?&]page=|[?&]p=|page\/\d+|paging|pageNum|pagenum/i.test(h)) pages.add(absolute(base, h).split('#')[0]);
  });
  const paginationHref = [...pages][0] || null;
  const hasPrice = /(￥|¥|\$|USD|EUR|price|价格|RMB|CNY)/i.test(html);
  const robots = /(cloudflare|access denied|just a moment|验证|captcha|请手动|风险警告|403 forbidden|are you a human)/i.test(html);
  return { bestSelector, bestCount, sampleDetails, paginationHref, hasPrice, robots };
}

async function fetchOne(url) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20000);
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html,*/*', 'Accept-Language': 'zh-CN,en;q=0.8' },
      redirect: 'follow', signal: ctrl.signal,
    });
    clearTimeout(t);
    const buf = Buffer.from(await res.arrayBuffer());
    return { status: res.status, bytes: buf.length, html: buf.toString('utf-8'), redirected: res.url !== url ? res.url : null };
  } catch (e) {
    return { status: 0, bytes: 0, html: '', error: String(e.message || e).slice(0, 120) };
  }
}

async function main() {
  const out = [];
  const entries = [...companies.entries()];
  const total = entries.length;
  let done = 0;
  const CONC = 8;
  async function worker() {
    while (true) {
      const e = entries.pop();
      if (!e) return;
      const [company, info] = e;
      const urls = [...info.urls].filter(Boolean);
      const urlResults = [];
      for (const u of urls) {
        const r = await fetchOne(u);
        let sig = null;
        if (r.html) {
          const $ = cheerio.load(r.html);
          sig = analyze($, r.html, u);
          if (sig.bestCount > 2 || sig.sampleDetails.length > 4) {
            const fn = path.join(HTML_DIR, `${done}_${safeName(company)}_${urlResults.length}.html`);
            try { fs.writeFileSync(fn, r.html); } catch {}
          }
        }
        urlResults.push({
          url: u, status: r.status, bytes: r.bytes, redirected: r.redirected, error: r.error || null,
          ...(sig || {}),
        });
      }
      const reachable = urlResults.filter((x) => x.status >= 200 && x.status < 400 && x.bytes > 500);
      const withList = reachable.filter((x) => (x.bestCount || 0) > 2 || (x.sampleDetails || []).length > 4);
      let verdict = 'UNREACHABLE';
      if (reachable.length === 0) verdict = 'UNREACHABLE';
      else if (withList.length > 0) verdict = 'SERVER_LIST';
      else if (reachable.some((x) => x.robots)) verdict = 'BLOCKED_WAF';
      else verdict = 'LANDING_ONLY';
      out.push({ company, website: info.website, verdict, nUrls: urls.length, urls: urlResults });
      done++;
      process.stderr.write(`[${done}/${total}] ${company}: ${verdict}\n`);
    }
  }
  await Promise.all(Array.from({ length: CONC }, () => worker()));
  out.sort((a, b) => a.company.localeCompare(b.company));
  fs.writeFileSync(path.join(REPO, 'data/seeds/crawl-inventory.json'), JSON.stringify(out, null, 2), 'utf-8');
  const counts = {};
  for (const o of out) counts[o.verdict] = (counts[o.verdict] || 0) + 1;
  console.log('\n=== VERDICT COUNTS ===');
  console.log(JSON.stringify(counts, null, 2));
  console.log('inventory -> data/seeds/crawl-inventory.json');
  console.log('html samples -> .tmp/probe-html/（用完即删）');
}

main().catch((e) => { console.error(e); process.exit(1); });
