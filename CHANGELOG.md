# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

## [1.2.0](https://github.com/GuoSirius/competitor-crawler/compare/v1.1.0...v1.2.0) (2026-09-30)


### 🏠 其他 (Miscellaneous)

* **scripts:** changelog 收录全部提交类型并按 tag 全量重建 ([d5bdcd4](https://github.com/GuoSirius/competitor-crawler/commit/d5bdcd4d57d410c3af6e594f80cd58326e4e346c))


### 🚀 新功能 (Features)

* 默认 config 源、面包屑动态分类与公司复用补全 ([a581b40](https://github.com/GuoSirius/competitor-crawler/commit/a581b4090981e584b17c6898844fc14d623263ab))
* crawl --site 支持逗号分隔多站 ([d8620d3](https://github.com/GuoSirius/competitor-crawler/commit/d8620d3a1a06dc97197cbce985d6cb3f6fcd9953))
* **crawl:** yaml公司属性competitorType/role随公司upsert落库 ([ab7e49f](https://github.com/GuoSirius/competitor-crawler/commit/ab7e49f363ab4032712a0b37f49217f68d504cdf))


### 📚 文档 (Documentation)

* 钉死 sku/price/specText 默认规格口径与形态c说明 ([eab8f8c](https://github.com/GuoSirius/competitor-crawler/commit/eab8f8c484f5aa73e7c8a0c8ff325351a0b67653))
* 声明 yaml 唯一真相源并登记面包屑动态分类用法 ([5ef7b51](https://github.com/GuoSirius/competitor-crawler/commit/5ef7b511b7c4c147b14b75d34e747f3cf9d5ed15))
* **config:** 站点模板补齐真相源声明/分类归属/公司属性与形态c口径 ([aaae859](https://github.com/GuoSirius/competitor-crawler/commit/aaae859367d20095033940ce5b8ef30cdfec256f))

# Changelog

## v1.1.0

[compare changes](https://github.com/GuoSirius/competitor-crawler/compare/v1.0.0...v1.1.0)

### 🚀 新功能 (Features)

- 详情并发数支持按 cpu 核心数动态兜底 ([66b2ce8](https://github.com/GuoSirius/competitor-crawler/commit/66b2ce8))
- 代码适配器钩子接线落地并收敛共享层口径 ([3c3376e](https://github.com/GuoSirius/competitor-crawler/commit/3c3376e))
- **crawler:** 接入模型告警摘要并集中管理提示词 ([29514de](https://github.com/GuoSirius/competitor-crawler/commit/29514de))
- 泛型内容采集管线（contents 表），站点 YAML 支持 contentType 路由新闻/公告 ([c2b7957](https://github.com/GuoSirius/competitor-crawler/commit/c2b7957))
- **web:** 后台管理风格布局重构，支持暗黑/亮色双主题默认暗黑 ([1333278](https://github.com/GuoSirius/competitor-crawler/commit/1333278))
- **shared:** 支持 MySQL/PostgreSQL 方言 schema 与 createDb 分支 ([d72c693](https://github.com/GuoSirius/competitor-crawler/commit/d72c693))
- **web:** 内部对标平台 MVP（看板/详情/告警/站点管理 + DB API） ([b60598a](https://github.com/GuoSirius/competitor-crawler/commit/b60598a))
- **scheduler:** 定时爬取调度与企微/钉钉 webhook 告警推送 ([0a9c8a6](https://github.com/GuoSirius/competitor-crawler/commit/0a9c8a6))
- **scripts:** 交互选择发布类型时实时预览目标版本号 ([9a1347b](https://github.com/GuoSirius/competitor-crawler/commit/9a1347b))

### 🐛 缺陷修复 (Bug Fixes)

- **web:** 时间展示走统一封装并补错误态与资源释放 ([d277b46](https://github.com/GuoSirius/competitor-crawler/commit/d277b46))
- **crawler:** 补 schedule 入口并落实体检报告爬虫侧修复 ([a6b60b6](https://github.com/GuoSirius/competitor-crawler/commit/a6b60b6))
- **shared:** mysql schema 全量 varchar 化并统一时间封装入口 ([240919c](https://github.com/GuoSirius/competitor-crawler/commit/240919c))
- **web:** 启用 unocss preflight 重置 body 外边距消除页面白边 ([355564c](https://github.com/GuoSirius/competitor-crawler/commit/355564c))
- **web:** 监听所有网卡并修正打包后 repoRoot/.env 解析 ([355856c](https://github.com/GuoSirius/competitor-crawler/commit/355856c))

### 📚 文档 (Documentation)

- 收口体检报告拍板项并对齐 web 页面能力口径 ([384c18a](https://github.com/GuoSirius/competitor-crawler/commit/384c18a))
- 工程规范补时间处理章节并登记体检报告二次确认结论 ([ffe2bf2](https://github.com/GuoSirius/competitor-crawler/commit/ffe2bf2))
- 刷新架构图与流转图并新增适配器示例 ([a05b0b2](https://github.com/GuoSirius/competitor-crawler/commit/a05b0b2))
- 新增代码质量与规范体检报告（docs/16） ([5aef0fb](https://github.com/GuoSirius/competitor-crawler/commit/5aef0fb))
- 新增代码审查标准与流程（docs/15）与 PR 模板 ([47fce98](https://github.com/GuoSirius/competitor-crawler/commit/47fce98))
- **13:** 补充网页平台使用与自助加站点，登记 schedule 命令 ([7fa782f](https://github.com/GuoSirius/competitor-crawler/commit/7fa782f))

### ♻️ 代码重构 (Refactors)

- dedupe_key 更名 identity_key（身份键），见名知意 ([162d0a7](https://github.com/GuoSirius/competitor-crawler/commit/162d0a7))
- 分类表改通用树模型并重设计唯一键与溯源字段 ([d9302c5](https://github.com/GuoSirius/competitor-crawler/commit/d9302c5))
- **crawler:** 用 p-limit 替代自研 mapLimit ([a87306b](https://github.com/GuoSirius/competitor-crawler/commit/a87306b))
- 抽取 excel 公共助手并为详情抓取加并发限制 ([96286f5](https://github.com/GuoSirius/competitor-crawler/commit/96286f5))

### ✅ 测试 (Tests)

- 补齐体检报告 Q1~Q5 测试并自建空库基建 ([93832ef](https://github.com/GuoSirius/competitor-crawler/commit/93832ef))

### 🔄 持续集成 (CI)

- 补 commitlint 与 eslint 门禁步骤 ([623234b](https://github.com/GuoSirius/competitor-crawler/commit/623234b))

## v1.0.0

### 🚀 新功能 (Features)

- **sites:** add Starter(ua-bio)/icellbioscience/seafrom configs (probe-validated) ([bdf3ccc](https://github.com/GuoSirius/competitor-crawler/commit/bdf3ccc))
- 形态C的pick支持点号路径，规格变体扩展sku键 ([5a6ca3b](https://github.com/GuoSirius/competitor-crawler/commit/5a6ca3b))
- 公司表新增 role 标志位区分我方与竞品 ([eaf10d5](https://github.com/GuoSirius/competitor-crawler/commit/eaf10d5))
- **sites:** xpbiomed 新增血清栏目(lcid=1)，扩大抓取覆盖 ([3e2b90e](https://github.com/GuoSirius/competitor-crawler/commit/3e2b90e))
- **crawler:** crawl 默认回退 seeds，config 模式支持按 productLine 过滤（YAML section.productLine） ([c74c38f](https://github.com/GuoSirius/competitor-crawler/commit/c74c38f))
- **crawler:** 爬取范围支持 config/seeds 切换，YAML 与代码适配器互斥隔离，新增 section/category/product-line 过滤 ([f03b269](https://github.com/GuoSirius/competitor-crawler/commit/f03b269))
- 新增站点配置批量生成（模板与批处理命令） ([c9d32a0](https://github.com/GuoSirius/competitor-crawler/commit/c9d32a0))
- **crawler:** crawl/probe 接入模型兜底（形态 E） ([cde84f2](https://github.com/GuoSirius/competitor-crawler/commit/cde84f2))
- **crawler:** 新增形态 E 的模型兜底适配器 ([2c16ae1](https://github.com/GuoSirius/competitor-crawler/commit/2c16ae1))
- **crawler:** 探测多 Tab 结构并判断是否需要点击 ([0a58c4c](https://github.com/GuoSirius/competitor-crawler/commit/0a58c4c))
- **crawler:** 让 config/model.yaml 真正生效（env 优先覆盖） ([e22a7d2](https://github.com/GuoSirius/competitor-crawler/commit/e22a7d2))
- **crawler:** 页面 HTML 转模型可读可见文本 ([ebae2d8](https://github.com/GuoSirius/competitor-crawler/commit/ebae2d8))
- **shared:** 增加模型兜底提取的输出契约（Zod） ([9af39ad](https://github.com/GuoSirius/competitor-crawler/commit/9af39ad))
- **crawler:** report --charts 输出自包含 ECharts HTML（6 张图） ([f409a72](https://github.com/GuoSirius/competitor-crawler/commit/f409a72))
- **crawler:** 实现 report 命令（Excel 导出：总览/价格清单/字段覆盖） ([adc5225](https://github.com/GuoSirius/competitor-crawler/commit/adc5225))
- **crawler:** add xpbiomed (逍鹏生物) adapter + seed for 2nd-station pilot ([a72cfa0](https://github.com/GuoSirius/competitor-crawler/commit/a72cfa0))
- **crawler:** add pagination-url strategy (URL template pagination) ([d299091](https://github.com/GuoSirius/competitor-crawler/commit/d299091))
- **crawler:** probe 增加规格价格形态探测与 NEEDS_API_HINT 告警指引 ([c55b7d7](https://github.com/GuoSirius/competitor-crawler/commit/c55b7d7))
- **crawler:** 新增 detailApi 配置与通用 JSON 接口抓取 ([c561e5d](https://github.com/GuoSirius/competitor-crawler/commit/c561e5d))
- **shared:** 支持 json/jsonPath/pick 抽取内联 JSON 与键重命名 ([cbd5aad](https://github.com/GuoSirius/competitor-crawler/commit/cbd5aad))
- **shared:** 支持 $self 读取元素自身属性，SpecItem 增加原价字段 ([889e5c8](https://github.com/GuoSirius/competitor-crawler/commit/889e5c8))
- **crawler:** 列表字段兜底合并、新字段落库、价格历史写入与站点币种配置 ([b483028](https://github.com/GuoSirius/competitor-crawler/commit/b483028))
- **shared:** products 新增货号、价格等 8 列，新增 price_history 表 ([ad88416](https://github.com/GuoSirius/competitor-crawler/commit/ad88416))
- **shared:** 为 FieldSpec 增加 number 数值抽取能力 ([ea34aa9](https://github.com/GuoSirius/competitor-crawler/commit/ea34aa9))
- **crawler:** crawl 改为按站点 sections 抓取，新增 section.category 绑定种子品类 ([f94137a](https://github.com/GuoSirius/competitor-crawler/commit/f94137a))
- **crawler:** 实现 crawl 全链路（翻页/详情/upsert/软删）并接线 --site/--dry-run ([b3a2d6f](https://github.com/GuoSirius/competitor-crawler/commit/b3a2d6f))
- **shared:** 新增 URL 规范化与去重键工具（canonicalizeUrl/pickDedupeKey） ([30a097e](https://github.com/GuoSirius/competitor-crawler/commit/30a097e))
- **config:** 提供单规则/多规则两套站点 YAML 模板并补 sections 示例 ([f3c1b97](https://github.com/GuoSirius/competitor-crawler/commit/f3c1b97))
- **crawler:** 列表解析透传 sectionKey，probe 逐栏目验证并支持 --section ([dc83bcd](https://github.com/GuoSirius/competitor-crawler/commit/dc83bcd))
- **crawler:** 站点配置支持 sections 多栏目多规则并新增 resolveSections 归一化 ([7a5e678](https://github.com/GuoSirius/competitor-crawler/commit/7a5e678))
- **shared:** products 增加 section_key 并入去重键（去重口径 B） ([367f4c2](https://github.com/GuoSirius/competitor-crawler/commit/367f4c2))
- 根 package.json 镜像全部脚本并加入 release/commitlint 工具依赖 ([ca11458](https://github.com/GuoSirius/competitor-crawler/commit/ca11458))
- **release:** 新增单一发布入口 scripts/release.mjs 与 .versionrc.json ([94f98aa](https://github.com/GuoSirius/competitor-crawler/commit/94f98aa))
- **crawler:** 实现 probe/gen-site/backfill 命令并完成 CLI 接线 ([234322c](https://github.com/GuoSirius/competitor-crawler/commit/234322c))
- **shared:** 新增共享数据层：drizzle schema、字段抽取 spec/extract 适配器与 dayjs 时间工具 ([2c7a020](https://github.com/GuoSirius/competitor-crawler/commit/2c7a020))

### 🐛 缺陷修复 (Bug Fixes)

- **fetch:** add stealth to spaFetch to bypass CloudFront/阿里云 WAF ([35ddb7b](https://github.com/GuoSirius/competitor-crawler/commit/35ddb7b))
- 修正种子 Excel 官网链接并合并诺唯赞重复条目 ([a7aefda](https://github.com/GuoSirius/competitor-crawler/commit/a7aefda))
- ssrFetch 默认 UA 改为浏览器标识避免 SSR 空壳 ([efadb2f](https://github.com/GuoSirius/competitor-crawler/commit/efadb2f))
- formatBj数字入参按unix秒解析避免误判为毫秒 ([0e56bff](https://github.com/GuoSirius/competitor-crawler/commit/0e56bff))
- **seed:** 修正 cellUrl 误读 ExcelJS 超链接 target，恢复品类链接整列真实 URL ([e2fd20b](https://github.com/GuoSirius/competitor-crawler/commit/e2fd20b))
- **seed:** 规范 59 家竞品名称与官网，修复品类列为空时整行漏入 ([d3ac044](https://github.com/GuoSirius/competitor-crawler/commit/d3ac044))
- 种子链接优先取品类链接列，首页仅作兜底 ([ae808a2](https://github.com/GuoSirius/competitor-crawler/commit/ae808a2))
- **crawler:** dry-run 全程零写入，跳过 crawls 运行记录与 finalize ([1886b1d](https://github.com/GuoSirius/competitor-crawler/commit/1886b1d))
- **crawler:** dry-run 下 config 模式公司/品类 upsert 改为仅预览 ([965c1e7](https://github.com/GuoSirius/competitor-crawler/commit/965c1e7))
- **scripts:** 修正 web typecheck 的 bin 路径被 cwd 二次拼接 ([cca679b](https://github.com/GuoSirius/competitor-crawler/commit/cca679b))
- **shared:** 索引回调改数组形式，消除 drizzle 0.45 弃用签名 ([6c45d34](https://github.com/GuoSirius/competitor-crawler/commit/6c45d34))
- **crawler:** 列表重复链接去重，修正计数虚高与重复抓取 ([b2605ba](https://github.com/GuoSirius/competitor-crawler/commit/b2605ba))
- **crawler:** resolve relative detailUrl in probe before fetching detail ([1cb23d1](https://github.com/GuoSirius/competitor-crawler/commit/1cb23d1))
- **shared:** import FieldSpec from ./spec.js in extract.test.ts ([9385d16](https://github.com/GuoSirius/competitor-crawler/commit/9385d16))
- **crawler:** 修正模型客户端环境变量名与 .env 约定不一致 ([800ee0f](https://github.com/GuoSirius/competitor-crawler/commit/800ee0f))
- 钩子文件补 shebang，修复 Windows 下 git 无法执行回退钩子 ([f39e457](https://github.com/GuoSirius/competitor-crawler/commit/f39e457))
- **crawler:** 修正 config/sites 与 data/seeds 路径上溯层级（少退一层） ([a27b8b2](https://github.com/GuoSirius/competitor-crawler/commit/a27b8b2))
- **docs:** 修正 release 命令竖线截断表格的渲染问题 ([bf41531](https://github.com/GuoSirius/competitor-crawler/commit/bf41531))
- **crawler:** seed 产出自动建目录并对种子输入目录做存在性校验 ([fdea6c0](https://github.com/GuoSirius/competitor-crawler/commit/fdea6c0))
- **shared:** 修正 .env/sqlite 路径上溯层级并自动创建数据目录 ([baa4599](https://github.com/GuoSirius/competitor-crawler/commit/baa4599))
- **seed:** loadSeeds 空产品线改用 isNull 比较修正 =NULL 语义 ([b9d9d0f](https://github.com/GuoSirius/competitor-crawler/commit/b9d9d0f))
- **crawler:** backfill 改用 drizzle 查询构建器替代不存在的 db.execute ([931d98c](https://github.com/GuoSirius/competitor-crawler/commit/931d98c))
- **crawler:** cheerioDom 节点类型用 any 封装以兼容 cheerio 1.x ([0d1287a](https://github.com/GuoSirius/competitor-crawler/commit/0d1287a))
- **deps:** 用 pnpm patch 为 dayjs 补 exports 字段以兼容 NodeNext 子路径导入 ([49fe636](https://github.com/GuoSirius/competitor-crawler/commit/49fe636))
- 封装 pnpm playwright:install 修正 root 下找不到二进制的不一致 ([cfc2808](https://github.com/GuoSirius/competitor-crawler/commit/cfc2808))

### ⚡ 性能优化 (Performance)

- spa渲染双稳定检测与翻页上限显式意图放行 ([52bc4ee](https://github.com/GuoSirius/competitor-crawler/commit/52bc4ee))

### 📚 文档 (Documentation)

- **14:** restore clickable links in B/C/E tables (fix rewrite regression) ([70358cd](https://github.com/GuoSirius/competitor-crawler/commit/70358cd))
- **14:** rewrite with 44-station re-probe classification ([bc7e60a](https://github.com/GuoSirius/competitor-crawler/commit/bc7e60a))
- 记录 D 类斯达特/金斯瑞周一复探结论（均 JS 渲染，需 chromium） ([f59057f](https://github.com/GuoSirius/competitor-crawler/commit/f59057f))
- 重新过滤问题清单并标注碧云天型纠偏 ([6eb3210](https://github.com/GuoSirius/competitor-crawler/commit/6eb3210))
- 索引补齐13/14并重写站点清单，全量附官网与问题页链接 ([85d4957](https://github.com/GuoSirius/competitor-crawler/commit/85d4957))
- 新增小白操作手册（非开发同学全流程上手） ([d989262](https://github.com/GuoSirius/competitor-crawler/commit/d989262))
- **seeds:** 更新竞品待爬清单复测结果与探针临时目录文案 ([6460930](https://github.com/GuoSirius/competitor-crawler/commit/6460930))
- 新增 AGENTS.md 入场须知，固化唯一真相源与硬规则 ([44e4ada](https://github.com/GuoSirius/competitor-crawler/commit/44e4ada))
- 挂载架构图与流程图，修正架构描述中的过期信息 ([053cf1e](https://github.com/GuoSirius/competitor-crawler/commit/053cf1e))
- 补录 gen-site:template/batch 文档，统一子包与根脚本命名 ([ec70e55](https://github.com/GuoSirius/competitor-crawler/commit/ec70e55))
- 补充环境变量契约规范与 CI 落地说明 ([cd952a3](https://github.com/GuoSirius/competitor-crawler/commit/cd952a3))
- 同步规格价格四形态、api 配置位置、测试与钩子规范 ([0540bd2](https://github.com/GuoSirius/competitor-crawler/commit/0540bd2))
- 新增规格与多价格四形态章节，修正 FieldSpec 简写笔误 ([18d70c9](https://github.com/GuoSirius/competitor-crawler/commit/18d70c9))
- 同步 products 字段分层、price_history 表与货号不参与去重的口径 ([21b61fe](https://github.com/GuoSirius/competitor-crawler/commit/21b61fe))
- 更新 crawl 用法（流程与新增参数） ([dfbbe1e](https://github.com/GuoSirius/competitor-crawler/commit/dfbbe1e))
- 补充 sections 多规则与两套模板说明，标注 web typecheck 暂屏蔽并修正 git 用法 ([1a16e32](https://github.com/GuoSirius/competitor-crawler/commit/1a16e32))
- 补充验证/脚本手册/工程规范文档并完善交叉引用 ([99d21fa](https://github.com/GuoSirius/competitor-crawler/commit/99d21fa))
- 新增快速开始与安装运行说明 ([75a32f1](https://github.com/GuoSirius/competitor-crawler/commit/75a32f1))

### ♻️ 代码重构 (Refactors)

- **scripts:** 脚本仓库根改为相对 import.meta.url 推导，移除硬编码绝对路径 ([b84a9ee](https://github.com/GuoSirius/competitor-crawler/commit/b84a9ee))
- **crawler:** 代码适配器改为加性钩子，取消 YAML 互斥与站点跳过 ([98d5b43](https://github.com/GuoSirius/competitor-crawler/commit/98d5b43))
- **shared:** 集中 repoRoot/dataDir，消除路径上溯层级重复 ([35a1395](https://github.com/GuoSirius/competitor-crawler/commit/35a1395))
- **shared:** 收敛 ListStrategy 到单一事实源，修复 shared 版本漏 pagination-url ([4f4f374](https://github.com/GuoSirius/competitor-crawler/commit/4f4f374))
- 将 CheerioDomRead 归位 shared 并随测试迁移 ([aaf4bdd](https://github.com/GuoSirius/competitor-crawler/commit/aaf4bdd))

### ✅ 测试 (Tests)

- **crawler:** 新增环境变量契约校验与模型配置解析单测 ([7032f77](https://github.com/GuoSirius/competitor-crawler/commit/7032f77))
- 补 vitest 配置与抽取层/形态探测/配置归一化单测（56 例） ([a4c6660](https://github.com/GuoSirius/competitor-crawler/commit/a4c6660))

### 🔧 构建 (Build)

- 提交 pnpm-lock.yaml 锁定新增依赖 ([cd41b41](https://github.com/GuoSirius/competitor-crawler/commit/cd41b41))

### 🔄 持续集成 (CI)

- 新增 GitHub Actions 门禁，跑 typecheck 与单测 ([b909f12](https://github.com/GuoSirius/competitor-crawler/commit/b909f12))
- 接入 commitlint 校验（.commitlintrc.json） ([dc0b969](https://github.com/GuoSirius/competitor-crawler/commit/dc0b969))

### 🏠 其他 (Miscellaneous)

- **sites:** 新增江莱生物与赛业站点配置 ([5a5fdea](https://github.com/GuoSirius/competitor-crawler/commit/5a5fdea))
- 渲染探针脚本入库并登记辅助脚本文档 ([14e746a](https://github.com/GuoSirius/competitor-crawler/commit/14e746a))
- **sites:** 新增atcc与ptglab与碧云天配置，cytiva抽取规格变体 ([502237a](https://github.com/GuoSirius/competitor-crawler/commit/502237a))
- **sites:** 批次2接入依科赛(30栏目)/思拓凡(14栏目)，新增问题清单与脚本说明 ([4634998](https://github.com/GuoSirius/competitor-crawler/commit/4634998))
- **sites:** 批次1接入联科/格锐思/盒子生工/海狸四站配置（dry-run 验证通过） ([2f0b964](https://github.com/GuoSirius/competitor-crawler/commit/2f0b964))
- **sites:** 新增菲恩生物站点配置与竞品待爬清单探针工具及报告 ([be1e233](https://github.com/GuoSirius/competitor-crawler/commit/be1e233))
- **sites:** xpbiomed 扩充 11 个栏目（血清/基础培养基/辅助试剂家族） ([7a2d381](https://github.com/GuoSirius/competitor-crawler/commit/7a2d381))
- 移除项目内技能发布包目录（改放项目平级） ([8aaa035](https://github.com/GuoSirius/competitor-crawler/commit/8aaa035))
- 新增技能发布包目录（供发布到 open.workbuddy.cn） ([90641b9](https://github.com/GuoSirius/competitor-crawler/commit/90641b9))
- 将 pnpm overrides 迁移至 pnpm-workspace.yaml（pnpm 12 风格） ([a1c7d62](https://github.com/GuoSirius/competitor-crawler/commit/a1c7d62))
- typecheck 收敛为单一入口，自动纳管 web ([0e225bc](https://github.com/GuoSirius/competitor-crawler/commit/0e225bc))
- **scripts:** 重构 release 流程（门禁+提交+方向键选类型+推送） ([36d5194](https://github.com/GuoSirius/competitor-crawler/commit/36d5194))
- 清理无用空目录并规范 .gitkeep 占位 ([f1a0955](https://github.com/GuoSirius/competitor-crawler/commit/f1a0955))
- 引入 husky 与提交前门禁，钩子逻辑统一到 node 脚本 ([b31b7f1](https://github.com/GuoSirius/competitor-crawler/commit/b31b7f1))
- **sites:** 模板补充 currency、number、$self、原价与内置字段清单 ([c28ee0e](https://github.com/GuoSirius/competitor-crawler/commit/c28ee0e))
- **sites:** 中乔新舟改用 sku/price/specText 等一等公民字段名 ([2289715](https://github.com/GuoSirius/competitor-crawler/commit/2289715))
- **sites:** 新增上海中乔新舟站点适配（3 栏目，section.category 绑定品类） ([51d6508](https://github.com/GuoSirius/competitor-crawler/commit/51d6508))
- 忽略 sqlite WAL/SHM 临时文件 ([3ae5a2f](https://github.com/GuoSirius/competitor-crawler/commit/3ae5a2f))
- typecheck 暂排除 web 并预留 typecheck:web/all 入口 ([719bf49](https://github.com/GuoSirius/competitor-crawler/commit/719bf49))
- 新增 .env.example、种子数据与测试占位 ([2e0c6eb](https://github.com/GuoSirius/competitor-crawler/commit/2e0c6eb))
- **config:** 新增站点适配器配置模板与模型配置，忽略派生种子 JSON ([e0d9c6c](https://github.com/GuoSirius/competitor-crawler/commit/e0d9c6c))
- **pnpm:** 构建白名单改用 allowBuilds 修复 install 报错 ([1fdfc83](https://github.com/GuoSirius/competitor-crawler/commit/1fdfc83))
