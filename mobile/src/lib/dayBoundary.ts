/**
 * 「今天」从醒来开始（2026-11-27，学 betterNow 的 DayBoundary）。
 * 半夜打开不该看到一个「今天」的新建议：今天的建议要等昨夜结束才有意义。
 *
 * - 今天已经有一晚结束（有醒来日期是今天的睡眠记录）→ 翻天。
 * - 否则到「平时醒来时间 + 2 小时」才翻，夹在 5:00–12:00；没有醒来记录按 9:00。
 * - 翻天之前，「今天」仍是昨天（beforeMorning = true）。
 *
 * 这里只决定拿哪一天去问规则，不改 advice.ts 的任何判断。
 */
import { addDays, toISODate } from './metrics.ts';
import type { ISODate, SleepNight } from './types.ts';

export interface DayInfo {
  /** 按醒来算的「今天」：建议、睡眠页、每日记录都用它。 */
  today: ISODate;
  /** 日历上的今天：日常健康（步数、压力从零点开始算）用它。 */
  calendarToday: ISODate;
  /** 还没到早上：今天 = 昨天。 */
  beforeMorning: boolean;
}

const MIN_BOUNDARY = 5 * 60;
const MAX_BOUNDARY = 12 * 60;
const DEFAULT_BOUNDARY = 9 * 60;

/** 近 14 晚醒来时刻（当地时间，分钟）的中位数；没有记录给空。 */
export function usualWakeMinutes(sleep: SleepNight[], before: ISODate): number | undefined {
  const mins = sleep
    .filter((s) => s.date < before && s.wakeTime)
    .slice(-14)
    .map((s) => {
      const d = new Date(s.wakeTime);
      return Number.isNaN(d.getTime()) ? undefined : d.getHours() * 60 + d.getMinutes();
    })
    .filter((m): m is number => m != null)
    .sort((a, b) => a - b);
  if (!mins.length) return undefined;
  const mid = Math.floor(mins.length / 2);
  return mins.length % 2 ? mins[mid] : Math.round((mins[mid - 1] + mins[mid]) / 2);
}

export function dayBoundaryMinutes(sleep: SleepNight[], calendarToday: ISODate): number {
  const wake = usualWakeMinutes(sleep, calendarToday);
  if (wake == null) return DEFAULT_BOUNDARY;
  return Math.max(MIN_BOUNDARY, Math.min(MAX_BOUNDARY, wake + 120));
}

export function dayInfo(now: Date, sleep: SleepNight[]): DayInfo {
  const calendarToday = toISODate(now);
  const nightEnded = sleep.some((s) => s.date === calendarToday && s.totalMin > 0);
  if (nightEnded) return { today: calendarToday, calendarToday, beforeMorning: false };
  const nowMin = now.getHours() * 60 + now.getMinutes();
  if (nowMin < dayBoundaryMinutes(sleep, calendarToday)) {
    return { today: addDays(calendarToday, -1), calendarToday, beforeMorning: true };
  }
  return { today: calendarToday, calendarToday, beforeMorning: false };
}
