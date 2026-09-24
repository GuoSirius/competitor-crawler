# scripts/ 目录说明

> 本目录只放**有持续价值**的脚本；一次性探查脚本用完即删，不入库。
> 全部零第三方依赖（cheerio 经 `packages/crawler` 的 node_modules 解析），仓库根任意位置可跑。

## 站点接入工具链（竞品爬虫专用）

| 脚本 | 用途 | 用法 | 产物 |
|---|---|---|---|
| `probe-lists.mjs` | 全量探针：抓所有公司品类 URL，判定可爬性（SERVER_LIST / LANDING_ONLY / BLOCKED_WAF / UNREACHABLE），采集产品容器/详情样例/分页/价格信号 | `node scripts/probe-lists.mjs` | `data/seeds/crawl-inventory.json`（gitignore）+ HTML 样本 `.tmp/probe-html/`（用完即删） |
| `gen-report.mjs` | 把探针结果渲染成人类可读的待爬清单报告 | `node scripts/gen-report.mjs` | `data/seeds/crawl-targets.md`（入库） |
| `analyze-sites.mjs` | 批量分析 SERVER_LIST 站点：详情链接 pattern、卡片容器链、翻页形态、详情页 name/price/sku 候选选择器 | `node scripts/analyze-sites.mjs` | `.tmp/site-analysis/site-analysis.json`（用完即删） |

**典型接入流程**：`probe-lists` 定可爬性 → `analyze-sites` 拿结构 → 手写 `config/sites/<domain>.yaml` → `pnpm crawl -- --site <domain> --dry-run --limit 3` 验证 → 提交。

## 仓库基建（勿动）

| 脚本 | 用途 |
|---|---|
| `typecheck.mjs` | typecheck 单一入口（shared+crawler 走 tsc，web 有 vue-tsc 才跑） |
| `precommit.mjs` / `commitmsg.mjs` | husky / `.git/cph` 两套钩子共用的门禁（等价） |
| `install-hooks.mjs` | 安装 husky 钩子 |
| `release.mjs` | 发布流：typecheck → test → commit → 选版本 → standard-version → push tags |
