import fs from 'node:fs';
const seeds = JSON.parse(fs.readFileSync('data/seeds/seeds.json', 'utf-8'));
const byCo = new Map();
for (const s of seeds) {
  if (!byCo.has(s.companyName)) byCo.set(s.companyName, []);
  byCo.get(s.companyName).push(s);
}
let withHyper = 0, without = 0, totalCats = 0;
const rows = [];
for (const [co, list] of byCo) {
  const web = list[0].website || '';
  let realHref = 0;
  for (const s of list) {
    totalCats++;
    const cr = s.sourceRow || {};
    const linkCell = cr['竞品品类链接'] || cr['品类链接'] || null;
    let href = null;
    if (linkCell && typeof linkCell === 'object') href = linkCell.hyperlink || linkCell.target || null;
    if (typeof linkCell === 'string' && /^https?:/i.test(linkCell)) href = linkCell;
    const isReal = href && href !== web && /^https?:\/\//.test(href);
    if (isReal) realHref++;
  }
  const has = realHref > 0;
  if (has) withHyper++; else without++;
  rows.push({ company: co, website: web, nCats: list.length, realHref, hasReal: has });
}
console.log('companies:', byCo.size, '| categories:', totalCats);
console.log('companies WITH real excel hyperlink:', withHyper);
console.log('companies WITHOUT (need web discovery):', without);
console.log('\n--- companies WITHOUT real hyperlink (need discovery) ---');
for (const r of rows.filter((r) => !r.hasReal)) console.log('  ' + r.company + '  web=' + r.website);
console.log('\n--- companies WITH real hyperlink (recoverable) ---');
for (const r of rows.filter((r) => r.hasReal)) console.log('  ' + r.company + '  realHref=' + r.realHref + '/' + r.nCats);
