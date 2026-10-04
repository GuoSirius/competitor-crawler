/**
 * 反爬/反检测基础设施：启动参数、指纹环境、挑战页识别。
 *
 * 现状基线（2026-10-01）：`fetch/page.ts` 只有 3 个 launch 参数 + 一个覆盖
 * `navigator.webdriver/plugins/languages` 的手搓 initScript，`browserFetch` 走 stealth，
 * 但 `listTraversal.ts` 的 UI 翻页分支是**裸 launch**（无 initScript）——点翻页这条路
 * 反而最像机器人。这里把能力集中到一处，两处共用。
 *
 * 分层说明（对齐上线前的验收口径）：
 * - 浏览器启动层：args / headless
 * - 上下文层：UA / timezone / locale / viewport / screen 自洽
 * - 注入层：initScript 抹掉自动化 JS 特征
 * - 检测层：挑战页 / 诱饵页识别（**关键**：挑战页返回 200 + 0 锚点，
 *   若不做识别会被当成「合法空列表」静默跳过 → 数据缺了没人知道）
 */

/** 隐身强度档位：none=裸浏览器（调试用），low=基础特征，mid=默认，high=加稳定噪声 */
export type StealthProfile = 'none' | 'low' | 'mid' | 'high';

export interface StealthEnv {
  profile?: StealthProfile;
  /** 默认 Asia/Shanghai：与站点地域/家庭宽带属地一致，UTC 是最典型的机器特征 */
  timezone?: string;
  locale?: string;
  viewport?: { width: number; height: number };
  /** screen 必须严格大于 viewport，否则易被判为异常环境 */
  screen?: { width: number; height: number };
  userAgent?: string;
  /** 噪声种子：同一站点固定 seed → 同一指纹（避免「回访用户指纹变化」暴露） */
  seed?: number;
  /**
   * 有头模式是否把浏览器窗口最大化铺满屏幕（默认 true）。
   *
 * 为什么默认开：Playwright 有头模式默认窗口只有约 1280×720 且**居中但不铺满**，
 * 一来人眼看列表不方便（调试/人工过盾时要盯着页面），二来小视口会让站点走窄屏布局
 * （懒加载阈值、响应式列数变化），与真实桌面用户不一致。最大化后视口=屏幕工作区，
 * 同时不再覆写 viewport/screen（用真实显示器尺寸，指纹更自洽）。
 * 无头模式无窗口概念，此开关无效。
 *
 * 实测（1920×1080 屏，2026-10-05）：
 * - 只加 `--start-maximized` 不补 CDP：窗口 945×1030、视口仅 929×935 —— **新上下文窗口不继承启动参数**；
 * - 启动参数 + CDP 补刀：窗口 1920×1050（=屏幕可用区，真铺满），视口 1920×963；
   * - 旧行为（固定 viewport 1920×1080）：窗口被撑到 1936×1100，**超出屏幕底部**，且 screen 被伪造成 1920×1200。
   */
  maximize?: boolean;
  /**
   * 代理服务器（如 VPN 的本地监听端口 `http://127.0.0.1:7890`）；空 = 直连。
   *
   * 为什么必须显式传：**Chromium 不认 `http_proxy` / `HTTPS_PROXY` 环境变量**
   * （只读 Windows 系统代理设置），Node 的 fetch 也不认。开了 VPN 若不配这里，
   * 抓取仍以**本机国内 IP** 直连出去 → 境外站 WAF 按「国内 IP + 自动化指纹」判爬虫。
   * 实测：逸漠 XImo 同指纹同页面，Chromium 默认直连 403，显式走代理后 **200**。
   *
   * **默认直连，不做全局默认**：是否走代理由站点/栏目 YAML 的 `proxy:` 决定
   * （支持 `proxy: '${CRAWL_PROXY}'` 占位符，端口只在 .env 维护一处），
   * 否则国内站会被白白绕出国、变慢且更容易被拦。
   */
  proxy?: string;
}

/**
 * 默认浏览器上下文：Windows + Chrome 124 桌面档，与 `DEFAULT_UA` 同平台自洽。
 * 这些值必须和 UA 里的平台串一致（不能说自己是 Windows 却用 Linux 的时区/语言）。
 */
export const DEFAULT_STEALTH_ENV: Required<StealthEnv> = {
  profile: 'mid',
  timezone: 'Asia/Shanghai',
  locale: 'zh-CN',
  viewport: { width: 1920, height: 1080 },
  screen: { width: 1920, height: 1200 },
  userAgent: '', // 空 = 沿用 page.ts 的 DEFAULT_UA
  seed: 20261001,
  maximize: true, // 有头模式铺满屏幕（无头无效）
  // 默认直连。走代理的站在 YAML 写 `proxy: '${CRAWL_PROXY}'`，避免国内站被绕出国。
  proxy: '',
};

/**
 * launch 参数。
 *
 * 关键：`--disable-blink-features=AutomationControlled` 去掉 `window.chrome` 的
 * automation 标记；不用 `--disable-web-security` / `--mute-audio` 这类"越不像浏览器"
 * 的开关；有头模式（默认）比 headless 更接近真实设备。
 *
 * `--start-maximized`：有头模式让窗口直接铺满屏幕（默认开，见 StealthEnv.maximize）。
 * 它是**启动参数**，只对 launch 时的首个窗口生效；Playwright 新建上下文的窗口靠
 * `maximizeWindow()` 走 CDP 补一次，两者叠加最稳（缺任一都可能拿到小窗口）。
 */
export function stealthArgs(opts: { headless?: boolean; maximize?: boolean } = {}): string[] {
  const headfulMax = !opts.headless && opts.maximize !== false;
  return [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-blink-features=AutomationControlled',
    ...(opts.headless ? ['--headless=new'] : ['--hide-scrollbars']),
    ...(headfulMax ? ['--start-maximized', '--window-position=0,0'] : []),
    '--force-device-scale-factor=1',
    '--disable-features=IsolateOrigins,site-per-process',
  ];
}

/**
 * 把窗口真正最大化（CDP 层）。
 *
 * `--start-maximized` 是启动参数，Playwright 后面 `newContext()` 新开的窗口不一定继承，
 * 实测只靠参数会出现「参数带了、窗口还是不大」的情况；这里用 CDP `Browser.setWindowBounds`
 * 按当前 target 的 windowId 再设一次，是唯一可靠的补刀（headless 下该 CDP 域不可用 → 静默跳过）。
 */
export async function maximizeWindow(page: import('playwright').Page): Promise<void> {
  try {
    const cdp = await page.context().newCDPSession(page);
    const { windowId } = (await cdp.send('Browser.getWindowForTarget')) as { windowId: number };
    await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'maximized' } });
  } catch {
    // 最大化失败绝不能影响抓取主流程（headless / 老内核 / 受限环境都可能不支持）
  }
}

/**
 * 传给 playwright `newContext()` 的环境选项。
 *
 * `opts.headless` 决定「有头最大化」是否生效：有头 + maximize（默认 true）时
 * 传 `viewport: null`（不覆写视口，页面尺寸跟随真实窗口 = 最大化后的屏幕工作区），
 * 同时不覆写 `screen`——Playwright 的 screen 只在 viewport 有值时生效，此时
 * `window.screen` 直接用真实显示器尺寸，反而是最自洽的指纹。
 */
export function stealthContextOptions(
  env: StealthEnv = DEFAULT_STEALTH_ENV,
  opts: { headless?: boolean } = {},
) {
  // 先剔除显式 undefined 键再合并：spread 语义下 `{ ...def, locale: undefined }` 会把
  // 默认值覆盖成 undefined（traverseList 主循环传 ab?.locale 等显式 undefined 键必踩），
  // 导致 locale.split 崩溃。undefined = 未配置 = 沿用默认。
  const e = {
    ...DEFAULT_STEALTH_ENV,
    ...Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined)),
  } as Required<StealthEnv>;
  const maximized = !opts.headless && e.maximize !== false;
  return {
    userAgent: e.userAgent || undefined,
    // 代理：Chromium 只认这里，不认 http_proxy 环境变量（见 StealthEnv.proxy 注释）。
    // 空串 = 直连，Playwright 接受 undefined。
    proxy: e.proxy ? { server: e.proxy } : undefined,
    locale: e.locale,
    timezoneId: e.timezone,
    // 有头最大化：不覆写视口（页面=窗口=屏幕工作区）；否则用配置的固定视口
    viewport: maximized ? null : e.viewport,
    // screen 仅在 viewport 有值时生效（Playwright 语义），最大化时省略即可
    screen: maximized ? undefined : e.screen,
    // 最大化（viewport=null）时 Playwright 直接拒绝 deviceScaleFactor，必须一并省略
    deviceScaleFactor: maximized ? undefined : 1,
    hasTouch: false,
    isMobile: false,
    // 部分国内站证书链不全（索莱宝 elabox.cn / 美森 ctcc.online 实测 ERR_CERT_AUTHORITY_INVALID）
    // ——是证书问题不是反爬；抓取场景不涉及支付，忽略之，否则整站误判为不可达
    ignoreHTTPSErrors: true,
    extraHTTPHeaders: {
      'Accept-Language': `${e.locale},${langOnly(e.locale)};q=0.9`,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'Upgrade-Insecure-Requests': '1',
    },
  };
}

function langOnly(locale: string): string {
  return locale.split('-')[0] ?? 'en';
}

/**
 * 页面初始化脚本：抹掉自动化特征。
 *
 * 刻意不用 `playwright-stealth` 之类的第三方库——我们的注入需求是可控子集，
 * 且第三方库版本一变行为就不透明；这里全部显式写在项目内，行为可审计。
 *
 * 原则：
 * 1. `webdriver` 强制 false（不是 undefined：真实浏览器读出来就是 false，
 *    旧实现写 undefined 反而更扎眼）；
 * 2. Canvas/WebGL 噪声用**固定 seed** 的确定性偏移，不是每次随机——
 *    每页随机会让「回访用户指纹不一致」成为新特征；
 * 3. 只补"真实浏览器本来就有"的东西（chrome 对象、plugins、mimeTypes、
 *    permissions.queryInterface），不做过度伪造（过度伪造=指纹在剧烈变化）。
 */
export function stealthInitSource(profile: StealthProfile = 'mid'): string {
  if (profile === 'none') return '';
  const deep = profile === 'high';
  return `(() => {
  try {
    Object.defineProperty(navigator, 'webdriver', { get: () => false, configurable: true });
    // window.chrome 句柄（真浏览器有，自动化环境常缺失）
    if (!window.chrome) {
      window.chrome = { runtime: {}, loadTimes: function(){}, csi: function(){} };
    }
    if (!window.chrome.runtime) window.chrome.runtime = {};
    window.chrome.runtime.onMessage = undefined;
    // plugins / mimeTypes：返回非空且像真实 Chrome（3~5 项）
    const plugins = [['PDF Viewer','application/pdf'],['Chrome PDF Viewer','application/pdf'],
      ['Chromium PDF Viewer','application/pdf'],['Microsoft Edge PDF Viewer','application/pdf'],
      ['WebKit built-in PDF','application/pdf']].slice(0, 4);
    Object.defineProperty(navigator, 'plugins', {
      get: () => plugins.map((p, i) => ({ name: p[0], filename: 'internal-pdf-viewer',
        description: p[0], length: 1, item: () => null, [Symbol.iterator]: undefined, i })),
      configurable: true });
    Object.defineProperty(navigator, 'mimeTypes', { get: () => [], configurable: true });
    Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN','zh'], configurable: true });
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8, configurable: true });
    Object.defineProperty(navigator, 'deviceMemory', { get: () => 8, configurable: true });
    Object.defineProperty(navigator, 'platform', { get: () => 'Win32', configurable: true });
    // 权限查询：真浏览器会返回 'prompt'/'denied' 而非抛错
    if (!navigator.permissions || !navigator.permissions.query) {
      navigator.permissions = navigator.permissions || {};
      navigator.permissions.query = (p) => Promise.resolve({ state: 'prompt', onchange: null, ...p });
    }
    // Connections API（真浏览器有，自动化常缺）
    if (!navigator.connection) {
      navigator.connection = { downlink: 10, effectiveType: '4g', rtt: 50, saveData: false };
    }
    // 函数源码补丁：把被覆盖的 getter 的 toString 伪装成原生形态
    const nativeStr = 'function () { [native code] }';
    const origDesc = Object.getOwnPropertyDescriptor;
    Object.getOwnPropertyDescriptor = function (obj, key) {
      const d = origDesc ? origDesc.call(Object, obj, key) : undefined;
      if (d && typeof d.get === 'function' && d.get.toString().includes('native code') === false) {
        try { Object.defineProperty(d.get, 'toString', { value: () => nativeStr, configurable: true }); } catch {}
      }
      return d;
    };
    ${deep ? `
    // high 档：Canvas / WebGL 确定性噪声（固定 seed，同站同指纹）
    const seedNoise = (v) => ((v * 2654435761) % 1000) / 1000;
    const patchCanvas = () => {
      const proto = window.HTMLCanvasElement && window.HTMLCanvasElement.prototype;
      if (!proto || !proto.getContext) return;
      const orig = proto.getContext;
      proto.getContext = function (type, ...rest) {
        const ctx = orig.call(this, type, ...rest);
        if (ctx && ctx.canvas && /2d/.test(String(type))) {
          const origFill = ctx.fillText ? ctx.fillText.bind(ctx) : null;
          if (origFill) ctx.fillText = function (t, x, y, ...a) {
            if (typeof t === 'string' && /omega|cf|challenge/i.test(t)) return;
            return origFill(t, x + seedNoise(x + 7) * 0.6, y + seedNoise(y + 3) * 0.6, ...a);
          };
        }
        return ctx;
      };
    };
    patchCanvas();
    try {
      const gp = window.WebGLRenderingContext && WebGLRenderingContext.prototype.getParameter;
      if (gp) {
        WebGLRenderingContext.prototype.getParameter = function (p) {
          if (p === 37445) return 'Google Inc.';
          if (p === 37446) return 'Google SwiftShader';
          return gp.call(this, p);
        };
      }
    } catch {}
    ` : ''}
  } catch (e) { /* 注入失败绝不能影响抓取主流程 */ }
})();`;
}

// ───────────────── 挑战页 / 诱饵页识别 ─────────────────

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

/**
 * 特征表：顺序即判定优先级。
 *
 * ⚠️ 为什么必须有这个：挑战页常返回 **HTTP 200 + 一个长得像正常页的框**，
 * 解析出来 0 个产品锚点。旧逻辑把「0 锚点」当作合法语义（空栏目自动停页），
 * 于是「被 WAF 拦」被静默记成「抓取成功、该栏目没有产品」——数据缺了没人知道。
 * 有了识别，就能把它显式升级成 SITE_CHALLENGED 失败。
 */
const CHALLENGE_PATTERNS: Array<[ChallengeKind, RegExp]> = [
  ['cloudflare', /just a moment|checking your browser|cf-browser-verification|cf_chl_opt|attention required!\s*\|\s*cloudflare|_cf_chl|enable javascript and cookies to continue|verify you are (a|the) human/i],
  ['imperva', /incapsula|request unsuccessful\.{3}|_incapsula_resource|nx-?domain|access to this page has been denied/i],
  ['perimeterx', /perimeterx|_px|captcha\.px|perimeterx\.com/i],
  ['aliyun', /滑动验证|请完成安全验证|阿里云|security check|nc_wrapper|slider-verify|输入验证码|please verify/i],
  // captcha 必须匹配「真实验证控件/挑战脚本」，不能只命中组件名——
  // 实测坑：Promega 正常页把 .g-recaptcha / [data-sitekey] 写进富文本编辑器白名单
  // （{"allowlist":[".g-recaptcha","[data-sitekey]"]}），裸匹配 `g-recaptcha` 会 100% 误报，
  // 导致脚本干等 180s 人工过盾一个根本不存在的盾。
  ['captcha', /recaptcha\/anchor|recaptcha\/frames|rc-anchor|rc-anti-bot|g-recaptcha-response|grecaptcha\.(render|execute|verify)|grecaptcha\.api|hcaptcha\.com\/|#h-captcha|turnstile[^\s"';]{0,40}challenge|cf-turnstile/i],
  ['traffic', /unusual traffic|too many requests|请稍后再试|try again later|access denied|please enable cookies/i],
  ['unknown', /页面正在|redirecting\.\.\.|verify\b.*\bhuman/i],
];

/** 识别挑战页/风控页；返回 null 表示正常页面 */
export function detectChallenge(html: string): ChallengeHit | null {
  if (!html || html.length < 60) return null; // 极短内容（截断/占位）不值得匹配，防误报
  for (const [kind, re] of CHALLENGE_PATTERNS) {
    const m = re.exec(html);
    if (m) return { kind, matched: m[0].slice(0, 60) };
  }
  return null;
}

export function isChallengeKind(hit: ChallengeHit | null, kinds: ChallengeKind[]): boolean {
  return !!hit && kinds.includes(hit.kind);
}
