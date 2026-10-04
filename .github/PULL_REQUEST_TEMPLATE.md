<!--
本 PR 模板对应审查标准 docs/15-代码审查标准与流程.md。
提交前请逐条自审；reviewer 按同标准出 🔴/🟡/💭 意见。
-->

## 变更摘要

<!-- 一句话说清这次改了什么、为什么。高影响变更（新依赖/改工具链/改数据口径/大重构/安全）请说明已与用户确认（§12.12）。 -->

## 自审清单（作者提交前必勾）

- [ ] typecheck 全绿（`pnpm typecheck` / 提交钩子自动）
- [ ] 单测全绿（`pnpm test` / 提交钩子自动）
- [ ] 文档/配置同步：
  - [ ] 新脚本已登记 `docs/11` + 根 `package.json` 入口
  - [ ] 新增/改动环境变量已写入 `.env.example`（与代码键名双向一致，§12.13）
  - [ ] 站点规则改动已改 `config/sites/*.yaml`，未破坏「加性」约定（硬规则 5）
  - [ ] 相关设计文档已同步
- [ ] 未还原/夹带他人文件（`git add <具体文件>`，未用 `git add -A` / 静默 `restore`）

## 正确性（🔴 必查）

- [ ] 写库幂等：种子 upsert / crawl `ON CONFLICT` / 下架软删 / backfill 只填空列（§12.1）
- [ ] 去重键 = `(company_id, dedupe_key, section_key)`，`sku` 不参与；列表先 `canonical(detailUrl)` 去重
- [ ] 时间：秒级用 `dayjs.unix()`，展示用 `formatBj()`，无裸 `new Date()`
- [ ] 解析层：`regex` 单反斜杠、dry-run 验证条数 > 0；形态/浏览器渲染等待正确；非产品页已排除

## 安全性（🔴 必查）

- [ ] 凭证只在 `.env`，未硬编码、未 log 明文
- [ ] SQL 参数化、无注入；`better-sqlite3` 用绝对路径 require（v13.0.3）
- [ ] 无外部输入未转义拼入 YAML regex / SQL

## 可维护性 / 测试（🟡）

- [ ] 优先复用现有包；配置优先 YAML
- [ ] 重要逻辑（去重/解析/金额换算等）有/补了 co-located 单测
- [ ] 无不必要的重复代码、命名清晰

## 审查结论

<!-- reviewer 填写：无 🔴 / 有 🔴 待修 / 🟡 已达成共识或记 follow-up。满足 DoD（docs/15 §15.5.3）方可合并。 -->
