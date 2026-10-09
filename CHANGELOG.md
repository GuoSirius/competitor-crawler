# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

## [1.7.0](https://github.com/GuoSirius/competitor-crawler/compare/v1.6.0...v1.7.0) (2026-10-09)


### ⚠ BREAKING CHANGES

* **fetch:** 旧名 spa 不再被识别（不保留别名），见下一条提交的取值守卫。

### ♻️ 代码重构 (Refactors)

* **sites:** 渲染模式更名同步到全部站点配置与文档 ([5f21d1a](https://github.com/GuoSirius/competitor-crawler/commit/5f21d1a37fc76bf7d55bbaea073176689e04a9b2))


### 🐛 缺陷修复 (Bug Fixes)

* **antibot:** 移除 context 级 extraHTTPHeaders，避免污染跨域 XHR 触发 CORS 失败 ([54fe192](https://github.com/GuoSirius/competitor-crawler/commit/54fe192cf377c0b33e322bfbd3922b2daf1b6d46))
* **crawler:** 代理透传补全，genSite/diagnose/sweep/apiSource 均接入站点 YAML proxy ([d61721e](https://github.com/GuoSirius/competitor-crawler/commit/d61721e99fe25232c26514e24654354f07b4f756))
* **crawler:** 托管挑战被误判死 + 指纹伪造改为只补缺不篡改 ([56e7f90](https://github.com/GuoSirius/competitor-crawler/commit/56e7f90e9f964a02a5f9264ba6fbe4f4e645eb8e))
* **crawler:** 诊断复用会话 cookie + languages 补主语言简写 ([babc35c](https://github.com/GuoSirius/competitor-crawler/commit/babc35ca05dafdf60108ea32f950354376a79d74))
* **crawler:** diagnose 的 ssr 通道改走原生 fetch + 解析 --no- 前缀 + 补接入 SOP ([f786424](https://github.com/GuoSirius/competitor-crawler/commit/f786424cef7399853d7ed6391a444addf822f6f0))
* **fetch:** auto 模式遇挑战页回退浏览器，翻页分支补上过盾 ([1b1a4a3](https://github.com/GuoSirius/competitor-crawler/commit/1b1a4a3e11e655df7fd3f881c5d1c94f45dca600))
* **plan:** dump cookies via in-process CDP and run pnpm with shell:true on windows ([c0f2d19](https://github.com/GuoSirius/competitor-crawler/commit/c0f2d19bbf42f44846650dafd8a41f429ba2976a))
* **plan:** read cookies from page target WebSocket instead of browser-level ([427cd1f](https://github.com/GuoSirius/competitor-crawler/commit/427cd1fdb7d1c965a17633570fbb0685e45871a0))
* **plan:** resolve pnpm ENOENT on windows and add plan:b converter ([77b73dc](https://github.com/GuoSirius/competitor-crawler/commit/77b73dc18df12895c26301087884e8915fe3787c))
* **plan:** use browser-style WebSocket API for CDP cookie dump ([66cf2ac](https://github.com/GuoSirius/competitor-crawler/commit/66cf2ac5ca24715bbf815283c7564c396b1f6792))
* **tools:** plan:a 增加从 .env 读取 CHROME_BIN 的回退，优化报错提示 ([2953767](https://github.com/GuoSirius/competitor-crawler/commit/29537677eb4f49c4c070601af59e97cff6213620))


### 🏠 其他 (Miscellaneous)

* **model:** cloud 默认 baseURL 改为实际在用的 apihub 中转 ([3de317b](https://github.com/GuoSirius/competitor-crawler/commit/3de317bf54c6ab706628f599c012b18949df266c))
* **model:** cloud 默认三元组对齐实际生效组合（apihub + agnes-2.5-flash） ([6dd3f6d](https://github.com/GuoSirius/competitor-crawler/commit/6dd3f6dbfe239065ff0c3634f269dcbf80896b97))
* **sites:** 新增 C 类 4 站代理版 YAML 桩（proxy 走 CRAWL_PROXY） ([a64d088](https://github.com/GuoSirius/competitor-crawler/commit/a64d0889ef9bacc7ba62a8ffd2cccd22426e2503))
* **tools:** 提升方案A/B脚本为正式 pnpm 命令 plan:a，忽略 .runtime ([6a6acad](https://github.com/GuoSirius/competitor-crawler/commit/6a6acada37ab757d0cc6c297d8cfac43e0ec12ec))


### 🚀 新功能 (Features)

* **adapter:** field spec 增加布尔强转，补齐标量第四类型 ([b0b21da](https://github.com/GuoSirius/competitor-crawler/commit/b0b21da93efc5988d1926418edd6977aea5be5b9))
* **config:** 渲染模式取值守卫（非法值不再静默退化成 auto） ([fc68221](https://github.com/GuoSirius/competitor-crawler/commit/fc682211b245b54620cdea157d96f13e6560ab4f))
* **crawler:** 新增 diagnose 命令，多通道对照 + 指纹体检给反爬归因 ([0551c5e](https://github.com/GuoSirius/competitor-crawler/commit/0551c5e7340d306da87a83d4f824d236dd836eff))
* **diff:** product_diffs 表与字段级变更捕获管线 ([bbc3ce8](https://github.com/GuoSirius/competitor-crawler/commit/bbc3ce82e0add8b8cda18030b72fedbe7ca4b216))
* **fetch:** 按需代理能力（yaml proxy 逐站配置 + CRAWL_PROXY 占位符，ssr/spa 双通道生效） ([b88487d](https://github.com/GuoSirius/competitor-crawler/commit/b88487d731f1ca09430804f29b9410998a4eaae9))
* **fetch:** 渲染模式 spa 更名 browser（含环境变量与函数） ([2e48a06](https://github.com/GuoSirius/competitor-crawler/commit/2e48a06b0259dce3be702f9420db8ac127c86f91))
* **fetch:** 有头模式窗口最大化铺满屏幕 ([fae7b3f](https://github.com/GuoSirius/competitor-crawler/commit/fae7b3fe9d2ffb8e79c60d792444279e1eb9e62d))
* **fetch:** browser 通道在未安装内置 chromium 时自动回退系统 chrome ([19dee06](https://github.com/GuoSirius/competitor-crawler/commit/19dee06b246e40cb6d0a92fbfbfb1257292d9c07))
* **plan:** auto-close Chrome after plan:a, add --keep-chrome to retain ([db74ddb](https://github.com/GuoSirius/competitor-crawler/commit/db74ddb54078e0829a78dd13cb815b73c7a7b81e))
* **probe:** 抓取失败统一给可执行建议，不再裸抛堆栈 ([6cf8080](https://github.com/GuoSirius/competitor-crawler/commit/6cf8080fc10cae2e5847ecbdffd79c415a3599d0))
* **sites:** 接入 cytion（C 类升 A 类，Shopware 列表 4 栏目 60 条，货号+价格齐全） ([30dcabe](https://github.com/GuoSirius/competitor-crawler/commit/30dcabe057e754df56369b17025e9f362a0b313a))
* **sites:** 接入 PromoCell/BioLegend，probe 管线补代码适配器钩子 ([aa267cf](https://github.com/GuoSirius/competitor-crawler/commit/aa267cf1909d2d0c6a77ffb75ce6b19d2fa5c2a6))
* **sites:** 接入 stemcell（C 类升 A 类，Magento ?p= 翻页，询价制无价格） ([3ad98cd](https://github.com/GuoSirius/competitor-crawler/commit/3ad98cdd68f0282f4d4afc0a654b32e4a6e28b90))
* **sites:** 诺唯赞接入（187 最后一级分类 + pagination-html，probe 1436 条） ([761e08e](https://github.com/GuoSirius/competitor-crawler/commit/761e08e83403f5a61d6d65a56153b6c849bf5dfb))
* **sites:** 中文站强制直连代理（resolveProxy）+ 接入 elabscience 英文站 ([9dd8e21](https://github.com/GuoSirius/competitor-crawler/commit/9dd8e21a80986a8ac231ac09c1702c3737168e87))
* **sites:** leinco 接入（algolia hits + pagination-url，16 分类） ([b208a7f](https://github.com/GuoSirius/competitor-crawler/commit/b208a7f77822e9c3d4de3697d3dcb03675b2d104))


### 📚 文档 (Documentation)

* **14:** 台账更新至 a 类 32 站，新增 5.5 代理口径（中文站强制直连） ([3c3929c](https://github.com/GuoSirius/competitor-crawler/commit/3c3929c2e7f006476719f27729459df3f650cd92))
* 按 diagnose 复测改判 C 类台账，登记三处真 bug 与判定纪律 ([747dc2a](https://github.com/GuoSirius/competitor-crawler/commit/747dc2a644b636fd8a2ea4f4faceed9c96a1160d))
* 清理已完成使命的体检报告快照与 plan:a 临时手册 ([be65125](https://github.com/GuoSirius/competitor-crawler/commit/be651253c2cbf28eefae957c6e1b223de825b61e))
* 台账按配置实况重新干净划分 ABC（A=38/B=6/C=0） ([0133620](https://github.com/GuoSirius/competitor-crawler/commit/0133620fe28d6ffe39c77c20591347f27ae9a920))
* 台账登记五处真 bug 与 auto/traverseList 修复，改写索莱宝与 Beckman 结论 ([ea3a6f2](https://github.com/GuoSirius/competitor-crawler/commit/ea3a6f2807689e3e5238be6abd981cb9896b3b56))
* 新增 YAML+适配器管线图并挂入文档 ([dfbc49d](https://github.com/GuoSirius/competitor-crawler/commit/dfbc49d468a08cfceac060e08f1594ebb262917b))
* 修复 assets SVG 在预览中溢出（响应式 + viewBox 减半 + scale 0.5） ([063d8e3](https://github.com/GuoSirius/competitor-crawler/commit/063d8e3c1344dc23591094785cbe5ad9e89676e6))
* **sites:** b类12站browser复测结论入账——7站产品卡渲染正常可配 ([7f7d937](https://github.com/GuoSirius/competitor-crawler/commit/7f7d9372b01eb4fc2231d6425a3900823b2c4bba))
* **sites:** b类下钻结论与plan:a过盾命令清单 ([946558e](https://github.com/GuoSirius/competitor-crawler/commit/946558e50f5eaa3cd74702dde93991c54f5b58df))
* **sites:** reclassify PromoCell/immocell C→B after user confirms openable ([d559293](https://github.com/GuoSirius/competitor-crawler/commit/d559293994979c8aed0d9d2a177256f7decb2c13))


### ✅ 测试 (Tests)

* **crawler:** 修复 capturedAt 偶发断言（时间戳只算一次） ([8c60da0](https://github.com/GuoSirius/competitor-crawler/commit/8c60da04d01c14470511dff94152c4386a22695c))

## [1.6.0](https://github.com/GuoSirius/competitor-crawler/compare/v1.5.0...v1.6.0) (2026-10-04)


### 🚀 新功能 (Features)

* **antibot:** 反爬基建——挑战页识别 + stealth 注入增强 + 拟人行为层 ([c33cd96](https://github.com/GuoSirius/competitor-crawler/commit/c33cd9693e2561843f00a5ecd7b5630678ab4152))
* **antibot:** 分层挑战检测 detectors（响应头+可见文本+状态码）+ 反向放行，压误检补漏检 ([d8939d9](https://github.com/GuoSirius/competitor-crawler/commit/d8939d9971662966715c61b5864e6974035ae6a3))
* **antibot:** 人工过盾等待 + storageState 会话持久化（过一次长期复用） ([e3464dd](https://github.com/GuoSirius/competitor-crawler/commit/e3464dd32e4db49cd371cc92d2d412e4759d66ad))
* **antibot:** antiBot 站点级/栏目级 YAML 配置接入（整体覆盖，默认零配置） ([3cbfe4f](https://github.com/GuoSirius/competitor-crawler/commit/3cbfe4f20cf5494b6fe10de86b8d976eea3a6738))
* **fetch:** 列表级 waitSelector 等待接口渲染 + 修 pageStart 透传与 stealth 默认值覆盖 ([0992a18](https://github.com/GuoSirius/competitor-crawler/commit/0992a18e59a090b08b5ff01944eeb1ef0c5edd91))
* **sites:** 爱博泰克 abclonal YAML（ssr 列表 + 内联 js 详情抽取） ([2d5c73b](https://github.com/GuoSirius/competitor-crawler/commit/2d5c73b33b1d89717f1269ad72e45d62359e547a))
* **sites:** 华安 YAML（spa 懒加载列表+价格双选择器）+ spaFetch 懒加载滚动兜底 ([8cd72df](https://github.com/GuoSirius/competitor-crawler/commit/8cd72dfde5d5ac559472f1c5be123e93bbc6d0f2))
* **sites:** 接入 cusabio/capricorn/fudancell 三站（下钻找到真实列表入口） ([dd6a43f](https://github.com/GuoSirius/competitor-crawler/commit/dd6a43f3e85a5f0f4341bef707aa5ad8913813bd))
* **sites:** 美森 ctcc YAML（六分类列表页 + aspx 分页，落地页下钻入口） ([de2b0b6](https://github.com/GuoSirius/competitor-crawler/commit/de2b0b653dc0cd7bf7e9a8d354d5aad3d034bf1a))
* **sites:** 默克 sigmaaldrich YAML（spa 表格行 + emotion 语义后缀选择器） ([a58a73a](https://github.com/GuoSirius/competitor-crawler/commit/a58a73a9599243598d0cccdc6204851a39e95087))
* **sites:** 四正柏 4abio YAML（ssr 单页列表 + 货号/规格直出） ([e39ef53](https://github.com/GuoSirius/competitor-crawler/commit/e39ef5374255bc055b37df4d5e9a5888d1d4990d))
* **sites:** 下钻接通 procellsystem/fn-test 两站（stubs 4 站收尾两站） ([af60cc7](https://github.com/GuoSirius/competitor-crawler/commit/af60cc793ae800f308e6dc8febf0203763e62d15))
* **sites:** bio x cell YAML（algolia 渲染列表 + magento 详情） ([479cc49](https://github.com/GuoSirius/competitor-crawler/commit/479cc4914c48312b3688a4751f024946e37f4943))
* **sites:** bioassay systems YAML（woocommerce 列表 + 美元价格） ([e36987c](https://github.com/GuoSirius/competitor-crawler/commit/e36987c3537491bac24ca82ed934de6e161b0953))
* **sweep:** --all 全量模式 + 产品锚点启发式 + 智能跳过 + 四类站点汇总 ([a548f89](https://github.com/GuoSirius/competitor-crawler/commit/a548f893a08c670da42da365311b89a543b717eb))
* **sweep:** --only 过滤重跑失败组 + ignoreHTTPSErrors 修证书误判 ([c512c2d](https://github.com/GuoSirius/competitor-crawler/commit/c512c2da84afd0542405b81c6cd1aa8698c93f02))
* **sweep:** 批量反爬复探命令——可达性/挑战页/内容量三件事 ([1145c62](https://github.com/GuoSirius/competitor-crawler/commit/1145c62805c7ac0b451a0c5c38db2f7d699e9bfa))


### 📚 文档 (Documentation)

* **14:** 按实测校订台账——A 类 24→29、B 类重排、翻页收敛两大两类 ([abd2544](https://github.com/GuoSirius/competitor-crawler/commit/abd25447bdda16477b7fc906aa67e3abcd1fe291))
* **14:** 检测 SOP + 20 站复探结果（51/59 可达） ([60d278d](https://github.com/GuoSirius/competitor-crawler/commit/60d278dd55c98fb50709044cfc62949eb28f346a))
* **14:** 全量 59 站 sweep 四类清单 + 正反馈闭环记录 ([cd792ed](https://github.com/GuoSirius/competitor-crawler/commit/cd792ed95a93547698f05910facc50b43e8773e5))
* **14:** 台账整体重写（总览/a类23站/b类12卡点/c类8站/检测sop） ([3734a6d](https://github.com/GuoSirius/competitor-crawler/commit/3734a6daacf8852941235d33d0477a6335f26d4b))
* **14:** b/c类表格补回官网链接可点击核查，bio x cell 升入a类 ([2c3cbe6](https://github.com/GuoSirius/competitor-crawler/commit/2c3cbe6179f9cf75867e06c0ba964e21ca769a10))
* **14:** b类复核结果与剩余站点卡点清单 ([5195f93](https://github.com/GuoSirius/competitor-crawler/commit/5195f935880d08b167cd4d1b176c2d0e62d5ba96))
* **14:** bio x cell 点击累积模式口径 ([6b494bd](https://github.com/GuoSirius/competitor-crawler/commit/6b494bddae3f45cc6f30f0aadac4fef8dedbf02d))
* **14:** sweep 复探后重排反爬拦截分类——14 站升出并标注防护类型 ([6073d11](https://github.com/GuoSirius/competitor-crawler/commit/6073d119b87481763f62828ebd8b2a5cbebc54b6))


### 🐛 缺陷修复 (Bug Fixes)

* **antibot:** 过盾倒计时复述 + headless 未过盾原因提示（sweep 批量静默被误认卡死） ([09e533f](https://github.com/GuoSirius/competitor-crawler/commit/09e533f192eca00fe44a91721865e3547062a31c))
* **antibot:** 宽泛文案须 DOM 裁决（BD/赛业/ScienCell 大页面误判回归） ([955b12f](https://github.com/GuoSirius/competitor-crawler/commit/955b12fedd6b78df35f6a09c6eca67ee78e87247))
* **antibot:** 挑战等待收敛到非交互盾 + goto 超时可调 + sweep 伪放行标记 ([0d2d868](https://github.com/GuoSirius/competitor-crawler/commit/0d2d868a911bc5d63e75d07bfd85594368025c37))
* **antibot:** 挑战页等待自动放行（CF 5s 盾）+ SPA 观察窗放宽可配 ([60513dd](https://github.com/GuoSirius/competitor-crawler/commit/60513dda641e4702f5059517fa33e02a02522a4d))
* **antibot:** captcha 误报修正（正则只认真验证控件 + DOM 侧二次校验） ([4627037](https://github.com/GuoSirius/competitor-crawler/commit/462703782f4d1743c98e411ecae191b2e8158871))
* **env:** 契约测试修 MIME 通配符误吞块注释 + env 点号访问规整 ([0410c83](https://github.com/GuoSirius/competitor-crawler/commit/0410c83583ed307e936a951e359f43cdd73fdc1c))
* **fetch:** 补 waitSelector 的重挂载复查，修 Algolia 两阶段渲染偶发丢列表 ([a215ba5](https://github.com/GuoSirius/competitor-crawler/commit/a215ba53b5cce15680f1c3e9cc6b6cc5d2f8a3af))
* **scripts:** 根脚本改 exec 直调（filter+script+args 在 pnpm12 下 3s 即 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL） ([a46381d](https://github.com/GuoSirius/competitor-crawler/commit/a46381d62c257990d0629985e87c0b5db419149a))
* **sweep:** 报告输出改到 .tmp/sweep（临时产物不进仓库） ([8110f6b](https://github.com/GuoSirius/competitor-crawler/commit/8110f6be5ceeb97c9a8d32bfe43979bd578ff978))
* **sweep:** 浏览器窗口被关闭单独归类 + 排障提示（有头模式别中途关窗） ([b3cedc3](https://github.com/GuoSirius/competitor-crawler/commit/b3cedc3fcd63cf24af9ecfb3b57d62ab2f1a0dfc))
* **sweep:** 移除重复的旧正则分类（fetchPage 已内置分层检测，重复分类误标正常页） ([6644ca3](https://github.com/GuoSirius/competitor-crawler/commit/6644ca3a762fd07a723b949d4af9581842f99cd8))


### 🏠 其他 (Miscellaneous)

* 清理 src 下的遗留临时探针，忽略本机 workbuddy 记忆目录 ([b95f699](https://github.com/GuoSirius/competitor-crawler/commit/b95f699c2a300e4c3c02c14aef07cd7724bcde0b))
* **sites:** 已配 yaml 显式声明 render 模式 ([a7d5ec0](https://github.com/GuoSirius/competitor-crawler/commit/a7d5ec04b1413521d79ff197f190c1df607773b4))

## [1.5.0](https://github.com/GuoSirius/competitor-crawler/compare/v1.4.0...v1.5.0) (2026-10-01)


### 📚 文档 (Documentation)

* 命令手册补 validate/field-docs;问题清单挂入口与match机制速查图 ([be30939](https://github.com/GuoSirius/competitor-crawler/commit/be30939cc83e500d8f609cd32aa98c4f837b3ed7))
* 修正 urlTemplate base 注释——当前入口逐个翻页而非首个 startUrl ([ccd3249](https://github.com/GuoSirius/competitor-crawler/commit/ccd324946a3172a8c983f1489400cc408ae94153))


### 🏠 其他 (Miscellaneous)

* **sites:** material 移除多余 maxPages——纯列表无翻页控件自然终止，注释修正机制描述 ([06e9fde](https://github.com/GuoSirius/competitor-crawler/commit/06e9fde9a376d0ed01f56d79b03e2b04bb858ff5))
* **sites:** procell 多规则化并接入技术资源四栏目(alerts/school/guide/video) ([7a4c6c1](https://github.com/GuoSirius/competitor-crawler/commit/7a4c6c19c0fa2bd01bed5e37830e32fb08c76dd1))
* **sites:** procell 接入 material 宣传资料栏目（listOnly+spa）；资源四栏目 strip 保留技术资源前缀 ([5a1b734](https://github.com/GuoSirius/competitor-crawler/commit/5a1b734e0ee1ae3506608bc9b8bc82ad5eb01541))
* **sites:** procell 内容四栏目开启 bodyHtml 富文本抽取（material 仅列表不加） ([2ddba67](https://github.com/GuoSirius/competitor-crawler/commit/2ddba67506c872002584ff141e600bac689253b3))
* **sites:** procell material 显式关闭翻页（一次全量返回，不继承站点级 ?page={page}） ([9b9453f](https://github.com/GuoSirius/competitor-crawler/commit/9b9453f4424cdc70a664587fd7b7eb8f0aacd1c4))


### 🐛 缺陷修复 (Bug Fixes)

* contents 栏目配 name 等价 title（管线标题链），validate 不再误报缺必填 ([aecaa71](https://github.com/GuoSirius/competitor-crawler/commit/aecaa7179ca4981fc814f38692a2d200932e2876))
* **contents:** 列表阶段字段兜底——详情没抽到就回退 parseList（sourceId/summary/body/author/date）+ 行 JSON 补列表独有字段 ([d009ac6](https://github.com/GuoSirius/competitor-crawler/commit/d009ac69f7c30c16d25e0ae1ba082668123a93ce))
* **contents:** 内容条目挂真实面包屑分类（不再只有 <domain>::<key> 锚点） ([4b8e3a5](https://github.com/GuoSirius/competitor-crawler/commit/4b8e3a512b1f16d03c8da4f491118f06e65090ea))


### 🚀 新功能 (Features)

* 字段注册表+配置校验(Q1)与两阶段合并注册表驱动+不一致审计(Q2) ([89d2c09](https://github.com/GuoSirius/competitor-crawler/commit/89d2c095ca3714fda4cfdc0b544ac1a7e0ce42a1))
* **cli:** 参数统一——站点标识 --domain（site 别名）、--max-pages 消 pages/page-start 歧义、help 分组输出 ([87a999e](https://github.com/GuoSirius/competitor-crawler/commit/87a999e8ea28a6be79db1a9dfaba7293ec455074))
* contents 富文本留存——FieldSpec 加 html 选项 + body_html 列（默认不抽，YAML html:true 才存） ([64c46b5](https://github.com/GuoSirius/competitor-crawler/commit/64c46b5297fd7591d32900cc0dc2b6dddfa3a2db))
* **contents:** 内容栏目落分类节点——categories 建树 + contents.category_id 回写 ([7c2ecfd](https://github.com/GuoSirius/competitor-crawler/commit/7c2ecfd7727cebc8b94d42dde6c5c7a40f3b42ba))
* **crawl:** 两阶段字段不一致告警带明细（身份键 + 详情/列表取值） ([d3ff848](https://github.com/GuoSirius/competitor-crawler/commit/d3ff8481b139cfeecfa6012fe9db91c0f6dccda4))
* **field-docs:** 打印字段名→落库列对照（新增 dbColumnOf + --domain 站点视图） ([1422803](https://github.com/GuoSirius/competitor-crawler/commit/14228030da477ecabc8eebe522fe470e8917c0cb))
* hash 翻页模板显式报错与校验；match 速查图改为零调用定位叙事 ([084f86b](https://github.com/GuoSirius/competitor-crawler/commit/084f86bc8b9af834541ffbed152d033bfc8f144d))
* listOnly 仅列表模式（contents 跳过详情直接入库）+ title 链加 it.raw?.title 兜底 ([624b366](https://github.com/GuoSirius/competitor-crawler/commit/624b36670c78b1863201f871fd319bd3dd9b6967))
* listTraversal 支持 strategy none——不翻页的栏目可局部关停（顶层 pagination-url 照留） ([43e684f](https://github.com/GuoSirius/competitor-crawler/commit/43e684f71d4936bc65e9b9699fcca7894f75a13d))

## [1.4.0](https://github.com/GuoSirius/competitor-crawler/compare/v1.3.0...v1.4.0) (2026-09-30)


### ⚡ 性能优化 (Performance)

* **crawler:** 列表进度显示用时速率并避免被详情覆盖 ([2045790](https://github.com/GuoSirius/competitor-crawler/commit/2045790d1df2bcbe678643f2c9da1884e6db6248))


### 🏠 其他 (Miscellaneous)

* **sites:** 同步普诺赛中文站手调 YAML 备份（新增字段与选择器定稿） ([0ff4173](https://github.com/GuoSirius/competitor-crawler/commit/0ff4173686cae7d7b0b8b0d973d8cf2632100be5))
* **sites:** procell 改 pagination-url 并修正选择器与面包屑 ([5dfc020](https://github.com/GuoSirius/competitor-crawler/commit/5dfc020c74308eff457b45f82125cb1e03142f1c))


### 🐛 缺陷修复 (Bug Fixes)

* **crawl:** 普通轮误跳过已落库详情——仅 --resume 才启用 skipKeys，跳过数可见化 ([e5e4942](https://github.com/GuoSirius/competitor-crawler/commit/e5e49427b412d4099e4480a7b3062ac1a5885bad))
* **crawler:** genSite 喂模型 HTML 清洗选窗（根因）+ dry-run 汇总可见化 ([42148c3](https://github.com/GuoSirius/competitor-crawler/commit/42148c3c096b50334739296476be5672f34052b7))
* gen-site 推广化——元信息保护 + 产出回验闭环 ([50983bc](https://github.com/GuoSirius/competitor-crawler/commit/50983bc077fdabe2e5952343a1105bbb3a5e83ad))
* **progress:** 列表进度状态行独立到顶部，避免被详情覆盖闪烁 ([9ff7cce](https://github.com/GuoSirius/competitor-crawler/commit/9ff7cce1fb2b7cc7c6033f9954c3e9ce2448d4af))


### 🚀 新功能 (Features)

* crawl 进度显示重构——详情逐条计数/落库节流/列表页码累计 ([c9e0b51](https://github.com/GuoSirius/competitor-crawler/commit/c9e0b517cf38fe7f8231f635c779df3f9b710a85))
* **crawl:** 断点续跑——中断存进度可 --resume 恢复，已完成栏目与已落库详情不重跑 ([a38db39](https://github.com/GuoSirius/competitor-crawler/commit/a38db397b5f458c27f0eba120a79cc62dc137672))
* **crawl:** 列表页抓取失败重试并续翻，缺失页记录告警 ([69e3790](https://github.com/GuoSirius/competitor-crawler/commit/69e37906c9b10fdaaf640f42a2f2ecc3c5a2e236))
* **crawl:** 流式落库——详情每满一批就地刷库，边抓边写、内存有界 ([059a5f3](https://github.com/GuoSirius/competitor-crawler/commit/059a5f353570b7c4f86c91f0ba0d10b7e10b577b))
* **crawl:** 三段进度展示——落库数并入详情行实时后缀，收尾定格落库行 ([6f8436c](https://github.com/GuoSirius/competitor-crawler/commit/6f8436c7e058875a84b6326a47cf4afc7caeb9b6))
* **crawl:** 增量批量落库，价格历史多行写入，生产库整批事务 ([1d9dd02](https://github.com/GuoSirius/competitor-crawler/commit/1d9dd027701c20ecb095f8c644dbc269f696d101))
* **crawler:** 普诺赛中文站 YAML 落地 + products 新增别称/曾用货号列 ([2f14c08](https://github.com/GuoSirius/competitor-crawler/commit/2f14c08d12e73fbd167e0e46f39c6abde2bd582e))
* **db:** categories 增加 id_path 物化路径列——改名不动、子树按 id 前缀查询 ([a02ae23](https://github.com/GuoSirius/competitor-crawler/commit/a02ae23d9c05b44b4a8181daf2e73d79a07cedb7))
* listTraversal 分页/条目分层控制 ([d319c81](https://github.com/GuoSirius/competitor-crawler/commit/d319c8115f449ed00f1d314a335da316b667dc87))

## [1.3.0](https://github.com/GuoSirius/competitor-crawler/compare/v1.2.0...v1.3.0) (2026-09-30)


### 🏠 其他 (Miscellaneous)

* **release:** 门禁自动补记 changelog 未发布段 ([d07c79c](https://github.com/GuoSirius/competitor-crawler/commit/d07c79cc81927f1f8bf98c1760bb41a5d300208f))
* **sites:** 新增伊莱瑞特/普诺赛四站 yaml 试用桩 ([d9b0fe2](https://github.com/GuoSirius/competitor-crawler/commit/d9b0fe264e26c1f21165c6b59ffa2ac95fff57b3))


### 🐛 缺陷修复 (Bug Fixes)

* **crawler:** probe 配置不完整时友好告警；修复 gen-site 桩填充与批量路径 ([29b1edf](https://github.com/GuoSirius/competitor-crawler/commit/29b1edf4644a4d353e2438e5aeb34fe7fb3658a0))


### 🚀 新功能 (Features)

* **crawler:** 支持按 section / 列表页 / 详情页 分别指定渲染模式 ([98fd767](https://github.com/GuoSirius/competitor-crawler/commit/98fd76779a38875fa234aca6d712b488a193f396))
* **crawler:** render 渲染模式写入 YAML 并逐站解析 ([40f9b73](https://github.com/GuoSirius/competitor-crawler/commit/40f9b73c41d5ccdb264bff3ba2f4b0201da1ca37))
* **gen-site:** 批量模板与生成链路补齐公司属性与动态分类产出 ([1e461f2](https://github.com/GuoSirius/competitor-crawler/commit/1e461f2aa0533e24480d0fdd8cc23180d2621b45))
* **gen-site:** 生成时安全合并已存在配置并补currency参数 ([7cc011e](https://github.com/GuoSirius/competitor-crawler/commit/7cc011ee6ba03a2e4477571e5a4c747133cd072b))
* **gen-site:** 生成prompt支持categoryFromPage/pagination-url并重刷批量模板 ([0da21e5](https://github.com/GuoSirius/competitor-crawler/commit/0da21e5a4befd2e39bb6c552412053f559301f0a))


### 📚 文档 (Documentation)

* 补 Hybrid 渲染（renderList/renderDetail）与修正 gen-site 过期事实 ([3f53a14](https://github.com/GuoSirius/competitor-crawler/commit/3f53a14d178fdfcbb32bda2f1aa82547a7979f15))

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

## [1.1.0](https://github.com/GuoSirius/competitor-crawler/compare/v1.0.0...v1.1.0) (2026-09-29)

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
