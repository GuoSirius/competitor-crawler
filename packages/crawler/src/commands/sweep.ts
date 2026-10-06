import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dataDir } from '@competitor-crawler/shared';
import { fetchPage, ChallengeError } from '../fetch/page.js';
import { loadSiteConfig, expandProxyVar } from '../config/loader.js';
import type { ChallengeKind } from '../fetch/antiBot.js';
import { Progress } from '../util/progress.js';

/**
 * 批量反爬复探（sweep）：对 docs/14 C 类（WAF 拦截）站点逐个试抓，
 * 回答「哪种模式能过、过了之后有没有内容」，为把站点从 C 类升级提供证据。
 *
 * 与 probe 的区别：probe 依赖站点 YAML 适配器（须先 gen-site）；
 * sweep 不需要任何配置，只做「可达性 + 挑战页 + 内容量」三件事。
 *
 * 用法：
 *   pnpm sweep --group c                    # 预设 C 类全集（从 crawl-inventory.json 匹配）
 *   pnpm sweep --domain x --url <u>         # 单站单 URL
 *   pnpm sweep --group c --mode browser         # 只试 browser（默认 both：ssr → browser 各一轮）
 *   pnpm sweep --group c --limit 3          # 只跑前 N 个（冒烟）
 *   pnpm sweep --group c --headless true    # 无头跑（默认有头，更隐蔽）
 */

export interface SweepTarget {
  company: string;
  /** 探测入口（取 crawl-inventory 里记录的问题页/产品页，更能代表抓取目标） */
  url: string;
  /** 第二入口（首页），可达性交叉验证 */
  home: string;
}

/** docs/14 C 类 + 复探 🔴/⏳ 组的公司名关键词（大小写/中英都收，includes 匹配） */
const GROUP_KEYWORDS: Record<string, string[]> = {
  c: [
    'CST', 'Cell Signaling', 'Miltenyi', '华安', 'Huabio', '索莱宝', 'Solarbio',
    'Beckman', 'BioLegend', 'Cytion', 'PromoCell', 'MCE', 'MedChem', '义翘', 'Sino',
    'Leinco', 'Promega', '富衡', '海星', 'Hycyte', 'Fudancell', '赛默飞', 'Thermo',
    'ScienCell', '默克', 'Merck', '康宁', 'Corning', '四正柏', 'CUSABIO', 'RayBiotech',
    'Dojindo', 'Bio X Cell', 'BioXCell', 'BD', 'Becton', '美森', 'STEMCELL', 'Capricorn',
    'Abcam', 'BioAssay',
  ],
};

interface InventoryEntry {
  company: string;
  website: string;
  urls: Array<{ url: string; status?: number }>;
}

function loadInventory(): InventoryEntry[] {
  const p = join(dataDir, 'seeds', 'crawl-inventory.json');
  return JSON.parse(readFileSync(p, 'utf-8')) as InventoryEntry[];
}

function buildTargets(group: string, inventory: InventoryEntry[]): SweepTarget[] {
  const kws = GROUP_KEYWORDS[group];
  if (!kws) throw new Error(`未知分组 ${group}（可用：${Object.keys(GROUP_KEYWORDS).join('/')}）`);
  const out: SweepTarget[] = [];
  for (const e of inventory) {
    if (!kws.some((k) => e.company.includes(k))) continue;
    const productUrl = e.urls[0]?.url ?? e.website;
    out.push({ company: e.company, url: productUrl, home: e.website });
  }
  return out;
}

export interface SweepRow {
  company: string;
  url: string;
  mode: 'ssr' | 'browser';
  /** OK / HTTP 403 / CHALLENGED[cloudflare] / ERR:… */
  result: string;
  kind?: string;
  bytes: number;
  title: string;
  /** <a href> 锚点总数（过了 WAF 才有意义；0=拿到壳但没内容） */
  anchors: number;
  /** 产品详情锚点数（启发式：href 含 /product /goods /p/ /item /detail /sku）——
   *  「可配置性」的核心判据：>=10 视为结构明确可解析，1~9 部分明确，0 为壳/需换入口 */
  productAnchors: number;
  seconds: number;
}

/** 产品详情链接启发式匹配（宁漏勿误：只认高置信度词根） */
const PRODUCT_HREF_RE = /href="([^"]*(?:\/product|\/goods|\/p\/|\/item|\/detail|sku)[^"]*)"/gi;

async function sweepOne(t: SweepTarget, mode: 'ssr' | 'browser', headless: boolean): Promise<SweepRow> {
  const progress = new Progress();
  const t0 = Date.now();
  // 代理：按目标 URL 主机名找站点 YAML，有 proxy 就走（复现用户 VPN 视角）；无对应配置则直连。
  // 否则 C 类复探会拿沙箱直连 IP 去抓，被 CF 按 IP 拦的站永远扫不出「可达」。
  let proxy: string | undefined;
  try {
    const host = new URL(t.url).hostname;
    proxy = expandProxyVar(loadSiteConfig(host).proxy) || undefined;
  } catch {
    /* 无对应站点配置 → 直连 */
  }
  const base: SweepRow = {
    company: t.company, url: t.url, mode, result: 'ERR', bytes: 0, title: '', anchors: 0,
    productAnchors: 0, seconds: 0,
  };
  try {
    const html = await fetchPage(t.url, mode, progress, undefined, { headless, stealth: { proxy } });
    // 挑战判定已内置于 fetchPage（分层检测：响应头/可见文本/DOM 控件/状态码），
    // 这里不再用旧正则重复分类——重复分类曾把 BD/赛业等带 reCAPTCHA 组件的正常页误标 CHALLENGED。
    // 只保留伪放行标记（sweep 实测：MCE browser 返回 39B 空壳却被判 OK）。
    const suspect = html.length < 500;
    return {
      ...base,
      result: suspect ? 'SUSPECT(伪放行?)' : 'OK',
      kind: undefined,
      bytes: html.length,
      title: /<title[^>]*>([^<]{0,120})/i.exec(html)?.[1]?.trim() ?? '',
      anchors: html.match(/<a\s+[^>]*href/gi)?.length ?? 0,
      productAnchors: new Set((html.match(PRODUCT_HREF_RE) ?? []).map((m) => m.replace(/^href="/, '').replace(/"$/, ''))).size,
      seconds: Math.round((Date.now() - t0) / 100) / 10,
    };
  } catch (e) {
    const raw = (e as Error).message;
    const msg = raw.slice(0, 80);
    // 有头模式下「窗口被关」几乎都是人手动关的（过盾等待 180s 期间最常见）：
    // 不说清会被误读成站点反爬，实际是脚本跑到一半没人窗口了
    const closed = /browser has been closed|has been closed|browserContext.close/i.test(raw);
    return {
      ...base,
      result: e instanceof ChallengeError ? `CHALLENDED[${e.kind}]` : closed ? 'ERR: 浏览器窗口被关闭' : `ERR: ${msg}`,
      seconds: Math.round((Date.now() - t0) / 100) / 10,
    };
  }
}

export async function sweep(flags: Record<string, unknown>): Promise<void> {
  const group = typeof flags.group === 'string' ? flags.group : '';
  const domain = typeof flags.domain === 'string' ? flags.domain : undefined;
  const singleUrl = typeof flags.url === 'string' ? flags.url : undefined;
  const mode = (typeof flags.mode === 'string' ? flags.mode : 'both') as 'ssr' | 'browser' | 'both';
  if (mode !== 'ssr' && mode !== 'browser' && mode !== 'both') {
    console.error(`[sweep] --mode 取值无效：'${mode}'（可选：ssr / browser / both）`);
    if (mode === 'spa') console.error('        旧名 spa 已于 2026-10-05 更名为 browser，请改用 --mode browser');
    process.exit(1);
  }
  const limit = Number(flags.limit ?? 0) || Number.POSITIVE_INFINITY;
  const headless = flags.headless === 'true' || flags.headless === true;

  let targets: SweepTarget[];
  if (domain && singleUrl) {
    targets = [{ company: domain, url: singleUrl, home: singleUrl }];
  } else {
    const inventory = loadInventory();
    // --all：全量（inventory 里所有公司）；否则按 group 关键词过滤
    targets = flags.all ? inventory.map((e) => ({ company: e.company, url: e.urls[0]?.url ?? e.website, home: e.website })) : buildTargets(group, inventory);
  }
  // --only <关键词1,关键词2>：只跑命中的站（重跑失败组用，如首轮 CHALLENGED 组）
  const onlyRaw = typeof flags.only === 'string' ? flags.only : '';
  const only = onlyRaw.split(',').map((s) => s.trim()).filter(Boolean);
  if (only.length > 0) targets = targets.filter((t) => only.some((k) => t.company.includes(k)));
  const shown = targets.slice(0, limit);
  console.log(`\n[sweep] 目标 ${shown.length}/${targets.length} 站 · 模式 ${mode} · headless=${headless}\n`);

  const modes: Array<'ssr' | 'browser'> = mode === 'both' ? ['ssr', 'browser'] : [mode];
  const rows: SweepRow[] = [];
  for (const t of shown) {
    for (const m of modes) {
      process.stdout.write(`  → ${t.company} [${m}] ${t.url} … `);
      const r = await sweepOne(t, m, headless);
      rows.push(r);
      console.log(`${r.result} · ${r.bytes}B · ${r.anchors} anchors · 产品${r.productAnchors} · ${r.seconds}s`);
      // 智能跳过：ssr 已 OK 且产品锚点 ≥10（结构明确可解析），browser 大概率是重复劳动，跳过省一半时间
      if (m === 'ssr' && mode === 'both' && r.result === 'OK' && r.productAnchors >= 10) break;
    }
  }

  // ── 站点级四类汇总（用户口径：可成功/不成功/可明确配置/部分明确/完全不明确）──
  type SiteVerdict = { company: string; mode: 'ssr' | 'browser'; result: string; category: string };
  const byCompany = new Map<string, SweepRow[]>();
  for (const r of rows) {
    const arr = byCompany.get(r.company) ?? [];
    arr.push(r);
    byCompany.set(r.company, arr);
  }
  const verdicts: SiteVerdict[] = [];
  for (const [company, rs] of byCompany) {
    // 取该站最佳一行：OK 优先，产品锚点多者优先，browser 优先于 ssr（同锚点时 browser 内容更全）
    const okRows = rs.filter((r) => r.result === 'OK');
    const best = okRows.sort((a, b) => (b.productAnchors - a.productAnchors) || (a.mode === 'browser' ? -1 : 1))[0];
    const row = best ?? rs[0]!;
    let category: string;
    if (row.result !== 'OK') category = `❌ 不成功（${row.result}）`;
    else if (row.productAnchors >= 10) category = `✅ 可明确配置（${row.mode}，产品锚点 ${row.productAnchors}）`;
    else if (row.productAnchors >= 1) category = `🔶 部分明确（${row.mode}，产品锚点 ${row.productAnchors}，需换入口/下钻）`;
    else category = `❓ 结构不明确（${row.mode}，无产品锚点：壳/懒加载/接口形态）`;
    verdicts.push({ company, mode: row.mode, result: row.result, category });
  }

  // 报告落盘：.tmp/sweep/sweep-<stamp>.md（.tmp 整体 gitignore，临时产物不进仓库）
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const outDir = join(dataDir, '..', '.tmp', 'sweep');
  const outPath = join(outDir, `sweep-${stamp}.md`);
  mkdirSync(outDir, { recursive: true });
  const lines = [
    `# sweep 复探报告 ${stamp}`,
    '',
    `模式 ${mode} · headless=${headless} · 目标 ${shown.length} 站`,
    '',
    '## 站点级结论（四类清单）',
    '',
    '| 公司 | 结论 | 最佳通道 | 原始结果 |',
    '|---|---|---|---|',
    ...verdicts.map((v) => `| ${v.company} | ${v.category} | ${v.mode} | ${v.result} |`),
    '',
    '## 明细',
    '',
    '| 公司 | 模式 | 结果 | 字节 | title | 锚点 | 产品锚点 | 耗时s |',
    '|---|---|---|---|---|---|---|---|',
    ...rows.map((r) =>
      `| ${r.company} | ${r.mode} | ${r.result} | ${r.bytes} | ${(r.title || '—').replace(/\|/g, '/')} | ${r.anchors} | ${r.productAnchors} | ${r.seconds} |`,
    ),
    '',
    '> 判读：产品锚点 = href 含 /product /goods /p/ /item /detail /sku 的去重链接数（启发式）。',
    '> ✅ ≥10 结构明确可解析；🔶 1~9 需换入口/下钻；❓ 0 为壳/懒加载/接口形态；❌ CHALLENGED/ERR 未可达。',
  ];
  writeFileSync(outPath, lines.join('\n'), 'utf-8');
  console.log(`\n[sweep] 报告已写入 ${outPath}`);
  // 控制台也打四类摘要
  const cat = (s: string) => verdicts.filter((v) => v.category.startsWith(s)).map((v) => v.company);
  console.log(`\n✅ 可明确配置 ${cat('✅').length} 站：${cat('✅').join('、') || '—'}`);
  console.log(`🔶 部分明确 ${cat('🔶').length} 站：${cat('🔶').join('、') || '—'}`);
  console.log(`❓ 结构不明确 ${cat('❓').length} 站：${cat('❓').join('、') || '—'}`);
  console.log(`❌ 不成功 ${cat('❌').length} 站：${cat('❌').join('、') || '—'}`);
  // 窗口被关的排障提示：有头模式下脚本全程依赖那个窗口（等人工过盾用），中途关掉只能重跑
  const closed = rows.filter((r) => r.result.includes('浏览器窗口被关闭'));
  if (closed.length > 0) {
    console.log(
      `\n⚠️ ${closed.length} 次「浏览器窗口被关闭」：脚本运行期间请勿关闭/最小化浏览器窗口` +
        `（有头模式要靠它等人工过盾），改动后重跑即可，属站点无关问题。`,
    );
  }
}
