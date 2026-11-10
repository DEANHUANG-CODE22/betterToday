import { addDays, toISODate } from './metrics.ts';
import type { ISODate } from './types.ts';

type Session = { startTime: string; distanceM: number };

export interface DayVolume {
  count: number;
  distanceM: number;
}

export function sessionsByDate(activities: Session[]): Map<ISODate, DayVolume> {
  const map = new Map<ISODate, DayVolume>();
  for (const activity of activities) {
    const date = toISODate(new Date(activity.startTime));
    const current = map.get(date) ?? { count: 0, distanceM: 0 };
    current.count += 1;
    current.distanceM += activity.distanceM;
    map.set(date, current);
  }
  return map;
}

/** 本周从周一开始，共 7 天，含今天之后还没到的日子。 */
export function weekDates(today: ISODate): ISODate[] {
  const [y, m, d] = today.split('-').map(Number);
  const weekday = new Date(y, m - 1, d).getDay();
  const start = addDays(today, weekday === 0 ? -6 : 1 - weekday);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export interface MonthCell {
  date?: ISODate;
  count: number;
}

export function monthGrid(today: ISODate, byDate: Map<ISODate, DayVolume>): { label: string; total: number; cells: MonthCell[] } {
  const [y, m] = today.split('-').map(Number);
  const lead = (new Date(y, m - 1, 1).getDay() + 6) % 7;
  const days = new Date(y, m, 0).getDate();
  const cells: MonthCell[] = Array.from({ length: lead }, () => ({ count: 0 }));
  let total = 0;
  const prefix = `${y}-${String(m).padStart(2, '0')}`;
  for (let day = 1; day <= days; day += 1) {
    const date = `${prefix}-${String(day).padStart(2, '0')}`;
    const count = byDate.get(date)?.count ?? 0;
    total += count;
    cells.push({ date, count });
  }
  while (cells.length % 7 !== 0) cells.push({ count: 0 });
  return { label: `${m} 月`, total, cells };
}

export interface YearMonth {
  label: string;
  count: number;
  /** 还没到。不写 0。 */
  future: boolean;
  /** 这一年的库里已经覆盖到这个月。更早的月份没有记录，不写成 0。 */
  known: boolean;
}

export function yearMonths(today: ISODate, byDate: Map<ISODate, DayVolume>): YearMonth[] {
  const [y, current] = today.split('-').map(Number);
  const yearPrefix = `${y}-`;
  let firstMonth: number | undefined;
  for (const date of byDate.keys()) {
    if (!date.startsWith(yearPrefix)) continue;
    const month = Number(date.slice(5, 7));
    if (month > current) continue;
    if (firstMonth == null || month < firstMonth) firstMonth = month;
  }
  return Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    const prefix = `${yearPrefix}${String(month).padStart(2, '0')}`;
    let count = 0;
    for (const [date, volume] of byDate) {
      if (date.slice(0, 7) === prefix) count += volume.count;
    }
    const future = month > current;
    return { label: `${month} 月`, count, future, known: !future && firstMonth != null && month >= firstMonth };
  });
}
