#!/usr/bin/env node
// 单一发布入口：运行时选择 patch / minor / major（或作为第一个参数传入，便于 CI / 一键）。
// 底层走 standard-version（已配 monorepo 同步 bump 根与子包 + tagPrefix=v），见根 package.json 的 standard-version 字段。
import { createInterface } from 'node:readline';
import { spawnSync } from 'node:child_process';

const VALID = ['patch', 'minor', 'major'];

async function main() {
  const arg = process.argv[2];
  let type = VALID.includes(arg) ? arg : null;

  if (!type) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise((resolve) =>
      rl.question('发布类型（1=patch, 2=minor, 3=major，或直接输入 patch/minor/major）：', (a) => resolve(a.trim())),
    );
    rl.close();
    const map = { '1': 'patch', '2': 'minor', '3': 'major' };
    type = map[answer] || (VALID.includes(answer) ? answer : null);
  }

  if (!type) {
    console.error('未选择有效的发布类型，已取消。');
    process.exit(1);
  }

  console.log(`\n→ standard-version --release-as ${type}\n`);
  const res = spawnSync('pnpm', ['exec', 'standard-version', '--release-as', type], {
    stdio: 'inherit',
    env: process.env,
  });
  process.exit(res.status ?? 1);
}

main();
