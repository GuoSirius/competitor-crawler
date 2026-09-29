#!/usr/bin/env node
// 全量重建 CHANGELOG.md（changelogen 风格，对齐 zhiliaowo-proxy）：
//   ## vX.Y.Z + [compare changes](…) + emoji 双语分组（🚀 新功能 / 🐛 缺陷修复 / ♻️ 代码重构 …）
//
// 背景：standard-version 默认只把 feat/fix 写进 CHANGELOG，其余类型被丢弃；
// .versionrc.json 已配置全量 types（以后每次发布都全量记录），本脚本把历史一次性重刷。
// 区块标题与 .versionrc.json types[].section 严格一致；建议每次 release 后重跑一次以统一格式。
//
// 用法：node scripts/changelog-rebuild.mjs [--dry-run]
//
// 说明：
//   · 零第三方依赖：git log 拉提交 + 正则解析 conventional commit（type(scope)?: subject）。
//   · chore(release): x.y.z 发布提交本身不入账（与 standard-version 行为一致）。
//   · 无 type 前缀的提交归入「其他」（commitlint 门禁下不应出现）。

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(repoRoot);
const REPO_URL = 'https://github.com/GuoSirius/competitor-crawler';
const OUT = path.join(repoRoot, 'CHANGELOG.md');
const dryRun = process.argv.includes('--dry-run');

// 展示顺序与分组标题：与 .versionrc.json types 保持一致（勿只改一处）
const TYPES = [
  { type: 'feat', section: '🚀 新功能 (Features)' },
  { type: 'fix', section: '🐛 缺陷修复 (Bug Fixes)' },
  { type: 'perf', section: '⚡ 性能优化 (Performance)' },
  { type: 'revert', section: '◀️ 回退 (Reverts)' },
  { type: 'docs', section: '📚 文档 (Documentation)' },
  { type: 'refactor', section: '♻️ 代码重构 (Refactors)' },
  { type: 'test', section: '✅ 测试 (Tests)' },
  { type: 'build', section: '🔧 构建 (Build)' },
  { type: 'ci', section: '🔄 持续集成 (CI)' },
  { type: 'style', section: '🎨 样式 (Styles)' },
  { type: 'chore', section: '🏠 其他 (Miscellaneous)' },
];
const SECTION_OF = new Map(TYPES.map((t) => [t.type, t.section]));

function git(args) {
  // stdin 必须 ignore：本机管道 stdin 会 EBUSY（Windows 三铁律之一）
  const r = spawnSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  if (r.error || r.status !== 0) {
    throw new Error(`git ${args.join(' ')} 失败：${r.error?.message ?? r.stderr}`);
  }
  return (r.stdout ?? '').trim();
}

/** 解析 conventional commit 首行：type(scope)?: subject；解析失败返回 null */
function parseSubject(subject) {
  const m = /^(\w+)(?:\(([^)]*)\))?(!)?:\s*(.+)$/.exec(subject.trim());
  if (!m) return null;
  const [, type, scope, , text] = m;
  return { type: type.toLowerCase(), scope: scope || null, text: text.trim() };
}

/** 一个提交：{ hash, short, subject } */
function logRange(from, to) {
  const range = from ? `${from}..${to}` : to;
  const raw = git(['log', range, '--no-merges', '--format=%H%x09%h%x09%s']);
  if (!raw) return [];
  return raw.split('\n').filter(Boolean).map((line) => {
    const [hash, short, subject] = line.split('\t');
    return { hash, short: short.slice(0, 7), subject };
  });
}

/** 渲染一组提交为 changelogen 分组列表；返回空数组表示无提交 */
function renderGroups(commits) {
  const groups = new Map(TYPES.map((t) => [t.section, []]));
  for (const c of commits) {
    if (/^chore(\(release\))?:\s*v?\d/i.test(c.subject)) continue; // 发布提交本身不入账
    const parsed = parseSubject(c.subject) ?? { type: 'chore', scope: null, text: c.subject };
    const scope = parsed.scope ? `**${parsed.scope}:** ` : '';
    groups.get(SECTION_OF.get(parsed.type) ?? '🏠 其他 (Miscellaneous)')
      .push(`- ${scope}${parsed.text} ([${c.short}](${REPO_URL}/commit/${c.short}))`);
  }
  const out = [];
  for (const { section } of TYPES) {
    const items = groups.get(section);
    if (items.length === 0) continue;
    out.push(`### ${section}`, '', ...items, '');
  }
  return out;
}

function main() {
  // 1) 版本区间：tag 旧→新；首版无上界（全历史）
  const tags = git(['tag', '--sort=creatordate']).split('\n').filter((t) => /^v\d/.test(t));
  const releases = tags.map((tag, i) => ({
    tag,
    version: tag.replace(/^v/, ''),
    from: i > 0 ? tags[i - 1] : null,
    first: i === 0,
  }));

  const out = ['# Changelog', ''];
  let total = 0;
  for (const r of releases.slice().reverse()) { // 最新版本在上（与 changelogen 一致）
    out.push(`## v${r.version}`, '');
    if (!r.first) out.push(`[compare changes](${REPO_URL}/compare/${r.from}...${r.tag})`, '');
    const commits = logRange(r.from, r.tag);
    const groups = renderGroups(commits);
    total += commits.length;
    if (groups.length === 0) out.push('_（无记录）_', '');
    else out.push(...groups);
  }

  // 2) 未发布提交（最后一个 tag 之后）——有才输出
  if (tags.length > 0) {
    const last = tags[tags.length - 1];
    const pending = logRange(last, 'HEAD');
    const groups = renderGroups(pending);
    if (groups.length > 0) {
      out.push(`## Unreleased`, '', `[compare changes](${REPO_URL}/compare/${last}...HEAD)`, '', ...groups);
    }
    total += pending.length;
  }

  const content = out.join('\n').replace(/\n{3,}/g, '\n\n') + '\n';
  if (dryRun) {
    console.log(content);
    console.error(`--dry-run：共 ${total} 条提交，未写入 ${path.relative(repoRoot, OUT)}`);
    return;
  }
  fs.writeFileSync(OUT, content, 'utf8');
  console.log(`✓ CHANGELOG.md 已重建：${total} 条提交、${releases.length} 个版本`);
}

main();
