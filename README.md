# 竞品爬虫项目

竞品品类产品**爬虫 + 监控 + 分析**系统。从两家竞对清单 Excel（共 106 条品类链接、24 个独立域名）出发，定期爬取各品类下全部产品信息，归一化入库，季度增量更新（新增插入 / 已有更新 / 下架软删除），字段突变告警，并通过 Excel 导出、图表、应用页面向市场部 / 产品部提供分析决策支撑。

## 技术栈

- 语言：**Node.js + TypeScript（ESM）**
- 抓取：Playwright（无头浏览器）+ undici/axios（HTTP）+ cheerio（服务端渲染解析）
- 模型辅助：本地轻量模型（Ollama/vLLM，如 Qwen2.5-VL）+ 云端大模型兜底（通义 / DeepSeek / Claude），经 OpenAI 兼容接口统一调用
- 存储：**Drizzle ORM**，本地 SQLite，生产切 MySQL / PostgreSQL（无感切换）
- 下游：ExcelJS（导出）、ECharts（图表）、Nuxt 3（应用页）

## 快速开始

新设备拉取并跑起来只需四步（详见 [`docs/00-快速开始.md`](docs/00-快速开始.md)）：

```bash
pnpm install                       # 1. 安装依赖（monorepo 根目录一次装全）
pnpm exec playwright install chromium   # 2. 安装浏览器内核（用 pnpm exec，别用 npx）
cp .env.example .env              # 3. 准备环境变量
pnpm --filter @competitor-crawler/shared db:push   # 4. 初始化数据库表结构
```

常用命令：`pnpm seed`（同步种子）/ `pnpm crawl`（爬取）/ `pnpm report`（交付物）/ `pnpm typecheck`（类型检查）。

## 文档

详细的设计、规范与决策记录统一放在 [`docs/`](docs/README.md)（背景目标、架构、数据库、模型方案、站点接入、运行调度、告警、下游应用、切库，及 ADR）。代码目录后续会重新规划，本仓库当前阶段以文档与目录约定为主，故 README 不罗列会频繁变动的目录结构。
