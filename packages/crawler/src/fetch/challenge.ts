/**
 * 挑战页 / 人机验证检测：分层信号 + 反向放行（不误检、不漏检）。
 *
 * 设计依据（2026-10-02 全量 sweep 实测）：
 * - **误检**来源：关键词在 `<script>`/JSON 里出现（Promega 把 `.g-recaptcha`、`.grecaptcha-badge`、
 *   `[data-sitekey]` 写进富文本编辑器白名单）→ 只匹配整页 HTML 就会 100% 误报，
 *   脚本白等 180s 人工过盾一个不存在的盾。
 * - **漏检**来源：WAF 直接返回 403/412/429/503（Beckman、BioLegend、PromoCell、MCE 412、immocell 403），
 *   这类页面的正文里往往没有「挑战文案」，旧逻辑只记 `ERR: HTTP 403`，看不出这是拦截而非 404。
 *
 * 所以判定走「信号层 → 加权 → 反向放行」三段：
 *   1. 响应头（最可靠、零成本）：厂商专属头 cf-mitigated / x-px-* / x-alibaba…（强）
 *   2. 可见文本（innerText / title，天然排除 script+style）：挑战文案（中~强）
 *   3. 状态码（兜底）：403/412/429/503 一律视为拦截（强，kind 由头/文案细分）
 *   4. 反放行：命中弱信号但正文够长（≥500 字符）→ 判为正常页，记 falseAlarm
 *   5. 软拦兜底：无任何信号但内容极短（伪放行空壳）→ suspicious，交给上层标 SUSPECT
 */

export type ChallengeKind =
  | 'cloudflare'
  | 'aliyun'
  | 'imperva'
  | 'perimeterx'
  | 'captcha'
  | 'traffic'
  | 'unknown';

export interface ChallengeHit {
  kind: ChallengeKind;
  /** 命中的特征片段，便于日志定位 */
  matched: string;
}

export interface ChallengeInput {
  status?: number;
  /** 响应头（小写键）：来自 undici 的 res.headers 或 playwright 的 response */
  headers?: Record<string, string | undefined>;
  /** 整页 HTML（ssr 通道；含 script，仅作弱信号） */
  html?: string;
  /** 可见文本（spa 通道；playwright 的 document.body.innerText） */
  innerText?: string;
  /** 正文字符数（innerText 长度），用于「有内容 = 放行」判断；缺省用 innerText/html 长度 */
  contentChars?: number;
}

export interface Assessment {
  hit: ChallengeHit | null;
  /** high=确定拦截；medium=疑似（可等待自动放行）；none=放行 */
  confidence: 'high' | 'medium' | 'none';
  /** 命中了特征但页面有实质内容 → 判为误报放行（如正常页自带的 reCAPTCHA 组件） */
  falseAlarm: boolean;
  /** 无任何挑战信号但内容极短（软风控伪放行） */
  suspicious: boolean;
  /** 判定依据，进日志 */
  reason: string;
}

const hasContent = (i: ChallengeInput): number =>
  i.contentChars ?? i.innerText?.length ?? i.html?.length ?? 0;

/** 厂商专属响应头：命中即强信号（不需要看正文） */
const HEADER_RULES: Array<[ChallengeKind, RegExp]> = [
  ['cloudflare', /^cf-mitigated$/i],
  ['cloudflare', /^cf-chl-lb|cf-chl-opt/i],
  ['perimeterx', /^x-px-|^x-px/i],
  ['imperva', /incapsula/i],
  ['captcha', /^x-captcha-sitekey|^x-recaptcha/i],
];

/** 强文案：只会出现在真正的挑战页（可见文本） */
const STRONG_TEXT: Array<[ChallengeKind, RegExp]> = [
  ['cloudflare', /just a moment\.\.\.|checking your browser|enable javascript and cookies to continue|attention required!\s*\|\s*cloudflare/i],
  ['imperva', /request unsuccessful\.{3}|_incapsula_resource|incapsula/i],
  ['perimeterx', /perimeterx/i],
  ['aliyun', /请完成安全验证|滑动验证|请进行滑动验证|security check|nc_wrapper/i],
  ['captcha', /verify you are (a|the) human|are you a robot|complete the security check|人机验证|请完成验证/i],
  ['traffic', /unusual traffic|too many requests/i],
];

/** 中文案：挑战页常见但正常页偶尔带的边角词（等自动放行，别直接判死） */
const MEDIUM_TEXT: Array<[ChallengeKind, RegExp]> = [
  ['cloudflare', /_cf_chl|cf_chl_opt|cf-captcha-container|ray id[:\s]/i],
  ['traffic', /access denied|access to this page has been denied/i],
  ['unknown', /redirecting\.\.\.|页面正在|please enable cookies/i],
];

/** 状态码兜底：WAF 拦截常用这几档，正常产品页不该有 */
const BLOCK_STATUS = new Set([401, 403, 405, 406, 412, 429, 451, 503]);

function matchFirst(rules: Array<[ChallengeKind, RegExp]>, text: string): ChallengeHit | null {
  if (!text) return null;
  for (const [kind, re] of rules) {
    const m = re.exec(text);
    if (m) return { kind, matched: m[0].slice(0, 60) };
  }
  return null;
}

/**
 * 统一判定入口（ssr / spa 两条通道都走这里）。
 * ssr 只能给 html，用弱信号路径；spa 能给 innerText+headers，走强信号路径。
 */
export function assessChallenge(i: ChallengeInput): Assessment {
  const notes: string[] = [];
  const len = hasContent(i);
  const hasRealContent = len >= 500;

  // 1) 响应头（强）：逐条 key 匹配规则（不能把整串拼接后匹配——`^cf-mitigated$` 会被 ": challenge" 后缀挡掉）
  let hdr: ChallengeHit | null = null;
  for (const [kind, re] of HEADER_RULES) {
    for (const [k, v] of Object.entries(i.headers ?? {})) {
      if (re.test(k) || re.test(v ?? '')) {
        hdr = { kind, matched: `${k}: ${(v ?? '').slice(0, 40)}` };
        break;
      }
    }
    if (hdr) break;
  }
  if (hdr) notes.push(`响应头命中 ${hdr.kind}（${hdr.matched}）`);

  // 2) 文本：spa 通道的 innerText（已排除 script/style）才是可信信号；
  //    ssr 只能给整页 HTML（含 script），强文案降级为「中」信号，避免 Payload/白名单 JSON 误判。
  const strong = i.innerText ? matchFirst(STRONG_TEXT, i.innerText) : null;
  const weak =
    strong ??
    (i.innerText ? matchFirst(MEDIUM_TEXT, i.innerText) : matchFirst(STRONG_TEXT, i.html ?? '') ?? matchFirst(MEDIUM_TEXT, i.html ?? ''));
  const textHit = strong ?? weak;
  if (textHit) notes.push(`文本命中 ${textHit.kind}（${textHit.matched}）`);

  // 3) 状态码兜底
  const status = i.status;
  const statusBlock = status !== undefined && BLOCK_STATUS.has(status);
  if (statusBlock) notes.push(`状态码 ${status}（WAF 拦截档）`);

  // ── 状态码拦截优先于软拦判定：403/412 这类是 WAF 的明确答复，不能因为响应体短被当成空壳 ──
  if (hdr === null && statusBlock) {
    return {
      hit: { kind: textHit?.kind ?? 'unknown', matched: `HTTP ${status}` },
      confidence: 'high',
      falseAlarm: false,
      suspicious: false,
      reason: notes.join('；'),
    };
  }

  // ── 反向放行：仅 spa 通道（有 innerText）；中/弱信号 + 页面有实质内容 → 误报放行 ──
  //    （ssr 通道只有整页 HTML，命中词可能来自 script/JSON，此时不反向放行，走正向 medium 判定）
  if (i.innerText && hdr === null && weak && !strong && hasRealContent) {
    return {
      hit: null,
      confidence: 'none',
      falseAlarm: true,
      suspicious: false,
      reason: `仅命中弱特征「${weak.kind}：${weak.matched}」但正文 ${len} 字符，判定误报放行`,
    };
  }

  // ── 软拦伪放行：无信号但内容极短 ──
  if (!hdr && !textHit && len > 0 && len < 200) {

    return {
      hit: null,
      confidence: 'medium',
      falseAlarm: false,
      suspicious: true,
      reason: `无挑战特征但内容仅 ${len} 字符（疑似软风控空壳）`,
    };
  }

  // ── 确定拦截 ──
  if (hdr) return { hit: hdr, confidence: 'high', falseAlarm: false, suspicious: false, reason: notes.join('；') };
  if (statusBlock) {
    const kind: ChallengeKind = textHit?.kind ?? 'unknown';
    return { hit: { kind, matched: `HTTP ${status}` }, confidence: 'high', falseAlarm: false, suspicious: false, reason: notes.join('；') };
  }
  if (textHit) {
    return {
      hit: textHit,
      // strong = spa 通道在可见文本里命中的挑战文案；ssr 通道的 HTML 命中一律 medium
      confidence: !!strong ? 'high' : 'medium',
      falseAlarm: false,
      suspicious: false,
      reason: notes.join('；'),
    };
  }
  return { hit: null, confidence: 'none', falseAlarm: false, suspicious: false, reason: '未命中任何挑战特征' };
}

/** 兼容旧调用：只要 hit（sweep 报告里用作分类标签） */
export function detectChallengeLike(i: ChallengeInput): ChallengeHit | null {
  return assessChallenge(i).hit;
}
