#!/usr/bin/env node
// 提交信息门禁（commit-msg）：Conventional Commits 校验（commitlint）。
//
// 与 pre-commit 同理：hook 文件只留一行 `node scripts/commitmsg.mjs "$1"`，
// 逻辑放这里，避免依赖钩子 PATH 里的外部命令。
//
// 用法：node scripts/commitmsg.mjs <commit-msg 文件路径>

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const msgFile = process.argv[2];
const CLI = 'node_modules/@commitlint/cli/lib/cli.js';

// commitlint 未安装（pnpm install 之前）→ 跳过，不阻塞
if (!msgFile || !fs.existsSync(path.join(repoRoot, CLI))) {
  process.exit(0);
}

const r = spawnSync(process.execPath, [CLI, '--edit', msgFile], { stdio: 'inherit', cwd: repoRoot });
process.exit(r.status ?? 1);
