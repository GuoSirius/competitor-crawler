#!/usr/bin/env node
// 全仓 typecheck（**单一入口**）：shared → crawler → web。
//
// 为什么是一个 node 脚本而不是各写一遍：
//   1. 本机 `pnpm` 是**无扩展名的 shell 脚本**，Node 无法直接 spawn（EBUSY/EINVAL），
//      故一律用 `process.execPath` 直调各包的本地二进制（与 scripts/precommit.mjs 同源、PATH 无关）；
//   2. 「要检查哪些包」这件事此前散落在根 package.json、precommit.mjs、CI 三处，
//      现在收敛到这里，杜绝「本地绿、CI 红」的漂移；
//   3. web 的 `vue-tsc` 可能**尚未安装**（见 docs/12 §12.9）——缺失时**跳过并提示**，
//      保证门禁不会因为「还没装」而整体变红；装好后自动纳入，无需再改这里。
//
// 被以下三处共用：
//   · 根 package.json 的 typecheck / typecheck:all
//   · scripts/precommit.mjs（本地提交门禁）
//   · .github/workflows/ci.yml（走 `pnpm typecheck`）
//
// 用法：node scripts/typecheck.mjs

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(repoRoot);

// ⚠️ 二进制路径一律**绝对化**：run() 会切换 cwd（web 要在 packages/web 下跑），
// 若传相对路径，Node 会按**当时的 cwd** 再解析一次，拼成 `packages/web/packages/web/...` 而报 MODULE_NOT_FOUND。
const TSC = path.join(repoRoot, 'node_modules/typescript/bin/tsc');
const WEB_DIR = path.join(repoRoot, 'packages/web');
const WEB_VUE_TSC = path.join(WEB_DIR, 'node_modules/vue-tsc');
const WEB_NUXT = path.join(WEB_DIR, 'node_modules/nuxt/bin/nuxt.mjs');

// 依赖未安装（未执行 pnpm install）→ 跳过，不阻塞首次提交（与 precommit 同一策略）
if (!fs.existsSync(TSC)) {
  console.error('typecheck: 依赖未安装（缺 typescript），跳过校验。请先执行 pnpm install');
  process.exit(0);
}

/** 用 node 直调目标脚本；stdout/stderr 透传 */
function run(label, args, cwd = repoRoot) {
  console.log(`typecheck: ${label} …`);
  const r = spawnSync(process.execPath, args, { stdio: 'inherit', cwd });
  return r.status === 0;
}

const packages = [
  ['[shared]', ['-p', path.join(repoRoot, 'packages/shared/tsconfig.json'), '--noEmit']],
  ['[crawler]', ['-p', path.join(repoRoot, 'packages/crawler/tsconfig.json'), '--noEmit']],
];

for (const [label, args] of packages) {
  if (!run(label, [TSC, ...args])) {
    console.error(`typecheck: ✗ ${label} 失败`);
    process.exit(1);
  }
}

// ---- web：需要 vue-tsc；未安装则跳过（docs/12 §12.9）----
if (!fs.existsSync(WEB_VUE_TSC)) {
  console.log('typecheck: [web] 跳过——尚未安装 vue-tsc（执行 pnpm install 即可，见 docs/12 §12.9）；装好后自动纳入');
  console.log('typecheck: ✓ 通过（shared + crawler；web 待装 vue-tsc）');
  process.exit(0);
}

// `nuxt typecheck` 内部会先 writeTypes（生成 .nuxt/ 类型）再跑 `vue-tsc --noEmit`；
// 而 web/tsconfig.json 继承 `./.nuxt/tsconfig.json`，所以必须走这个命令而不是直接调 vue-tsc。
if (!run('[web] typecheck', [WEB_NUXT, 'typecheck'], WEB_DIR)) {
  console.error('typecheck: ✗ [web] 失败');
  process.exit(1);
}

console.log('typecheck: ✓ 全部通过（shared + crawler + web）');
process.exit(0);
