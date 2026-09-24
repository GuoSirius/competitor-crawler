# AGENTS.md · 在本仓库工作前请先读

> 本文件是**给任何 AI 助手 / 新同事的入场须知**，目的是让「同一个仓库、任何人、任何时候」得到**一致**的行为与产出。
> 详细内容不在本文件复制，而是指向唯一真相源。

## 唯一真相源（不要另起一份）

| 事实 | 看哪里 |
|---|---|
| 有哪些脚本、怎么用 | [`docs/11-脚本命令手册.md`](docs/11-脚本命令手册.md) |
| 有哪些环境变量 | [`.env.example`](.env.example)（新增变量先写它再写代码） |
| 爬哪些站点、怎么解析 | [`config/sites/*.yaml`](config/sites/) |
| 架构 / 数据库 / 站点接入 / 告警 / 工程规范 | [`docs/README.md`](docs/README.md)（含架构图与流程图 `docs/assets/*.svg`） |

## 5 条硬规则

1. **不安装依赖、不启服务**：`pnpm install` / 加包 / 升级 / 起 dev server 一律由人执行；AI 只在需要时给出命令。
   允许自行执行的是**只读校验**：`pnpm typecheck`、`pnpm test`、`db:push`（仅对数据库副本）、文档链接校验。
2. **改完即提交并推送，按逻辑小节多次细化提交**；不要攒成一坨，也不要等提醒。
3. **不要还原别人（含用户）改过的文件**：提交时一并带上；拿不准先问，禁止静默丢弃。
4. **建目录/写文件先检测后创建**（`mkdirSync(recursive:true)`）；读取路径缺失要给明确报错，不要静默跳过。
5. **站点适配是「加性」的**：`config/sites/<domain>.yaml` 是主力，`packages/crawler/src/adapters/<domain>.ts` 只提供**可选钩子**；
   二者**可共存、不互斥**，优先级 `YAML → 代码 Adapter → 模型兜底`；没有适配器文件时行为与纯 YAML **完全一致**。

## 提交信息

`type` ∈ `build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test`（**没有 `config`**）；
**主题不能以大写单词开头**（中文或小写起头）。钩子若跑不起来，用
`git -c core.hooksPath=.git/cph commit -m "..."`（门禁等价，**不要 `--no-verify`**）。

## 快速开始

见 [`docs/00-快速开始.md`](docs/00-快速开始.md)。
