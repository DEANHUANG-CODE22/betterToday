import { addDays, baseline, type Baseline } from './metrics.ts';
import type { ISODate } from './types.ts';

export const TREND_METRICS = ['sleep', 'hrv', 'recovery', 'steps', 'restingHr', 'stress', 'activeKcal', 'exerciseMin', 'floors', 'avgHr'] as const;
export type TrendMetric = (typeof TREND_METRICS)[number];

export function isTrendMetric(value: string): value is TrendMetric {
  return (TREND_METRICS as readonly string[]).includes(value);
}

/** 手表已经给出的判断。对不上的词不上色。 */
export function judgmentTone(status?: string): 'good' | 'fair' | 'poor' | undefined {
  const key = status?.trim().toLowerCase();
  if (!key) return undefined;
  if (['normal', 'balanced', 'good', 'optimal', 'fresh'].includes(key)) return 'good';
  if (['low', 'high', 'tired', 'fatigued'].includes(key)) return 'fair';
  if (['poor', 'exhausted', 'unbalanced'].includes(key)) return 'poor';
  return undefined;
}

/** 睡眠评分只给趋势图上的点用，不进入建议。85 分及以上、70–84、70 分以下。 */
export function sleepScoreTone(score?: number): 'good' | 'fair' | 'poor' | undefined {
  if (score == null) return undefined;
  if (score >= 85) return 'good';
  if (score >= 70) return 'fair';
  return 'poor';
}

export function windowDates(end: ISODate, days: number): ISODate[] {
  return Array.from({ length: days }, (_, i) => addDays(end, i - days + 1));
}

export function aligned(dates: ISODate[], points: { date: ISODate; value?: number }[]): (number | undefined)[] {
  const byDate = new Map(points.filter((p) => p.value != null).map((p) => [p.date, p.value as number]));
  return dates.map((date) => byDate.get(date));
}

export function enoughToChart(values: (number | undefined)[]): boolean {
  return values.filter((v) => v != null).length >= 4;
}

export function baselineSentence(b: Baseline, unit: string, digits = 0): string | undefined {
  const fmt = (n: number) => (digits > 0 ? n.toFixed(digits) : Math.round(n).toLocaleString());
  const tail = unit ? ` ${unit}` : '';
  const parts: string[] = [];
  if (b.avg7 != null) parts.push(`近 7 日均 ${fmt(b.avg7)}${tail}`);
  if (b.avg28 != null) parts.push(`你的 28 日基线是 ${fmt(b.avg28)}${tail}`);
  return parts.length ? `${parts.join('，')}。` : undefined;
}

export function seriesBaseline(points: { date: ISODate; value?: number }[], date: ISODate, threshold = 0.07): Baseline {
  return baseline(points, date, threshold);
}
