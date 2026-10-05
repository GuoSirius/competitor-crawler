/**
 * 极简命令行参数解析（复用，避免各命令各写一遍）。
 * 支持 `--key value`、`--flag`（布尔 true）、`--no-flag`（布尔 false）。
 *
 * `--no-` 前缀（2026-10-05 补）：`--no-fingerprint` / `--no-proxy` 这类「默认开、可关」的开关
 * 此前会被原样记成 key=`no-fingerprint`，各命令都得自己判一次字符串，既漏又散。
 * 这里在解析层统一翻成 `{ '<name>': false }`，命令侧只需读 `flags.fingerprint === false`。
 * 幂等：`--no-foo=false` 不做二次取反（显式给了值就按值走）。
 */
export function parseFlags(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    let key = a.slice(2);
    let negated = false;
    if (key.startsWith('no-')) {
      negated = true;
      key = key.slice(3);
    }
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      out[key] = next;
      i++;
    } else {
      out[key] = !negated;
    }
  }
  return out;
}

/**
 * 参数别名表：**规范名 → 等价旧名**（旧名全部保留，已有脚本 / 文档 / 肌肉记忆零破坏）。
 *
 * 统一方向（2026-10-01，解决「命令参数太多太像搞混」）：
 * - 站点标识一律 `--domain`：crawl/validate 曾写作 `--site`，probe/gen-site 本就是 `--domain`
 *   —— 同一件事两个名字是最大困惑源；`--site` 保留为别名。
 * - 翻页数量护栏用 `--max-pages`（= YAML maxPages 语义），`--pages` 保留为别名。
 *   理由：`--pages` 是「抓几页」而 `--page-start` 是「第几页开始」，两者只差一词极易记反，
 *   把「数量」显式命名成 max-pages 即可一眼区分。
 * - 页内切片用 `--page-offset` / `--page-size`（旧名 `--offset` / `--per-page` 仍可用），
 *   与「详情条目总数上限 `--limit`」拉开命名距离。
 */
export const FLAG_ALIASES: Record<string, string[]> = {
  domain: ['site'],
  'max-pages': ['pages'],
  'page-offset': ['offset'],
  'page-size': ['per-page'],
};

/**
 * 别名归一化：规范名缺失时，用其等价旧名填充。规范名显式给出时优先（不覆盖）。
 * 幂等：传入已归一化的 flags 再跑一次结果不变。
 */
export function normalizeAliases(
  flags: Record<string, string | boolean>,
  aliases: Record<string, string[]> = FLAG_ALIASES,
): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = { ...flags };
  for (const [canonical, keys] of Object.entries(aliases)) {
    if (out[canonical] !== undefined) continue;
    for (const k of keys) {
      const v = out[k];
      if (v !== undefined) {
        out[canonical] = v;
        break;
      }
    }
  }
  return out;
}
