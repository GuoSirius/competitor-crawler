# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

## 1.0.0 (2026-09-28)


### Features

* 根 package.json 镜像全部脚本并加入 release/commitlint 工具依赖 ([ca11458](https://github.com/GuoSirius/competitor-crawler/commit/ca11458e867c557a54296003c551d9399f89eef9))
* 公司表新增 role 标志位区分我方与竞品 ([eaf10d5](https://github.com/GuoSirius/competitor-crawler/commit/eaf10d579bec1e7cdc5c9ef6f2f905e0b63020c0))
* 新增站点配置批量生成（模板与批处理命令） ([c9d32a0](https://github.com/GuoSirius/competitor-crawler/commit/c9d32a0a923db89e75ded1bc88916369d8bc0b64))
* 形态C的pick支持点号路径，规格变体扩展sku键 ([5a6ca3b](https://github.com/GuoSirius/competitor-crawler/commit/5a6ca3bde35fbc7cc15c9bf7bf16b783d96b2b84))
* **config:** 提供单规则/多规则两套站点 YAML 模板并补 sections 示例 ([f3c1b97](https://github.com/GuoSirius/competitor-crawler/commit/f3c1b974f00ef737f0b6d4a3d864a524961ce9dc))
* **crawler:** 列表解析透传 sectionKey，probe 逐栏目验证并支持 --section ([dc83bcd](https://github.com/GuoSirius/competitor-crawler/commit/dc83bcd43b8b784576b0f70c9121d52aeb087d59))
* **crawler:** 列表字段兜底合并、新字段落库、价格历史写入与站点币种配置 ([b483028](https://github.com/GuoSirius/competitor-crawler/commit/b483028b9051aef8eb37e3bbb03b9808fbe7f272))
* **crawler:** 爬取范围支持 config/seeds 切换，YAML 与代码适配器互斥隔离，新增 section/category/product-line 过滤 ([f03b269](https://github.com/GuoSirius/competitor-crawler/commit/f03b2690661c90847cc86454e3b25450e130fce5))
* **crawler:** 让 config/model.yaml 真正生效（env 优先覆盖） ([e22a7d2](https://github.com/GuoSirius/competitor-crawler/commit/e22a7d2e4650ab4d4b5b5662e67a86c54a8f820b))
* **crawler:** 实现 crawl 全链路（翻页/详情/upsert/软删）并接线 --site/--dry-run ([b3a2d6f](https://github.com/GuoSirius/competitor-crawler/commit/b3a2d6f3741ae28b3fbd82b428ee32e324df2fcb))
* **crawler:** 实现 probe/gen-site/backfill 命令并完成 CLI 接线 ([234322c](https://github.com/GuoSirius/competitor-crawler/commit/234322cd35abe66ee7f3eb4a42c11cb509cee979))
* **crawler:** 实现 report 命令（Excel 导出：总览/价格清单/字段覆盖） ([adc5225](https://github.com/GuoSirius/competitor-crawler/commit/adc522590112670ca2ddfd60374cdff7597c5b47))
* **crawler:** 探测多 Tab 结构并判断是否需要点击 ([0a58c4c](https://github.com/GuoSirius/competitor-crawler/commit/0a58c4c3d6afb83d314d6f96765f7a4e06692cc0))
* **crawler:** 新增 detailApi 配置与通用 JSON 接口抓取 ([c561e5d](https://github.com/GuoSirius/competitor-crawler/commit/c561e5daab9c1930acb9fb4c00d30b304866c327))
* **crawler:** 新增形态 E 的模型兜底适配器 ([2c16ae1](https://github.com/GuoSirius/competitor-crawler/commit/2c16ae1beb43c2e96ae07cda23af481702d7779e))
* **crawler:** 页面 HTML 转模型可读可见文本 ([ebae2d8](https://github.com/GuoSirius/competitor-crawler/commit/ebae2d85b2419f9167045249e151baa185ac0ebd))
* **crawler:** 站点配置支持 sections 多栏目多规则并新增 resolveSections 归一化 ([7a5e678](https://github.com/GuoSirius/competitor-crawler/commit/7a5e678afdebaec74f93294a40817e7d30133374))
* **crawler:** add pagination-url strategy (URL template pagination) ([d299091](https://github.com/GuoSirius/competitor-crawler/commit/d299091c98df9f4f1b30ac81923d5887bcddf595))
* **crawler:** add xpbiomed (逍鹏生物) adapter + seed for 2nd-station pilot ([a72cfa0](https://github.com/GuoSirius/competitor-crawler/commit/a72cfa085ffd52349392e4988ca771f6aae538f9))
* **crawler:** crawl 改为按站点 sections 抓取，新增 section.category 绑定种子品类 ([f94137a](https://github.com/GuoSirius/competitor-crawler/commit/f94137a361dcdab6486fc2fc7cba27754f845c06))
* **crawler:** crawl 默认回退 seeds，config 模式支持按 productLine 过滤（YAML section.productLine） ([c74c38f](https://github.com/GuoSirius/competitor-crawler/commit/c74c38fc0b7a4095a73844265b6fa4c92b705d1a))
* **crawler:** crawl/probe 接入模型兜底（形态 E） ([cde84f2](https://github.com/GuoSirius/competitor-crawler/commit/cde84f2fa475a0ebe6bfb89e4769a27ae4bb7e81))
* **crawler:** probe 增加规格价格形态探测与 NEEDS_API_HINT 告警指引 ([c55b7d7](https://github.com/GuoSirius/competitor-crawler/commit/c55b7d711a5c52683538fb7c53b2b8c14825d4d8))
* **crawler:** report --charts 输出自包含 ECharts HTML（6 张图） ([f409a72](https://github.com/GuoSirius/competitor-crawler/commit/f409a725d5eba525fc1e8c5a29ff6f0c69bf100a))
* **release:** 新增单一发布入口 scripts/release.mjs 与 .versionrc.json ([94f98aa](https://github.com/GuoSirius/competitor-crawler/commit/94f98aa773f96e6545e2c93324549b117a062471))
* **shared:** 为 FieldSpec 增加 number 数值抽取能力 ([ea34aa9](https://github.com/GuoSirius/competitor-crawler/commit/ea34aa9d9b3486770078560f490a0673816e4aba))
* **shared:** 新增 URL 规范化与去重键工具（canonicalizeUrl/pickDedupeKey） ([30a097e](https://github.com/GuoSirius/competitor-crawler/commit/30a097ec3a57c170c80cf05a44eb022249ae01d7))
* **shared:** 新增共享数据层：drizzle schema、字段抽取 spec/extract 适配器与 dayjs 时间工具 ([2c7a020](https://github.com/GuoSirius/competitor-crawler/commit/2c7a020bfd7fdcf93cb783164282da209aa73c9b))
* **shared:** 增加模型兜底提取的输出契约（Zod） ([9af39ad](https://github.com/GuoSirius/competitor-crawler/commit/9af39ad0282576cd3f021cc92d2ae03a1095f983))
* **shared:** 支持 $self 读取元素自身属性，SpecItem 增加原价字段 ([889e5c8](https://github.com/GuoSirius/competitor-crawler/commit/889e5c829d3aa872a54db989806a42d4af53f9a4))
* **shared:** 支持 json/jsonPath/pick 抽取内联 JSON 与键重命名 ([cbd5aad](https://github.com/GuoSirius/competitor-crawler/commit/cbd5aad5d1c6cc3da93513da8f0bc3a7f80819b1))
* **shared:** products 新增货号、价格等 8 列，新增 price_history 表 ([ad88416](https://github.com/GuoSirius/competitor-crawler/commit/ad884169d8cfaa4729e560c732d19305d4fe94ac))
* **shared:** products 增加 section_key 并入去重键（去重口径 B） ([367f4c2](https://github.com/GuoSirius/competitor-crawler/commit/367f4c26307246ac38909f2033aa965ad69d78d9))
* **sites:** add Starter(ua-bio)/icellbioscience/seafrom configs (probe-validated) ([bdf3ccc](https://github.com/GuoSirius/competitor-crawler/commit/bdf3cccdf995e44c0d38e721344b0dd272b341c5))
* **sites:** xpbiomed 新增血清栏目(lcid=1)，扩大抓取覆盖 ([3e2b90e](https://github.com/GuoSirius/competitor-crawler/commit/3e2b90e2f202bdb44101cc6451f569f2337229f0))


### Bug Fixes

* 封装 pnpm playwright:install 修正 root 下找不到二进制的不一致 ([cfc2808](https://github.com/GuoSirius/competitor-crawler/commit/cfc2808b3dfa05c78e3715fdf446d85850de96b0))
* 钩子文件补 shebang，修复 Windows 下 git 无法执行回退钩子 ([f39e457](https://github.com/GuoSirius/competitor-crawler/commit/f39e457c0826cc9e382f4a6e7d8c4df7543ebda6))
* 修正种子 Excel 官网链接并合并诺唯赞重复条目 ([a7aefda](https://github.com/GuoSirius/competitor-crawler/commit/a7aefda179069d23792f78742f2a1f4bba14394c))
* 种子链接优先取品类链接列，首页仅作兜底 ([ae808a2](https://github.com/GuoSirius/competitor-crawler/commit/ae808a2b4e9d2f6fa2d22e8f861cc6cb906cb4b8))
* **crawler:** 列表重复链接去重，修正计数虚高与重复抓取 ([b2605ba](https://github.com/GuoSirius/competitor-crawler/commit/b2605ba7b164458ce5fdba823b7fc1d12d389271))
* **crawler:** 修正 config/sites 与 data/seeds 路径上溯层级（少退一层） ([a27b8b2](https://github.com/GuoSirius/competitor-crawler/commit/a27b8b248a0b3ae362cc4ecff04cf830ca181cc6))
* **crawler:** 修正模型客户端环境变量名与 .env 约定不一致 ([800ee0f](https://github.com/GuoSirius/competitor-crawler/commit/800ee0f9071ffec30784e44670aa8eb997866e18))
* **crawler:** backfill 改用 drizzle 查询构建器替代不存在的 db.execute ([931d98c](https://github.com/GuoSirius/competitor-crawler/commit/931d98cb5d35472c8879165615216949fb198a84))
* **crawler:** cheerioDom 节点类型用 any 封装以兼容 cheerio 1.x ([0d1287a](https://github.com/GuoSirius/competitor-crawler/commit/0d1287a3bebba098cebe9b903856bbfd1867341c))
* **crawler:** dry-run 全程零写入，跳过 crawls 运行记录与 finalize ([1886b1d](https://github.com/GuoSirius/competitor-crawler/commit/1886b1d6a28be3535a9215a36b97a436bfde26f1))
* **crawler:** dry-run 下 config 模式公司/品类 upsert 改为仅预览 ([965c1e7](https://github.com/GuoSirius/competitor-crawler/commit/965c1e7db05b8dd94b0b3e0344509da66696b945))
* **crawler:** resolve relative detailUrl in probe before fetching detail ([1cb23d1](https://github.com/GuoSirius/competitor-crawler/commit/1cb23d10582180fa89a5d036f31e8cf3ffb7878c))
* **crawler:** seed 产出自动建目录并对种子输入目录做存在性校验 ([fdea6c0](https://github.com/GuoSirius/competitor-crawler/commit/fdea6c0da3431178ed1a4461b3e3031aced9da7a))
* **deps:** 用 pnpm patch 为 dayjs 补 exports 字段以兼容 NodeNext 子路径导入 ([49fe636](https://github.com/GuoSirius/competitor-crawler/commit/49fe636ba9fc36a3f7b4ef472ebd61c00a4fb440))
* **docs:** 修正 release 命令竖线截断表格的渲染问题 ([bf41531](https://github.com/GuoSirius/competitor-crawler/commit/bf4153173229f7c80931354e62a063772dcf4096))
* **fetch:** add stealth to spaFetch to bypass CloudFront/阿里云 WAF ([35ddb7b](https://github.com/GuoSirius/competitor-crawler/commit/35ddb7b397fde72f31f99fddae554e16721342dc))
* formatBj数字入参按unix秒解析避免误判为毫秒 ([0e56bff](https://github.com/GuoSirius/competitor-crawler/commit/0e56bffbfe355c53d0cd58173cf0f985a133b69e))
* **scripts:** 修正 web typecheck 的 bin 路径被 cwd 二次拼接 ([cca679b](https://github.com/GuoSirius/competitor-crawler/commit/cca679bad737c570fe4ec20d117a10985139e87e))
* **seed:** 规范 59 家竞品名称与官网，修复品类列为空时整行漏入 ([d3ac044](https://github.com/GuoSirius/competitor-crawler/commit/d3ac04414daa4b6b9df5d1328cd554c6344ffed2))
* **seed:** 修正 cellUrl 误读 ExcelJS 超链接 target，恢复品类链接整列真实 URL ([e2fd20b](https://github.com/GuoSirius/competitor-crawler/commit/e2fd20b8fa1089881e797faca6f67b3d80028a3e))
* **seed:** loadSeeds 空产品线改用 isNull 比较修正 =NULL 语义 ([b9d9d0f](https://github.com/GuoSirius/competitor-crawler/commit/b9d9d0f06d72884b8419381acca566acac56b95e))
* **shared:** 索引回调改数组形式，消除 drizzle 0.45 弃用签名 ([6c45d34](https://github.com/GuoSirius/competitor-crawler/commit/6c45d34b892a6bb771f65731e349468fbde29374))
* **shared:** 修正 .env/sqlite 路径上溯层级并自动创建数据目录 ([baa4599](https://github.com/GuoSirius/competitor-crawler/commit/baa4599c8b3457dbf46d3e2e8bd5be4ad6f13dda))
* **shared:** import FieldSpec from ./spec.js in extract.test.ts ([9385d16](https://github.com/GuoSirius/competitor-crawler/commit/9385d164f141c892a0c92f8ff313143a40f6eb11))
* ssrFetch 默认 UA 改为浏览器标识避免 SSR 空壳 ([efadb2f](https://github.com/GuoSirius/competitor-crawler/commit/efadb2f0e6b35890f88f8a3e2a58e3d6d48d6115))

# Changelog

> 本文件由 `standard-version` 在每次 `pnpm release` 时自动维护（基于 Conventional Commits）。首次发布请运行 `pnpm release`（按提交类型自动 bump）或 `pnpm release:major`（直接切 1.0.0）。
