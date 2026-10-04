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
  /** DOM 里是否存在真实验证控件（reCAPTCHA anchor/PX/Turnstile iframe 等）——宽泛文案的裁决证据 */
  domWidget?: boolean;
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

/**
 * 特异文案：出现在**可见文本**里即判挑战（正常产品页不会写这些词）。
 * 实测教训（2026-10-02 重试 20 站）：`security check`/`unusual traffic`/`perimeterx` 这类词
 * 在正常页（BD 130 产品、赛业 876 产品、ScienCell 145 产品）也会出现——它们进了**宽泛组**，
 * 必须叠加「页面无实质内容 或 DOM 有验证控件」才算挑战。
 */
const SPECIFIC_TEXT: Array<[ChallengeKind, RegExp]> = [
  ['cloudflare', /just a moment\.\.\.|checking your browser|enable javascript and cookies to continue|attention required!\s*\|\s*cloudflare/i],
  ['imperva', /request unsuccessful\.{3}|_incapsula_resource/i],
  ['aliyun', /请完成安全验证|滑动验证|请进行滑动验证|nc_wrapper/i],
  ['captcha', /verify you are (a|the) human|are you a robot|人机验证|请完成验证/i],
];

/** 宽泛文案：正常页也可能带（组件文案/帮助文档），需 DOM 控件或「无内容」佐证 */
const BROAD_TEXT: Array<[ChallengeKind, RegExp]> = [
  ['perimeterx', /perimeterx|press & hold/i],
  ['imperva', /incapsula/i],
  ['aliyun', /security check/i],
  ['captcha', /complete the security check|完成验证码|g-recaptcha/i],
  ['traffic', /unusual traffic|too many requests|请稍后再试|try again later/i],
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

  // 2) 文本（spa 通道 innerText 可信；ssr 通道整页 HTML 只配 medium）：
  //    specific=特异文案（出现即挑战）；broad=宽泛文案（需 DOM 控件或「无内容」佐证）
  const specific = i.innerText ? matchFirst(SPECIFIC_TEXT, i.innerText) : null;
  const broad = !specific && i.innerText ? matchFirst(BROAD_TEXT, i.innerText) : null;
  const medium = !specific && !broad && i.innerText ? matchFirst(MEDIUM_TEXT, i.innerText) : null;
  // ssr 通道（只有整页 HTML，没有 innerText / DOM 控件）同样要区分「特异」与「宽泛」两层：
  //   整页 HTML 里的宽泛词绝大多数来自站点自有组件（ScienCell/Promega 把 g-recaptcha 写进
  //   富文本白名单或页脚脚本），与 innerText 通道一样必须走「有实质内容 → 误报放行」，
  //   否则正常产品页会被判 medium 直接抛 ChallengeError（2026-10-04 ScienCell 踩坑）。
  //   特异词（`just a moment...` / `request unsuccessful...`）在整页 HTML 里出现仍然可信。
  const htmlSpecific = !i.innerText ? matchFirst(SPECIFIC_TEXT, i.html ?? '') : null;
  const htmlBroad = !specific && !broad && !i.innerText ? matchFirst(BROAD_TEXT, i.html ?? '') : null;
  const htmlMedium =
    !specific && !broad && !htmlBroad && !i.innerText ? matchFirst(MEDIUM_TEXT, i.html ?? '') : null;
  const textHit = specific ?? broad ?? medium ?? htmlSpecific ?? htmlBroad ?? htmlMedium;
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

  // ── 确定拦截 ──
  if (hdr) return { hit: hdr, confidence: 'high', falseAlarm: false, suspicious: false, reason: notes.join('；') };
  if (specific) {
    return { hit: specific, confidence: 'high', falseAlarm: false, suspicious: false, reason: notes.join('；') };
  }
  // 宽泛文案：有实质内容且 DOM 无验证控件 → 误报放行（BD/赛业/ScienCell 这类自带组件文案的正常页）
  // spa 通道（innerText 通道）用 domWidget 佐证；ssr 通道拿不到 DOM，用「正文 ≥500 字符」等效放行。
  if (broad || htmlBroad) {
    if (hasRealContent && !i.domWidget) {
      return {
        hit: null,
        confidence: 'none',
        falseAlarm: true,
        suspicious: false,
        reason: `宽泛特征「${(broad ?? htmlBroad)!.kind}：${(broad ?? htmlBroad)!.matched}」但正文 ${len} 字符且无验证控件，判定误报放行`,
      };
    }
    return {
      hit: broad ?? htmlBroad,
      confidence: 'high',
      falseAlarm: false,
      suspicious: false,
      reason: notes.join('；'),
    };
  }

  // ── 反向放行：spa 通道命中中/弱词 + 有实质内容 → 误报放行 ──
  if (medium && hasRealContent) {
    return {
      hit: null,
      confidence: 'none',
      falseAlarm: true,
      suspicious: false,
      reason: `仅命中弱特征「${medium.kind}：${medium.matched}」但正文 ${len} 字符，判定误报放行`,
    };
  }

  // ── ssr 通道的特异文案：整页 HTML 里可能是脚本/白名单 JSON（Promega 已踩），故降级 medium ──
  if (htmlSpecific) {
    return {
      hit: htmlSpecific,
      confidence: 'medium',
      falseAlarm: false,
      suspicious: false,
      reason: notes.join('；'),
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

  if (medium || htmlMedium) {
    return {
      hit: textHit,
      confidence: 'medium',
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
