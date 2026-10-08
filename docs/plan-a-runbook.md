# plan:a 过盾命令清单（B 类需人工过盾站）

> 用途：B 类中被 Cloudflare / Imperva 等托管挑战拦截的站，靠 `pnpm plan:a` 弹本机 Chrome 手动过盾，
> 过盾后 cookie 落 `.runtime/state/<host>.json`，之后 `crawl`/`probe` 的 browser 通道自动复用。
> 每个命令跑完**默认自动关闭 Chrome**（要保留加 `--keep-chrome`）。
> 逐条执行：开一个过盾 → 看到「已持久化 cookie」→ 关弹窗 → 跑下一条。

## 待你执行（新，本次排查新增）

```bash
# 1) PromoCell —— CF 托管挑战（ssr 复跑确认 cf-mitigated: challenge，可过盾）
pnpm plan:a www.promocell.com --persist

# 2) 逸漠 XImo —— 你已确认浏览器可打开；过盾/抓会话 cookie 供 browser 通道复用
pnpm plan:a immocell.com --persist

# 3) Leinco —— Imperva WAF（ssr 复跑确认 403 imperva:Incapsula，非 CF，但 plan:a 同机制可试过盾）
pnpm plan:a www.leinco.com --persist
```

## 进行中 / 已跑通（备查，无需重跑除非 cookie 失效）

```bash
# 4) 义翘神州 —— 进行中（你已启动）
pnpm plan:a www.sinobiological.com --persist

# 5) BioLegend —— 已跑通（2026-10-08）
pnpm plan:a www.biolegend.com --persist

# 6) Beckman —— 已跑通（2026-10-08）
pnpm plan:a www.beckman.com --persist
```

## 过盾后下一步（每条过盾成功后）

```bash
# 验证 cookie 已落盘且可达
pnpm diagnose --domain <domain> --mode cdp:http://127.0.0.1:9222

# 生成 YAML 草稿（需浏览器渲染通道，由你本地带 Chromium 验证）
pnpm probe --domain <domain> --sample 3 --detail 2

# 正式抓取（browser 通道自动复用持久化 cookie）
pnpm crawl --domain <domain>
```

## 状态总览（B 类 11 站）

| 站 | 挑战类型 | plan:a 状态 |
|---|---|---|
| 义翘神州 sinobiological.com | CF 托管 | 🟡 进行中 |
| PromoCell promocell.com | CF 托管 | ⚪ 待你执行 |
| 逸漠 immocell.com | 可打开（CF/未知） | ⚪ 待你执行 |
| Leinco leinco.com | Imperva WAF | ⚪ 待你执行 |
| BioLegend biolegend.com | CF 托管 | ✅ 已跑通 |
| Beckman beckman.com | CF 托管 | ✅ 已跑通 |
| ScienCell / 康宁 / 诺唯赞 / BD / 赛默飞 | 无 WAF，但 JS/异步渲染（E 形态） | 🔶 不需过盾，需 `render: browser`+`waitSelector` 本地验证 |
