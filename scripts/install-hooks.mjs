#!/usr/bin/env node
// 安装「回退版」git 钩子到 .git/cph/（幂等，可重复执行）。
//
// 为什么需要它：
//   本项目首选 husky（`.husky/` 版本化）管理钩子。但本机钩子进程的 PATH
//   取自系统环境变量（不含 Git\usr\bin），husky 生成的包装脚本曾报
//   `/usr/bin/env: 'sh': No such file or directory`。故保留一条**已验证可用**的回退路径：
//
//     git -c core.hooksPath=.git/cph commit -m "feat: ..."
//
//   钩子内容与 husky 完全一致 —— 都只调用同一份 node 脚本（scripts/precommit.mjs
//   / scripts/commitmsg.mjs），因此两条路径的**门禁强度完全相同**，不会出现
//   「换个 hooksPath 就绕过校验」。
//
// 用法：
//   pnpm hooks:install
//   git -c core.hooksPath=.git/cph commit -m "feat: ..."

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hooksDir = path.join(repoRoot, '.git', 'cph');

// 与 .husky/ 下同名文件保持**逐字一致**（薄钩子，逻辑都在 node 脚本里）
const HOOKS = {
  'pre-commit': 'node scripts/precommit.mjs\n',
  'commit-msg': 'node scripts/commitmsg.mjs "$1"\n',
};

function install() {
  if (!fs.existsSync(path.join(repoRoot, '.git'))) {
    console.error('[hooks] 未找到 .git 目录，跳过（不在 git 仓库内？）');
    process.exit(0);
  }
  fs.mkdirSync(hooksDir, { recursive: true });

  for (const [name, content] of Object.entries(HOOKS)) {
    const p = path.join(hooksDir, name);
    fs.writeFileSync(p, content, 'utf-8');
    try {
      fs.chmodSync(p, 0o755); // Unix 必需；Windows 无实际意义，忽略失败
    } catch {
      /* ignore */
    }
    console.log(`[hooks] 已写入 ${path.relative(repoRoot, p)}`);
  }

  console.log(`
[hooks] 完成。本机两种提交方式（门禁一致，见 scripts/precommit.mjs）：

  ① husky（首选，pnpm install 时由 prepare 自动启用）
       git commit -m "feat: ..."

  ② 回退（husky 包装脚本在本机 PATH 下不可用时）
       git -c core.hooksPath=.git/cph commit -m "feat: ..."

门禁内容：pnpm typecheck（shared + crawler）+ 单元测试，任一失败即阻止提交。
逃生门：--no-verify（不推荐，请勿常用）。
`);
}

install();
