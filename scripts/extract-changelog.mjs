#!/usr/bin/env node
// 从 CHANGELOG.md 抽取指定版本的段落，供 GitHub Release Notes 使用。
//
// 用法：
//   node scripts/extract-changelog.mjs <version>      # version 可带或不带前导 v，如 v1.9.0 / 1.9.0
//
// 输出：把该版本对应的 CHANGELOG 段落（含版本标题行，到下一个 ## 段落或文件末尾为止）
//       打印到 stdout。找不到对应段落时输出一段兜底说明，保证 release 仍能创建成功。
//
// 兼容两种 heading 写法：
//   ## [1.9.0](https://.../compare/v1.8.0...v1.9.0) (2026-10-12)   <- standard-version 生成
//   ## v1.0.0                                                       <- 初始版本手写

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const changelogPath = path.join(repoRoot, 'CHANGELOG.md');

const arg = process.argv[2];
if (!arg) {
  console.error('用法：node scripts/extract-changelog.mjs <version>');
  process.exit(2);
}

// 归一化：去掉前导 v
const version = arg.replace(/^v/i, '').trim();
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`非法版本号：${arg}（需为 X.Y.Z，可带前导 v）`);
  process.exit(2);
}

const text = fs.readFileSync(changelogPath, 'utf8');
const lines = text.split('\n');

// 匹配目标版本 heading（两种写法都接受）
const isTargetHeading = (line) =>
  new RegExp(`^##\\s+\\[?v?${version.replace(/[.+]/g, '\\$&')}\\]?`).test(line);
// 任意版本段落 heading（用于确定结束边界）：## 后跟 [版本] 或 v版本 或纯版本
const isAnyVersionHeading = (line) =>
  /^##\s+(?:\[)?v?\d+\.\d+\.\d+(?:\]\([^)]*\))?(?:\s*\([^)]*\))?\s*$/.test(line);

let start = -1;
for (let i = 0; i < lines.length; i++) {
  if (isTargetHeading(lines[i])) {
    start = i;
    break;
  }
}

if (start === -1) {
  // 兜底：找不到对应段落，仍输出可发布的说明
  console.log(
    `## ${arg}\n\n本版本未在主 CHANGELOG.md 中找到独立段落。` +
      `详情请查看仓库提交历史。`,
  );
  process.exit(0);
}

const out = [];
for (let i = start + 1; i < lines.length; i++) {
  if (isAnyVersionHeading(lines[i])) break;
  out.push(lines[i]);
}

// 去掉末尾空行
while (out.length && out[out.length - 1].trim() === '') out.pop();

// 标题行 + 正文
const heading = lines[start];
console.log(`${heading}\n\n${out.join('\n')}`);
process.exit(0);
