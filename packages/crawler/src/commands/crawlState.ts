/**
 * 断点续跑状态（docs/16 规模化兜底，用户重点要求，类比 video-pipeline 的过程记录）：
 * 长跑爬取（数万~十几万条）中途崩溃时，把「已完成哪些栏目」落盘到
 * `<repoRoot>/.crawl-state/<runId>.json`，重跑时 `--resume <文件>` 直接跳过已完成栏目，
 * 已落库的产品详情也不再重抓——失败不前功尽弃。
 *
 * 生命周期：
 * - 正常运行：crawl 开始时 create（写初始文件）→ 每完成一个栏目 markDone + save →
 *   整轮成功后 remove（清理）；整轮失败保留文件并打印续跑命令。
 * - 续跑：`--resume <path>`（或 `--resume` 自动取目录内最新文件）→ load → 已 done 的栏目整段跳过。
 */
import fs from 'node:fs';
import path from 'node:path';
import { repoRoot } from '@competitor-crawler/shared';

export interface SectionStat {
  newCount: number;
  updatedCount: number;
  failedCount: number;
}

interface SectionState extends SectionStat {
  status: 'done' | 'failed';
  finishedAt: number;
}

export interface CrawlStateFile {
  runId: string;
  /** Unix 秒 */
  startedAt: number;
  updatedAt: number;
  /** 触发续跑所需的原始选项（site/source 等，仅供人读） */
  opts: Record<string, unknown>;
  domains: Record<string, Record<string, SectionState>>;
}

export class CrawlState {
  private constructor(
    readonly path: string,
    private data: CrawlStateFile,
  ) {}

  /** 进程内自增序号：与毫秒时间戳组合，保证同一毫秒内连续 create 也不重名（否则两爬虫同毫秒启动会互相覆盖断点文件） */
  private static seq = 0;

  /** 断点目录（可用 dirOverride 覆盖，测试用临时目录） */
  static dir(dirOverride?: string): string {
    return dirOverride ?? path.join(repoRoot, '.crawl-state');
  }

  /** 新建一轮的状态文件（runId = 启动时间戳，保证不重名） */
  static create(opts: Record<string, unknown>, dirOverride?: string): CrawlState {
    const dir = CrawlState.dir(dirOverride);
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const runId = `${stamp}-${(CrawlState.seq++).toString(36)}`;
    const p = path.join(dir, `run-${runId}.json`);
    const now = Math.floor(Date.now() / 1000);
    const state = new CrawlState(p, { runId, startedAt: now, updatedAt: now, opts, domains: {} });
    state.save();
    return state;
  }

  /** 读取既有断点；文件不存在/损坏返回 null（调用方给明确报错） */
  static load(p: string): CrawlState | null {
    if (!fs.existsSync(p)) return null;
    try {
      const data = JSON.parse(fs.readFileSync(p, 'utf8')) as CrawlStateFile;
      if (!data || typeof data !== 'object' || !data.domains) return null;
      return new CrawlState(p, data);
    } catch {
      return null;
    }
  }

  /** 目录内最新的断点文件路径（--resume 不带值时自动续最近一次）；无则 null */
  static latest(dirOverride?: string): string | null {
    const dir = CrawlState.dir(dirOverride);
    if (!fs.existsSync(dir)) return null;
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .sort()
      .reverse();
    return files.length ? path.join(dir, files[0]) : null;
  }

  isDone(domain: string, sectionKey: string): boolean {
    return this.data.domains[domain]?.[sectionKey]?.status === 'done';
  }

  get doneCount(): number {
    return Object.values(this.data.domains).reduce(
      (acc, secs) => acc + Object.values(secs).filter((s) => s.status === 'done').length,
      0,
    );
  }

  markDone(domain: string, sectionKey: string, stat: SectionStat): void {
    const secs = this.data.domains[domain] ?? {};
    secs[sectionKey] = { status: 'done', finishedAt: Math.floor(Date.now() / 1000), ...stat };
    this.data.domains[domain] = secs;
  }

  /** 落盘（同步写，量小频低，无需原子临时文件） */
  save(): void {
    this.data.updatedAt = Math.floor(Date.now() / 1000);
    fs.mkdirSync(path.dirname(this.path), { recursive: true });
    fs.writeFileSync(this.path, JSON.stringify(this.data, null, 2), 'utf8');
  }

  /** 整轮成功后清理断点文件（忽略删除失败） */
  remove(): void {
    try {
      fs.rmSync(this.path, { force: true });
    } catch {
      /* 清理失败不影响主流程 */
    }
  }
}
