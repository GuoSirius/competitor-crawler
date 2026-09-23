#!/usr/bin/env node
// 单一发布入口（零第三方依赖）。
//
// 流程：
//   [1/4] 门禁：typecheck（shared + crawler）
//   [2/4] 门禁：单元测试（vitest run）
//   [3/4] 未提交改动检查 —— 有则提示输入提交信息并提交（走提交门禁）；无则跳过
//   [4/4] 方向键（↑/↓ + Enter）选择发布类型 → standard-version 发布 → 推送提交与 tag 收尾
//
// 用法：
//   pnpm release                      # 全交互
//   pnpm release patch|minor|major    # 跳过选择（CI / 一键）
//   pnpm release --dry-run            # 只打印将要发生的改动，不写文件、不提交、不推送
//
// 说明：
//   · 命令一律用 `node` 直调本地二进制（不依赖 PATH 里是否有 pnpm / shell），与 scripts/precommit.mjs 同源思路。
//   · 交互选择用 node:readline 原始模式实现，无第三方依赖（inquirer / @clack 均不需要）。
//   · 发布提交（standard-version 内部会 git commit）会再跑一遍提交门禁；与前置门禁内容一致，属冗余但无害。
//   · tag 前缀 / monorepo 同步 bump 规则见 .versionrc.json。

import { createInterface, emitKeypressEvents, moveCursor, clearLine, cursorTo } from 'node:readline';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(repoRoot);

// 本地二进制（相对 repoRoot）——不依赖 PATH
const TSC = 'node_modules/typescript/bin/tsc';
const VITEST = 'node_modules/vitest/vitest.mjs';
const STANDARD_VERSION = 'node_modules/standard-version/bin/cli.js';

const VALID = ['patch', 'minor', 'major'];
const TOTAL_STEPS = 4;

// ---- 终端着色（不支持 VT / NO_COLOR 时自动降级为纯文本） ----
const useColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const paint = (code, s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
const bold = (s) => paint('1', s);
const dim = (s) => paint('2', s);
const cyan = (s) => paint('36', s);
const green = (s) => paint('32', s);
const yellow = (s) => paint('33', s);
const red = (s) => paint('31', s);

function header(title) {
  console.log(`\n${cyan('▶')} ${bold(title)}`);
}
function ok(msg) {
  console.log(`${green('✓')} ${msg}`);
}
function warn(msg) {
  console.log(`${yellow('!')} ${msg}`);
}
function die(msg) {
  console.error(`\n${red('✗')} ${msg}`);
  process.exit(1);
}

/** 用 node 直调本地二进制（不依赖 PATH 里是否有 pnpm）——与 scripts/precommit.mjs 同源 */
function runNode(args, label) {
  if (label) console.log(dim(`  · ${label}`));
  const r = spawnSync(process.execPath, args, { stdio: 'inherit', cwd: repoRoot, env: process.env });
  if (r.error) die(`执行失败（${label ?? args[0]}）：${r.error.message}`);
  return r.status === 0;
}

/**
 * 调 git：不经 shell，避免提交信息里的 & | " 等被解释。
 * stdin 一律置 ignore —— git 这些子命令不需要输入，避免在受限环境下挂起 / 报 EBUSY。
 */
function git(args, opts = {}) {
  return spawnSync('git', args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    cwd: repoRoot,
    env: process.env,
    ...opts,
  });
}
function gitOrDie(args) {
  const r = git(args);
  if (r.error) die(`git ${args.join(' ')} 执行失败：${r.error.message}`);
  return r;
}

function readVersion() {
  try {
    return JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')).version;
  } catch {
    return '(未知)';
  }
}

/** 文本输入（非 TTY 时返回空串 → 由调用方按取消处理） */
function askText(question) {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) {
      resolve('');
      return;
    }
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/** 方向键选择发布类型：↑/↓ 切换，Enter 确认，Esc / Ctrl-C 取消。返回 'patch'|'minor'|'major'|null */
function selectReleaseType(beforeVersion) {
  return new Promise((resolve) => {
    const options = [
      { value: 'patch', label: 'patch', desc: '修复 / 小改动（向后兼容）' },
      { value: 'minor', label: 'minor', desc: '新增功能（向后兼容）' },
      { value: 'major', label: 'major', desc: '破坏性变更' },
    ];
    if (!process.stdin.isTTY) {
      resolve(null);
      return;
    }

    const stdin = process.stdin;
    const stdout = process.stdout;
    let idx = 0;

    emitKeypressEvents(stdin);
    const wasRaw = stdin.isRaw;
    stdin.setRawMode(true);
    stdin.resume();

    const renderLine = (i) => {
      const selected = i === idx;
      const mark = selected ? cyan('❯') : ' ';
      const label = (selected ? bold : dim)(options[i].label.padEnd(6));
      const desc = selected ? options[i].desc : dim(options[i].desc);
      return `${mark} ${label} ${desc}`;
    };
    const draw = (first) => {
      if (!first) moveCursor(stdout, 0, -options.length);
      for (let i = 0; i < options.length; i++) {
        clearLine(stdout, 0);
        cursorTo(stdout, 0);
        stdout.write(`${renderLine(i)}\n`);
      }
    };

    console.log(`${bold('选择发布类型')} ${dim(`（当前 v${beforeVersion}；↑/↓ 切换，Enter 确认，Esc 取消）`)}`);
    draw(true);

    const finish = (value) => {
      stdin.removeListener('keypress', onKey);
      if (stdin.isTTY) stdin.setRawMode(wasRaw);
      stdin.pause();
      resolve(value);
    };
    const onKey = (_str, key) => {
      if (!key) return;
      if (key.name === 'up') {
        idx = (idx - 1 + options.length) % options.length;
        draw(false);
      } else if (key.name === 'down') {
        idx = (idx + 1) % options.length;
        draw(false);
      } else if (key.name === 'return' || key.name === 'enter') {
        stdout.write('\n');
        finish(options[idx].value);
      } else if (key.name === 'escape' || (key.ctrl && key.name === 'c')) {
        stdout.write('\n');
        finish(null);
      }
    };
    stdin.on('keypress', onKey);
  });
}

async function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run');
  const argType = argv.find((a) => VALID.includes(a)) ?? null;
  const unknown = argv.filter((a) => a !== '--dry-run' && !VALID.includes(a));
  if (unknown.length) die(`未知参数：${unknown.join(' ')}（可用：patch | minor | major | --dry-run）`);

  const before = readVersion();
  console.log(`${bold('competitor-crawler 发布')}  ${dim(`当前版本 v${before}${dryRun ? '（dry-run）' : ''}`)}`);

  // [1/4] 类型检查
  header(`[1/${TOTAL_STEPS}] 门禁：类型检查（typecheck）`);
  for (const pkg of ['shared', 'crawler']) {
    if (!runNode([TSC, '-p', `packages/${pkg}/tsconfig.json`, '--noEmit'], `tsc -p packages/${pkg}`)) {
      die('类型检查未通过，发布终止。');
    }
  }
  ok('类型检查通过');

  // [2/4] 单元测试
  header(`[2/${TOTAL_STEPS}] 门禁：单元测试（vitest run）`);
  if (!runNode([VITEST, 'run'], 'vitest run')) die('单元测试未通过，发布终止。');
  ok('单元测试通过');

  // [3/4] 未提交改动
  header(`[3/${TOTAL_STEPS}] 检查未提交改动`);
  const porcelain = (gitOrDie(['status', '--porcelain']).stdout ?? '').trim();
  if (porcelain) {
    console.log(dim('  检测到以下未提交改动：'));
    for (const line of porcelain.split('\n')) console.log(dim(`    ${line}`));
    const message = await askText('\n请输入提交信息（直接回车 = 取消发布）：');
    if (!message) die('未输入提交信息，已取消发布。');
    if (git(['add', '-A'], { stdio: 'inherit' }).status !== 0) die('git add 失败，发布终止。');
    if (git(['commit', '-m', message], { stdio: 'inherit' }).status !== 0) {
      die('提交失败（可能未通过提交门禁），发布终止。');
    }
    ok('已提交未提交改动');
  } else {
    ok('工作区干净，无需提交');
  }

  // [4/4] 选择类型 → 发布 → 收尾
  header(`[4/${TOTAL_STEPS}] 选择发布类型并执行发布`);
  let type = argType;
  if (!type) {
    if (!process.stdin.isTTY) die('非交互环境，请显式指定发布类型：pnpm release patch|minor|major');
    type = await selectReleaseType(before);
    if (!type) die('已取消发布。');
  }

  console.log(dim(`  → standard-version --release-as ${type}${dryRun ? ' --dry-run' : ''}`));
  const svArgs = [STANDARD_VERSION, '--release-as', type];
  if (dryRun) svArgs.push('--dry-run');
  const sv = spawnSync(process.execPath, svArgs, { stdio: 'inherit', cwd: repoRoot, env: process.env });
  if (sv.error) die(`standard-version 执行失败：${sv.error.message}`);
  if (sv.status !== 0) die('发布失败（standard-version 未成功）。');

  if (dryRun) {
    warn('dry-run 结束：未写入文件、未提交、未打 tag。');
    return;
  }

  const after = readVersion();
  ok(`版本已更新：v${before} → v${after}`);

  // 收尾：推送提交与标签（--follow-tags 会带上 standard-version 创建的附注 tag）
  console.log(`\n${cyan('▶')} 收尾：推送提交与标签`);
  let pushed = false;
  for (const args of [['push', '--follow-tags'], ['push', 'origin', 'HEAD', '--follow-tags']]) {
    if (spawnSync('git', args, { stdio: 'inherit', cwd: repoRoot, env: process.env }).status === 0) {
      pushed = true;
      break;
    }
  }
  if (pushed) ok(`已推送提交与 tag v${after}`);
  else warn(`推送失败：本地发布已完成（含 tag v${after}），请稍后手动执行 git push --follow-tags`);

  console.log(`\n${green('●')} ${bold(`发布完成：v${after}`)}\n`);
}

main().catch((e) => die(e?.stack ?? String(e)));
