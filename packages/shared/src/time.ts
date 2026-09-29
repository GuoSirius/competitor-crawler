import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

// 全项目统一时间处理（铁律：一律 dayjs，业务时区锁定 Asia/Shanghai，时间戳统一 Unix 秒）
//
// ⚠️ 本文件是全仓**唯一**允许出现 tz('Asia/Shanghai') / 时区换算的地方。
//    业务代码禁止散落 `dayjs(...).tz(...)` / 裸 `new Date()` 取日历分量（补丁式写法不满足开发规范，
//    见 docs/12 §12.15 时间处理规范），一律 import 本文件的封装函数：
//      · 展示          → formatBj(ts)
//      · 调度/日历判定  → bjParts(d)
//      · 页面日期→Unix秒 → unixFromBjParts(y, m, d, h?, mi?, s?)
//      · 当前时刻落库   → nowSeconds()
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault('Asia/Shanghai');

/** 项目业务时区（唯一常量，勿在别处硬编码） */
export const BIZ_TZ = 'Asia/Shanghai';

const p2 = (n: number): string => String(n).padStart(2, '0');

/** 两位数字补零（YYYY-MM-DD HH:mm 组装等展示/拼串用） */
export function pad2(n: number): string {
  return p2(n);
}

/** 当前 Unix 秒级时间戳（落库统一用整数秒，无 Z） */
export function nowSeconds(): number {
  return dayjs().unix();
}

/** 格式化为北京时间字符串 YYYY-MM-DD HH:mm:ss（展示用）；数字入参按 **Unix 秒** 解析 */
export function formatBj(dt?: number | Date): string {
  const d = dt == null ? dayjs() : typeof dt === 'number' ? dayjs.unix(dt) : dayjs(dt);
  return d.tz(BIZ_TZ).format('YYYY-MM-DD HH:mm:ss');
}

/**
 * 北京时间墙钟分量：按「北京日历」取 年/月(1-12)/日/时/分。
 * 用于调度判定（isScheduleDue）等「按北京日期触发」的场景，不依赖部署机时区。
 */
export function bjParts(
  dt: Date = new Date(),
): { year: number; month: number; day: number; hour: number; minute: number } {
  const b = dayjs(dt).tz(BIZ_TZ);
  return { year: b.year(), month: b.month() + 1, day: b.date(), hour: b.hour(), minute: b.minute() };
}

/**
 * 按**北京墙钟分量**构造 Unix 秒（页面日期「2026-09-05 12:30」按北京时间口径解析）。
 * 分量非法（如月 13 / 时 25）返回 null，**不做进位滚动**（比裸 new Date(y,m,d) 语义更严格）。
 */
export function unixFromBjParts(
  year: number, month: number, day: number, hour = 0, minute = 0, second = 0,
): number | null {
  const d = dayjs.tz(
    `${year}-${p2(month)}-${p2(day)} ${p2(hour)}:${p2(minute)}:${p2(second)}`,
    BIZ_TZ,
  );
  return d.isValid() ? d.unix() : null;
}

export { dayjs };
