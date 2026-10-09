import yaml from 'yaml';
import { fetchPage, type RenderMode } from '../fetch/page.js';
import { assessChallenge } from '../fetch/challenge.js';
import { loadSiteConfig, saveSiteConfig, expandProxyVar } from '../config/loader.js';
import { chat } from '../llm/client.js';
import { loadPrompt } from '../llm/prompts.js';
import { parseListWithConfig, parseDetailWithConfig } from '../adapter/yamlAdapter.js';
import { Progress } from '../util/progress.js';
import type { SiteConfig } from '../config/types.js';

export interface GenSiteOpts {
  domain: string;
  /** 列表页 URL；省略时回退到已存在 YAML 的 startUrl（桩文件填充场景：只写 startUrl 即可） */
  listUrl?: string;
  detailUrl?: string;
  companyKey?: string;
  competitorType?: string;
  role?: string;
  currency?: string;
  render?: string;
  notes?: string;
  /** 市场部简称标签（写入 YAML companyShort），仅展示用；模型不生成，由 CLI/Excel 传入 */
  companyShort?: string;
}

const SYSTEM_PROMPT = loadPrompt('gen-site');
const DEFAULT_CURRENCY = 'CNY';

/**
 * 模型驱动的站点配置生成：给定站点信息（用户评估后提供），
 * 抓取页面 → 调模型（MODEL_MODE，temp=0）→ 产出 YAML → 写盘 → 提示用 probe 验证。
 * 用户直接拿产出做测试/验证/微调，快速完成站点新增或更新。
 *
 * 安全合并：若 config/sites/<domain>.yaml 已存在（用户已手写身份字段），模型产出只覆盖解析相关字段，
 * 身份字段按「CLI/Excel 传入 > 模型 > 已存在文件」兜底，避免误删用户手填的 currency/role/company 等。
 */
export async function genSite(opts: GenSiteOpts): Promise<void> {
  let existing: SiteConfig | null = null;
  try {
    existing = loadSiteConfig(opts.domain);
  } catch {
    existing = null;
  }
  const mode0: RenderMode =
    (opts.render as RenderMode) ?? (existing?.render as RenderMode) ?? 'auto';
  try {
    await genSiteOnce(opts, existing, mode0);
  } catch (e) {
    const msg = (e as Error)?.message ?? '';
    // auto 智能回退（2026-10-09）：auto 静态通道抓到的是「SPA 大壳 / 被拦兜页」时，模型看不到
    // 商品结构只能报 NEED_MORE_HTML 或「疑似被拦截」——自动改 browser 渲染重试一轮。
    // 显式 --render ssr/browser 是明确意图，不自动改道（重试后仍失败则抛出原始错误）。
    if (mode0 === 'auto' && /NEED_MORE_HTML|疑似被拦截/.test(msg)) {
      console.log('[gen-site] auto 通道拿不到商品结构（SPA 壳/被拦兜页），自动改 browser 渲染重试一轮…');
      await genSiteOnce(opts, existing, 'browser');
      return;
    }
    throw e;
  }
}

/** 单轮生成（fetch → 诊断前置 → 模型 → 回验 → 写盘）。mode 由调用方给定：auto 失败后可换 browser 再来一轮 */
async function genSiteOnce(opts: GenSiteOpts, existing: SiteConfig | null, mode: RenderMode): Promise<void> {
  const progress = new Progress();

  // 列表页 URL：优先用 --list-url；桩文件填充场景下回退到已存在 YAML 的 startUrl
  const listUrl = opts.listUrl ?? existing?.startUrl;
  if (!listUrl) {
    throw new Error('gen-site 需要 --list-url <url>，或在已存在的 config/sites/<domain>.yaml 中配置 startUrl');
  }

  // 生成阶段复用桩文件的代理决策：桩里写了 `proxy: '${CRAWL_PROXY}'`，就经代理抓取（复现用户浏览器视角），
  // 否则直连。否则 gen-site 永远拿沙箱直连 IP 去抓，被 CF 等按 IP 拦截的站会在生成阶段就被挡，
  // 与「用户浏览器能开」的体感对不上（PromoCell 旧桩因此生成失败）。YAML 是代理唯一裁决方。
  const genProxy = expandProxyVar(existing?.proxy) || undefined;

  progress.update(`[gen-site] ${opts.domain} 抓取列表页 ${listUrl}${genProxy ? '（经代理）' : ''}`);
  const listHtml = await fetchPage(listUrl, mode, progress, undefined, { stealth: { proxy: genProxy } });

  // 诊断前置（2026-10-09）：把「被 WAF 拦/兜页空壳」与「页面真的没商品结构」分开——
  // 旧流程把被拦页当正常 HTML 喂模型，模型看不到商品只能报 NEED_MORE_HTML，
  // 把「先过盾/换出口」这个真因伪装成了「列表结构问题」（elabscience.cn 教训）。
  const blocked = diagnoseBlocked(listHtml);
  if (blocked) {
    throw new Error(
      `列表页疑似被拦截/空壳：${blocked}。这不是列表结构问题——` +
        `先跑 pnpm diagnose --domain ${opts.domain} 定位（挑战→过盾 / 网络层→查出口 / 其它→换渲染模式），过盾后再 gen-site`,
    );
  }

  let detailHtml = '';
  if (opts.detailUrl) {
    progress.update(`[gen-site] 抓取详情页 ${opts.detailUrl}${genProxy ? '（经代理）' : ''}`);
    detailHtml = await fetchPage(opts.detailUrl, mode, progress, undefined, { stealth: { proxy: genProxy } });
  }

  const userMsg = [
    `站点域名：${opts.domain}`,
    opts.companyKey ? `归属公司：${opts.companyKey}` : '',
    opts.competitorType ? `竞品类型：${opts.competitorType}` : '',
    opts.role ? `公司角色：${opts.role}` : '',
    opts.currency ? `币种：${opts.currency}` : '',
    `列表页 URL：${listUrl}`,
    opts.notes ? `补充说明：${opts.notes}` : '',
    '',
    '===== 列表页 HTML（已清洗/截取）=====',
    buildModelHtml(listHtml),
    opts.detailUrl ? '===== 详情页 HTML（已清洗/截取）=====\n' + buildModelHtml(detailHtml) : '',
  ]
    .filter(Boolean)
    .join('\n');

  progress.update(`[gen-site] 调用模型生成 YAML 配置…`);
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userMsg },
  ];

  // 生成 → 回验 → 打回重试闭环：把「臆造选择器 / 跑不起来的产出」在生成阶段拦住。
  // hard 违规（列表 0 条、pagination-url 缺 urlTemplate）打回重试，耗尽后拒写盘；
  // soft 违规（详情字段未命中）接受产出但写 TODO 注释提醒人工确认。
  let cfg: SiteConfig | null = null;
  let violations: ConfigViolation[] = [];
  let yamlOut = '';
  for (let attempt = 1; attempt <= MAX_GEN_ATTEMPTS; attempt++) {
    yamlOut = await chat(messages, { temp: 0 });
    cfg = parseYamlConfig(yamlOut, opts, existing);
    violations = validateConfig(cfg, listHtml, opts.detailUrl ? detailHtml : undefined);
    const hard = violations.filter((v) => v.level === 'hard');
    if (hard.length === 0) break;
    if (attempt === MAX_GEN_ATTEMPTS) {
      throw new Error(
        `gen-site 连续 ${MAX_GEN_ATTEMPTS} 次产出的配置均未通过真实页面回验（未写入任何文件，请人工检查页面结构后手写 YAML）：\n` +
          hard.map((v) => `  - ${v.message}`).join('\n'),
      );
    }
    progress.update(`[gen-site] 回验发现 ${hard.length} 项硬伤，打回重试（第 ${attempt + 1}/${MAX_GEN_ATTEMPTS} 次）…`);
    messages.push({ role: 'assistant', content: yamlOut });
    messages.push({
      role: 'user',
      content:
        `上一版 YAML 未通过真实页面校验，请修正后重新输出完整 YAML（硬规则仍然全部适用）：\n` +
        hard.map((v, i) => `${i + 1}. ${v.message}`).join('\n') +
        `\n再次强调：只允许使用上方 HTML 中真实出现的 class/id/结构；确认找不到时输出 \`itemSelector: null # NEED_MORE_HTML\`。`,
    });
  }
  cfg = cfg!;

  // soft 违规 → 文件头 TODO 注释 + 控制台提醒（写盘，但人工要知道哪些字段没验过）
  const soft = violations.filter((v) => v.level === 'soft');
  let header = '';
  if (soft.length > 0) {
    header =
      `# ⚠️ gen-site 自动生成（${new Date().toISOString().slice(0, 10)}）——以下字段在真实页面回验中未命中，人工确认选择器后再正式使用：\n` +
      soft.map((v) => `#   - ${v.message}`).join('\n') +
      '\n';
    console.log(`\n⚠️ [gen-site] ${soft.length} 项字段未通过回验（已写入文件头 TODO）：\n${soft.map((v) => `  - ${v.message}`).join('\n')}`);
  }
  const saved = saveSiteConfig(opts.domain, cfg, header);
  progress.done(`[gen-site] 已写入 ${saved}${soft.length ? `（含 ${soft.length} 项 TODO）` : '（回验全部通过）'}`);
  console.log(`\n下一步验证：pnpm probe --domain ${opts.domain} --list-url ${listUrl}`);
}

/** 喂给模型的清洗后 HTML 预算（字符）。清洗已去掉 head/style/script，100K 覆盖绝大多数列表页全文
 * （2026-10-09 从 60K 上调：大前端站 60K 窗口常截不到商品区，模型被迫报 NEED_MORE_HTML） */
const MODEL_HTML_BUDGET = 100000;

/**
 * 清洗并截取喂给模型的 HTML（gen-site 专用，导出供测试）。
 *
 * 根因背景（普诺赛案例）：完整页面 110KB+，产品卡在 62KB 处——旧实现 `slice(0, 20000)`
 * 把全部预算花在 head/style/导航上，模型根本看不到商品卡片，只能臆造选择器。
 *
 * 处理两步：
 * ① 去 head/script/style/注释 并压缩空白（head+style 常占原始 HTML 一半以上）；
 * ② 清洗后仍超预算时按「容器重复度」选窗口：同一 class 属性串在区域内反复出现（≥3 次）
 *    ≈ 同构条目容器（商品卡）——比旧「链接密度」更准（导航/页脚链接密但容器不重复），
 *    从得分最高的 2KB 块向两侧扩展拼满预算（块边界可能切断标签，模型只需看结构无需闭合）。
 * 若窗口里确实没有商品条目，模型会按 prompt 硬规则输出 NEED_MORE_HTML，调用方给出明确指引。
 */
export function buildModelHtml(html: string, budget = MODEL_HTML_BUDGET): string {
  const cleaned = html
    .replace(/<head[\s\S]*?<\/head>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned.length <= budget) return cleaned;

  const CHUNK = 2048;
  const chunks: string[] = [];
  for (let i = 0; i < cleaned.length; i += CHUNK) chunks.push(cleaned.slice(i, i + CHUNK));
  // 评分：容器重复度为主（×1000 压倒链接数），<a> 链接数作次级信号兜底（无 class 的裸链接列表）
  const score = (s: string): number => {
    const attrs = s.match(/class=["'][^"']*["']/gi) ?? [];
    const freq = new Map<string, number>();
    for (const a of attrs) {
      const k = a.toLowerCase();
      freq.set(k, (freq.get(k) ?? 0) + 1);
    }
    let repeated = 0;
    for (const c of freq.values()) if (c >= 3) repeated += c;
    return repeated * 1000 + (s.match(/<a[\s>]/gi)?.length ?? 0);
  };
  let best = 0;
  for (let i = 1; i < chunks.length; i++) if (score(chunks[i]) > score(chunks[best])) best = i;

  // 从最佳块向两侧扩展拼满预算（unshift 左块 / push 右块，保持文档顺序）
  const picked: string[] = [chunks[best]];
  let used = chunks[best].length;
  for (let step = 1; used < budget; step++) {
    let grew = false;
    const right = chunks[best + step];
    if (right && used + right.length <= budget) {
      picked.push(right);
      used += right.length;
      grew = true;
    }
    const left = chunks[best - step];
    if (left && used + left.length <= budget) {
      picked.unshift(left);
      used += left.length;
      grew = true;
    }
    if (!grew) break;
  }
  return picked.join('');
}

/**
 * 诊断前置（2026-10-09）：抓到的列表 HTML 是「被拦/空壳」还是正常列表页。
 * 两层信号：① 已知挑战特征（assessChallenge：CF/PX/封禁状态码文案）；
 * ② 未知自定义 WAF 兜页——清洗后 <a> 链接极少（正常列表页几十上百个链接）。
 * 返回非 null 即命中（值为判定依据），gen-site 据此抛错并给处置建议，
 * 不再进模型伪报 NEED_MORE_HTML（把「被拦」伪装成「没货」）。
 */
export function diagnoseBlocked(html: string): string | null {
  const a = assessChallenge({ html });
  if (a.hit && !a.falseAlarm && a.confidence !== 'none') {
    return `挑战页信号（${a.hit.kind}：${a.hit.matched}）`;
  }
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ');
  const links = (body.match(/<a[\s>]/gi) ?? []).length;
  if (links < 5) {
    return `清洗后仅 ${links} 个 <a> 链接（正常列表页几十上百），疑似 WAF 兜页/软拦空壳`;
  }
  return null;
}

/** 产出一致性校验结果。hard=跑不起来/解析 0 条（打回重试，重试耗尽拒写盘）；soft=部分字段未命中（接受但标 TODO） */
export interface ConfigViolation {
  level: 'hard' | 'soft';
  message: string;
}

/**
 * 产出配置「真实 HTML 回验」（导出供测试）：把模型产出的选择器放回真实页面跑一遍，
 * 把「臆造选择器」在生成阶段拦住，而不是等用户 probe 时才发现。
 *
 * - hard：pagination-url 缺 urlTemplate（crawl 直接 throw）/ 列表解析 0 条；
 * - soft：详情页字段全 null（可能站点本来就没有该字段，如血清页无别称 → 只标 TODO 不拒稿）。
 */
export function validateConfig(cfg: SiteConfig, listHtml: string, detailHtml?: string): ConfigViolation[] {
  const out: ConfigViolation[] = [];
  const t = cfg.listTraversal;
  if (t?.strategy === 'pagination-url' && !t?.urlTemplate) {
    out.push({ level: 'hard', message: 'listTraversal.strategy=pagination-url 但未给出 urlTemplate（crawl 会直接报错），必须含 {page} 占位' });
  }
  if (listHtml && cfg.parseList) {
    const items = parseListWithConfig(listHtml, cfg.parseList, 'default');
    if (items.length === 0) {
      out.push({ level: 'hard', message: `列表页解析 0 条（itemSelector「${cfg.parseList.itemSelector}」在真实列表页未命中）` });
    }
  }
  if (detailHtml && cfg.parseDetail?.fields) {
    // 模型可能输出 `field: null`（表示「没找到该字段」）；既有 extract 层遇 null spec 会崩，
    // 这里先过滤掉 null 声明（既不校验也不参与抽取），只验证真实声明了选择器的字段。
    const fields = Object.fromEntries(
      Object.entries(cfg.parseDetail.fields).filter(([, spec]) => spec != null),
    );
    const np = parseDetailWithConfig(detailHtml, fields);
    const rec = np as unknown as Record<string, unknown>;
    const nullKeys = Object.keys(fields).filter((k) => {
      const v = rec[k];
      return v === null || v === undefined || (Array.isArray(v) && v.length === 0);
    });
    if (nullKeys.length > 0) {
      out.push({ level: 'soft', message: `详情页字段未命中（值为空）：${nullKeys.join('、')}——若站点确实没有该字段可忽略，否则请修正选择器` });
    }
  }
  return out;
}

/** 重试上限：1 次首生成 + 最多 2 次回验打回重试 */
const MAX_GEN_ATTEMPTS = 3;

/** 从模型输出中提取 YAML：优先 ```yaml 围栏，其次任意 ``` 围栏，最后整段 */
export function extractYaml(text: string): string {
  const fenced = text.match(/```yaml\s*([\s\S]*?)```/i) ?? text.match(/```\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : text).trim();
}

/** 解析模型产出的 YAML 并补全关键字段（导出供测试；非法产出抛明确错误） */
export function parseYamlConfig(text: string, opts: GenSiteOpts, existing?: SiteConfig | null): SiteConfig {
  const yamlOut = extractYaml(text);
  const cfg = yaml.parse(yamlOut) as SiteConfig;
  if (!cfg?.parseList?.itemSelector || !cfg?.parseList?.fields?.detailUrl) {
    // 模型按 prompt 硬规则「看不到商品条目 → itemSelector: null + NEED_MORE_HTML」时给出针对性指引
    const needMore = /NEED_MORE_HTML/.test(yamlOut);
    throw new Error(
      needMore
        ? '模型反馈清洗截取后的页面 HTML 中看不到商品条目结构（NEED_MORE_HTML）。可尝试：① 换更直接的列表页 URL（含真实产品网格的页面）；② 该站可能需要 browser 渲染（--render browser 重试）。'
        : '模型产出缺少必要的 parseList（itemSelector / fields.detailUrl），请检查页面 HTML 或重试',
    );
  }
  // 补全关键字段，保证产出可直接被 probe / crawl 消费
  cfg.domain = opts.domain;
  // 代理：已存在桩写了 proxy（如走 CRAWL_PROXY）就保留，模型不感知代理、不会产出该字段，
  // 否则生成后代理配置丢失 → 后续 crawl 又退回直连被拦（PromoCell 旧桩生成后丢失代理）。
  cfg.proxy = existing?.proxy ?? cfg.proxy;
  // startUrl：CLI --list-url > 已存在 YAML 的 startUrl > 模型产出（最后兜底）。
  // 关键：写回的 startUrl 必须等于 gen-site 实际抓取的入口（opts.listUrl ?? existing.startUrl），
  // 否则 probe/crawl 会抓到与生成时不同的页面；模型产出的 startUrl 仅作缺省兜底。
  cfg.startUrl = opts.listUrl ?? existing?.startUrl ?? cfg.startUrl;
  // 身份字段兜底优先级：CLI 传入 > **已存在文件（用户手填即真相，绝不被模型覆盖）** > 模型产出 > 默认。
  // 背景（普诺赛事故）：桩里 company: 普诺赛中文站 被模型产出的 Procell 覆盖——模型只知道域名，
  // 不知道公司在中文名录里的登记名，其身份字段产出一律只作「全新站点（无 existing）」时的兜底。
  cfg.company = opts.companyKey ?? existing?.company ?? cfg.company;
  // 市场部简称：CLI/Excel 传入 > 已存在文件 > 模型产出 > 缺省不写；与 company（规范全名）区分，仅展示标签
  cfg.companyShort = opts.companyShort ?? existing?.companyShort ?? cfg.companyShort;
  cfg.competitorType = opts.competitorType ?? existing?.competitorType ?? cfg.competitorType;
  cfg.role = opts.role ?? existing?.role ?? cfg.role;
  cfg.currency = opts.currency ?? existing?.currency ?? cfg.currency ?? DEFAULT_CURRENCY;
  // 渲染模式：CLI 传入 > 已存在文件 > 模型产出 > 默认 auto；并写回 YAML，供 probe/crawl 统一复用（批量混合 ssr/browser 无需逐站指定）
  cfg.render = (opts.render as RenderMode) ?? (existing?.render as RenderMode) ?? (cfg.render as RenderMode) ?? 'auto';
  cfg.listTraversal = cfg.listTraversal ?? existing?.listTraversal ?? { strategy: 'pagination-html', maxPages: 50, fallbackToUi: true };
  cfg.parseDetail = cfg.parseDetail ?? { fields: {}, captureRest: true };
  return cfg;
}
