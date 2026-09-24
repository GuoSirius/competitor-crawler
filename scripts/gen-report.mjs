import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const inv = JSON.parse(fs.readFileSync(path.join(REPO, 'data/seeds/crawl-inventory.json'), 'utf-8'));

function fmt(u) {
  const r = u;
  const det = (r.sampleDetails || [])[0] || '';
  return {
    url: r.url,
    status: r.status || ('ERR:' + (r.error || '?')),
    bytes: r.bytes || 0,
    sel: r.bestSelector || '-',
    n: r.bestCount || 0,
    det: det ? det.replace(/^https?:\/\//, '').slice(0, 70) : '-',
    pag: r.paginationHref ? '有' : '无',
    price: r.hasPrice ? '有' : '无',
  };
}

const groups = { SERVER_LIST: [], BLOCKED_WAF: [], LANDING_ONLY: [], UNREACHABLE: [] };
for (const c of inv) (groups[c.verdict] || (groups[c.verdict] = [])).push(c);

let md = '# 竞品待爬清单（Crawl Target Inventory）\n\n';
md += `> 生成自 \`data/seeds/crawl-inventory.json\`（探针实测）。\n`;
md += `> 判定口径：SERVER_LIST=服务端渲染出产品列表（可直接 YAML 抓取）；LANDING_ONLY=可达但首屏未列出产品（可能需点进子分类/JS 渲染）；BLOCKED_WAF=反爬拦截；UNREACHABLE=超时/连接失败/证书。\n\n`;

const counts = {};
for (const k of Object.keys(groups)) counts[k] = groups[k].length;
md += `## 总览\n\n| 判定 | 公司数 |\n|---|---|\n`;
for (const k of ['SERVER_LIST', 'LANDING_ONLY', 'BLOCKED_WAF', 'UNREACHABLE']) md += `| ${k} | ${counts[k] || 0} |\n`;
md += `\n> 说明：Excel 原「竞品品类链接」列本是示范，现已被修正为真实品类/列表 URL（修复 \`cellUrl\` 误读 \`hl.target\` 的 bug，提交 d3ac044 之后）。本清单即据此 URL 实测。\n\n`;

for (const k of ['SERVER_LIST', 'LANDING_ONLY', 'BLOCKED_WAF', 'UNREACHABLE']) {
  const list = groups[k] || [];
  if (!list.length) continue;
  md += `## ${k}（${list.length}）\n\n`;
  for (const c of list) {
    md += `### ${c.company}\n- 官网：${c.website}\n`;
    for (const u of c.urls) {
      const f = fmt(u);
      md += `  - 列表页：${f.url}\n    - 状态 ${f.status} / ${f.bytes}B / 产品容器 \`${f.sel}\`(×${f.n}) / 分页 ${f.pag} / 价格信号 ${f.price}`;
      if (f.det !== '-') md += `\n    - 详情示例：${f.det}`;
      md += `\n`;
    }
    md += `\n`;
  }
}
fs.writeFileSync(path.join(REPO, 'data/seeds/crawl-targets.md'), md, 'utf-8');
console.log('wrote data/seeds/crawl-targets.md', md.length, 'bytes');
console.log('SERVER_LIST companies:', (groups.SERVER_LIST || []).map((c) => c.company).join(' | '));
