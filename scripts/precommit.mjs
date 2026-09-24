#!/usr/bin/env node
// 提交前门禁（pre-commit）：typecheck（shared + crawler + web）+ 单元测试 **全绿** 才放行。
//
// 为什么是 node 脚本而不是直接写在 hook 文件里：
//   本机钩子进程的 PATH 取自系统环境变量（不含 Git\usr\bin），曾出现
//   `/usr/bin/env: 'sh': No such file or directory`。因此 hook 文件只留一行
//   `node scripts/precommit.mjs`，全部逻辑放这里 → PATH 无关、可单测、单真相源。
//
// 被以下两处共同调用（内容完全一致，改一处两边都生效）：
//   · .husky/pre-commit                      （husky 管理，版本化）
//   · .git/cph/pre-commit                    （husky 不可用时的回退，见 scripts/install-hooks.mjs）
//
// 用法：node scripts/precommit.mjs

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(repoRoot);

const TSC = 'node_modules/typescript/bin/tsc';
const VITEST = 'node_modules/vitest/vitest.mjs';
// typecheck 的「查哪些包」收敛在 scripts/typecheck.mjs（shared + crawler + web），
// 这里只负责调用它，避免三处各写一份导致漂移。
const TYPECHECK = 'scripts/typecheck.mjs';

// 依赖未安装（未执行 pnpm install）→ 跳过，不阻塞首次提交
if (!fs.existsSync(TSC) || !fs.existsSync(VITEST)) {
  console.error('pre-commit: 依赖未安装（缺 typescript/vitest），跳过校验。请先执行 pnpm install');
  process.exit(0);
}

/** 用 node 直调本地二进制（不依赖 PATH 里是否有 pnpm） */
function run(label, args) {
  console.log(`pre-commit: ${label} …`);
  const r = spawnSync(process.execPath, args, { stdio: 'inherit', cwd: repoRoot });
  if (r.status !== 0) {
    console.error(`pre-commit: ✗ ${label} 失败，已阻止提交`);
    return false;
  }
  return true;
}

const checks = [
  ['[1/2] typecheck（shared + crawler + web）', [TYPECHECK]],
  ['[2/2] unit tests', [VITEST, 'run']],
];

for (const [label, args] of checks) {
  if (!run(label, args)) process.exit(1);
}

console.log('pre-commit: ✓ typecheck + 单测全部通过');
process.exit(0);
