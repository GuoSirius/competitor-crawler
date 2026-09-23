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
}
