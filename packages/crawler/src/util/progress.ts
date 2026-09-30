/**
 * 进度展示工具（用户铁律：长时间任务必须展示进度，尽量单行更新，别让用户干等）。
 * - 默认单行模式：用 \r 覆盖同一行，适合「计数 / 百分比 / 阶段」类进度。
 * - 复杂场景（需同时展示多指标）用 multiLine 切多行。
 * - 输出走 stderr，避免污染 stdout（脚本可能被管道 / 解析）。
 *
 * 复用点：probe / crawl / gen-site 等所有耗时脚本统一用本类，避免各写一遍进度逻辑。
 */
export interface ProgressOptions {
  multiLine?: boolean;
  stream?: NodeJS.WriteStream;
}

export class Progress {
  private readonly stream: NodeJS.WriteStream;
  private readonly multiLine: boolean;
  private current = '';

  constructor(opts: ProgressOptions = {}) {
    this.stream = opts.stream ?? process.stderr;
    this.multiLine = opts.multiLine ?? false;
  }

  /** 更新进度；单行模式覆盖上一行 */
  update(msg: string): void {
    if (this.multiLine) {
      this.stream.write(msg + '\n');
      return;
    }
    this.stream.write(`\r\u001b[2K${msg}`);
    this.current = msg;
  }

  /** 任务结束，补一个换行收尾（单行模式可传入最终文案） */
  done(msg?: string): void {
    if (this.multiLine) {
      if (msg) this.stream.write(msg + '\n');
      return;
    }
    this.stream.write(`\r\u001b[2K${msg ?? this.current}\n`);
  }

  /** 追加一行（多行模式直接写；单行模式先换行再写——用于进度定格后的明细列表） */
  writeLine(msg: string): void {
    this.stream.write(`${this.multiLine ? '' : '\r\u001b[2K\n'}${msg}\n`);
  }
}

/**
 * 并发计数进度（Progress 的配套件）：适合 p-limit 并发详情抓取、批量落库等
 * 「已知总数、逐条完成」的阶段——逐条 tick 单行刷新，实时显示 完成数/总数/百分比/
 * 成功失败拆分/速率；失败明细不刷进度行（避免顶掉进度），finish 时统一返回。
 *
 * 用法：
 *   const c = new ProgressCounter(progress, '详情', targets.length);
 *   await Promise.all(targets.map((it) => limiter(async () => {
 *     try { ... } catch (e) { ... } finally { c.tick(ok, ok ? undefined : errMsg); }
 *   })));
 *   const failures = c.finish();   // 收尾并打印失败明细（无失败则静默）
 */
export class ProgressCounter {
  private done = 0;
  private failed = 0;
  private readonly t0 = Date.now();
  private readonly failures: string[] = [];

  constructor(
    private readonly progress: Progress,
    private readonly label: string,
    private readonly total: number,
  ) {}

  /** 完成一条。ok=false 时 detail 记为失败原因（计入明细，不刷进度行） */
  tick(ok = true, detail?: string): void {
    this.done++;
    if (!ok && detail) {
      this.failed++;
      this.failures.push(detail);
    }
    const sec = (Date.now() - this.t0) / 1000;
    const rate = sec >= 1 ? `${Math.round((this.done / sec) * 60)}条/分` : '…';
    const pct = this.total > 0 ? Math.round((this.done / this.total) * 100) : 100;
    this.progress.update(
      `${this.label} ${this.done}/${this.total}（${pct}%）✓${this.done - this.failed} ✗${this.failed} ${rate}`,
    );
  }

  /**
   * 阶段收尾：把进度行定格为最终态（补换行）；有失败时在换行后逐行打印明细。
   * @returns 失败明细数组（调用方需计入 summary 时用）
   */
  finish(finalNote?: string): string[] {
    const sec = (Date.now() - this.t0) / 1000;
    const dur = sec >= 60 ? `${(sec / 60).toFixed(1)}分` : `${sec.toFixed(0)}秒`;
    this.progress.done(
      `${this.label} 完成 ${this.done}/${this.total} ✓${this.done - this.failed} ✗${this.failed} 用时 ${dur}${finalNote ? ` · ${finalNote}` : ''}`,
    );
    for (const f of this.failures) this.progress.writeLine(`  ✗ ${f}`);
    return this.failures;
  }
}
