import { ChallengeError } from '../fetch/page.js';

/**
 * 把「抓取失败」翻译成一句**可执行的下一步**，而不是把异常原文糊在用户脸上。
 *
 * 为什么要单独一个函数（2026-10-05 全流程自查的产出）：probe / crawl / sweep 三处
 * 各自 catch 一次、各写一句提示，口径必然漂移——最典型的就是「站点被反爬拦了」，
 * probe 那边只说「解析出 0 条」，用户根本不知道是页面没抓下来、还是选择器没对上。
 * 统一收敛成一个函数后，任何入口的失败提示都是同一套判据、同一套建议。
 *
 * 判据只分三类，因为**处置动作完全由类别决定**（混为一谈就只能干等）：
 * - 挑战/人机验证（ChallengeError）→ 反爬归因，跑 diagnose 拿多通道对照；
 * - 网络层（DNS/连接/证书）→ 检查出口与代理，不是反爬问题；
 * - 其它 → 页面本身的问题（404/超时/渲染），建议看 URL 与渲染模式。
 */
export function adviseFetchFailure(err: unknown, domain: string): string[] {
  const msg = (err as Error)?.message ?? String(err);

  if (err instanceof ChallengeError) {
    const blocked = /attention required|sorry, you have been blocked/i.test(msg);
    return [
      `站点返回**人机验证 / 挑战页**（${err.kind}）——这是反爬拦截，不是选择器写错。`,
      blocked
        ? '页面内容像是 WAF 封禁页：重试与改指纹都无效 → 换出口 IP（YAML 配 `proxy: \'${CRAWL_PROXY}\'`）或放弃该站。'
        : '挑战页可以尝试自动过盾（轮次/间隔由 CRAWL_CHALLENGE_ROUNDS / CRAWL_CHALLENGE_WAIT_MS 控制，有头模式下还能等人工点一次）。',
      `下一步：跑 \`pnpm diagnose --domain ${domain}\` 做多通道对照（ssr / 有头 / 无头 / 连你本机 Chrome），看是「姿势不过」还是「IP 被封」——别凭一条报错就下结论。`,
    ];
  }

  if (/fetch failed|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ERR_CONNECTION|certificate|TLS|timeout/i.test(msg)) {
    return [
      `**网络层**就没通（${msg.slice(0, 80)}）：这不是反爬问题，改指纹、重跑都没用。`,
      '检查 DNS、证书与出口 IP；若需跨境出口，在 YAML 里给该站配 `proxy`。',
      `可用 \`pnpm diagnose --domain ${domain}\` 的全通道表交叉验证（六条通道一致失败才算数）。`,
    ];
  }

  return [`抓取失败：${msg.slice(0, 160)}`, `可重跑 \`pnpm probe --domain ${domain} --render browser\` 排除渲染模式问题。`];
}

/** 把 adviseFetchFailure 的多行建议按缩进打印（stderr，避免污染 stdout 的机器可读输出） */
export function printFetchAdvice(err: unknown, domain: string, prefix = ''): void {
  for (const line of adviseFetchFailure(err, domain)) {
    console.error(`${prefix}   ${line}`);
  }
}
