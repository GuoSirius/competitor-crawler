import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

// 全项目统一时间处理（用户铁律：一律用 dayjs，业务时区锁定 Asia/Shanghai）
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault('Asia/Shanghai');

/** 当前 Unix 秒级时间戳（落库统一用整数秒，无 Z） */
export function nowSeconds(): number {
  return dayjs().unix();
}

/** 格式化为北京时间字符串 YYYY-MM-DD HH:mm:ss（展示用） */
export function formatBj(dt?: number | Date): string {
  return dayjs(dt).tz('Asia/Shanghai').format('YYYY-MM-DD HH:mm:ss');
}

export { dayjs };
