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

  /**
   * 任务结束，补一个换行收尾（单行模式可传入最终文案）。
   * 关键：结尾带 \n，把光标移到新行——后续阶段（如详情）的进度从新行开始，
   * 不会用 \r 覆盖本阶段已定格的行（docs/16 P5-进度：列表进度需保留可见）。
   */
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

/** 秒数 → 人类可读时长（<60s 用「秒」，否则「分」） */
function fmtDur(sec: number): string {
  return sec >= 60 ? `${(sec / 60).toFixed(1)}分` : `${sec.toFixed(0)}秒`;
}

export interface CounterOptions {
  /** 计量单位（用于速率后缀，如 '页' → '页/分'），默认 '条' */
  unit?: string;
  /**
   * 是否展示 成功/失败 拆分（✓/✗）。
   * - 详情抓取等「逐项可能失败」场景设 true（默认）：失败计入明细，finish 时统一打印。
   * - 列表翻页等「整页成功/失败、失败不逐项计数」场景设 false：改用 note 展示页码等状态。
   */
  showOutcome?: boolean;
  /** 是否每 tick 实时展示用时（不仅 finish），默认 false */
  liveTime?: boolean;
}

/**
 * 并发计数进度（Progress 的配套件）：适合 p-limit 并发详情抓取、批量落库等
 * 「已知总数、逐条完成」的阶段——逐条 tick 单行刷新，实时显示 完成数/总数/百分比/
 * 成功失败拆分/速率；失败明细不刷进度行（避免顶掉进度），finish 时统一返回。
 *
 * 也支持「页级」进度（showOutcome=false）：列表翻页每页 tick 一次，展示页码/累计条数/
 * 用时/速率，整页失败不计入 ✓/✗（失败由 traverse 上报）。详情阶段结束后本进度行
 * 被 commit（带 \n），不被后续详情进度覆盖。
 *
 * 用法（详情）：
 *   const c = new ProgressCounter(progress, '详情', targets.length);
 *   await Promise.all(targets.map((it) => limiter(async () => {
 *     try { ... } catch (e) { ... } finally { c.tick(ok, ok ? undefined : errMsg); }
 *   })));
 *   const failures = c.finish();   // 收尾并打印失败明细（无失败则静默）
 *
 * 用法（列表页级）：
 *   const bar = new ProgressCounter(progress, '列表', cap, { unit: '页', showOutcome: false, liveTime: true });
 *   bar.note(`翻页 ${url}`);
 *   onPage: (html, pageNo) => { bar.tick(true, `第${pageNo}页 +${n}条`); }
 *   bar.finish('去重… · 详情解析…');  // 定格成独立行，带用时
 */
export class ProgressCounter {
  private done = 0;
  private failed = 0;
  private readonly t0 = Date.now();
  private readonly failures: string[] = [];
  private readonly unit: string;
  private readonly showOutcome: boolean;
  private readonly liveTime: boolean;

  constructor(
    private readonly progress: Progress,
    private readonly label: string,
    private readonly total: number,
    private readonly opts: CounterOptions = {},
  ) {
    this.unit = opts.unit ?? '条';
    this.showOutcome = opts.showOutcome ?? true;
    this.liveTime = opts.liveTime ?? false;
  }

  /** 进度头：done/total（或 第N页，当 total 未知）+ 百分比 + 速率 +（可选）用时 */
  private head(): string {
    const pct = this.total > 0 ? Math.round((this.done / this.total) * 100) : 0;
    const sec = (Date.now() - this.t0) / 1000;
    const rate = sec >= 1 ? `${Math.round((this.done / sec) * 60)}${this.unit}/分` : '…';
    // total 未知且尚未开始 → 显示「翻页中」，避免别扭的「第0页」
    const where = this.total > 0
      ? `${this.done}/${this.total}（${pct}%）`
      : this.done > 0
        ? `第${this.done}页`
        : '翻页中';
    const time = this.liveTime ? ` 用时${fmtDur(sec)}` : '';
    return `${this.label} ${where} ${rate}${time}`;
  }

  /** 阶段内提示（不增加计数、不计入失败，仅刷新进度行），如「翻页中 URL」「第N页 +X条」 */
  note(msg?: string): void {
    this.progress.update(`${this.head()}${msg ? ` · ${msg}` : ''}`);
  }

  /**
   * 完成一条。
   * - showOutcome=true（默认，详情抓取）：ok=false 时 detail 记为失败原因（计入明细，不刷进度行）。
   * - showOutcome=false（列表页级）：detail 作为状态备注实时展示，不计入失败。
   */
  tick(ok = true, detail?: string): void {
    this.done++;
    if (!ok) {
      this.failed++;
      if (detail) this.failures.push(detail);
    }
    let extra = '';
    if (this.showOutcome) {
      extra = ` ✓${this.done - this.failed} ✗${this.failed}`;
    } else if (detail) {
      extra = ` · ${detail}`;
    }
    this.progress.update(`${this.head()}${extra}`);
  }

  /**
   * 阶段收尾：把进度行定格为最终态（补换行，使后续阶段从新行开始，不覆盖本行）；
   * 有失败时在换行后逐行打印明细。
   * @returns 失败明细数组（调用方需计入 summary 时用）
   */
  finish(finalNote?: string): string[] {
    const sec = (Date.now() - this.t0) / 1000;
    const dur = fmtDur(sec);
    const where = this.total > 0 ? `${this.done}/${this.total}` : `第${this.done}页`;
    const outcome = this.showOutcome ? ` ✓${this.done - this.failed} ✗${this.failed}` : '';
    this.progress.done(
      `${this.label} 完成 ${where}${outcome} 用时${dur}${finalNote ? ` · ${finalNote}` : ''}`,
    );
    for (const f of this.failures) this.progress.writeLine(`  ✗ ${f}`);
    return this.failures;
  }
}
