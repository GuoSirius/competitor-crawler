import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CrawlState } from './crawlState.js';

// 断点续跑状态单测：走临时目录，不污染仓库 .crawl-state/
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'crawl-state-'));
afterEach(() => {
  for (const f of fs.readdirSync(tmp)) fs.rmSync(path.join(tmp, f), { force: true });
});

describe('CrawlState — 断点续跑状态', () => {
  it('create → markDone → isDone / doneCount / 落盘可 load 回读', () => {
    const s = CrawlState.create({ site: 'x.com' }, tmp);
    expect(fs.existsSync(s.path)).toBe(true);
    expect(s.doneCount).toBe(0);
    expect(s.isDone('x.com', 'default')).toBe(false);

    s.markDone('x.com', 'default', { newCount: 10, updatedCount: 2, failedCount: 1 });
    s.markDone('y.com', 'news', { newCount: 0, updatedCount: 0, failedCount: 0 });
    s.save();

    expect(s.isDone('x.com', 'default')).toBe(true);
    expect(s.isDone('x.com', 'other')).toBe(false);
    expect(s.doneCount).toBe(2);

    const back = CrawlState.load(s.path)!;
    expect(back).not.toBeNull();
    expect(back.doneCount).toBe(2);
    expect(back.isDone('y.com', 'news')).toBe(true);
  });

  it('load：文件不存在 / 内容损坏 → null（调用方给明确报错）', () => {
    expect(CrawlState.load(path.join(tmp, 'nope.json'))).toBeNull();
    const bad = path.join(tmp, 'bad.json');
    fs.writeFileSync(bad, '{ not json', 'utf8');
    expect(CrawlState.load(bad)).toBeNull();
  });

  it('latest：取目录内最新断点；空目录 → null', () => {
    expect(CrawlState.latest(tmp)).toBeNull();
    const a = CrawlState.create({}, tmp);
    const b = CrawlState.create({}, tmp);
    // 文件名含时间戳，字典序 = 时间序；b 更晚创建
    expect(CrawlState.latest(tmp)).toBe(b.path);
    expect(a.path).not.toBe(b.path);
  });

  it('remove：整轮成功后清理断点文件', () => {
    const s = CrawlState.create({}, tmp);
    expect(fs.existsSync(s.path)).toBe(true);
    s.remove();
    expect(fs.existsSync(s.path)).toBe(false);
  });
});
