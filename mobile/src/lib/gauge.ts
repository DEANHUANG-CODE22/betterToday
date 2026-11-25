/**
 * 仪表的计算（E 版，2026-11-19）。纯函数，不碰 React。
 * 每块表的刻度只来自三处：你自己的历史（28 日基线）、手表给的区间、规则自己的门槛。不设凭空的目标值。
 */
import type { StressSample } from './types.ts';
import { DAY_SLOTS, daySlots } from './daySeries.ts';

/**
 * 规则门槛，和 advice.ts 里的字面量同值（那边没有导出常量）。
 * gauge.test.ts 会去读 advice.ts 核对，那边改了这里跟着改。
 */
export const RULE = {
  /** 负荷比超过它：今天别再跑。 */
  acwrStop: 1.5,
  /** 状态值低于它：先把账还上。 */
  tsbStop: -30,
  /** 状态值要高于它才可能上强度。 */
  tsbNoIntensity: -10,
  /** 离上次强度至少隔这么多天才可能再上。 */
  minDaysBetweenHard: 2,
} as const;

/** 运动页三块表的量程。 */
export const SCALE = {
  tsb: [-40, 30] as const,
  acwr: [0, 2] as const,
  daysSinceHard: [0, 14] as const,
  /** 睡眠时长，小时。 */
  sleepH: [0, 10] as const,
  recovery: [0, 100] as const,
};

/** 值在量程里的位置，夹在 0…1。 */
export function frac(value: number, min: number, max: number): number {
  if (!(max > min)) return 0;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

export function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const t = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(t), cy + r * Math.sin(t)];
}

/** SVG 弧（顺时针，角度从 +x 轴起、y 向下，和 SVG 一致）。 */
export function arcPath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const sweep = Math.min(359.99, Math.max(0, a1 - a0));
  const [x0, y0] = polar(cx, cy, r, a0);
  const [x1, y1] = polar(cx, cy, r, a0 + sweep);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${sweep > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

/** 270° 表：左下起、右下止。 */
export const ARC = { start: 135, sweep: 270 } as const;
/** 半圆表：左起、右止。 */
export const SEMI = { start: 180, sweep: 180 } as const;

/**
 * HRV 表的量程：让手表区间占中间一半，当晚的值再在外面也装得下。
 * 26–52、当晚 56 → 13–65。
 */
export function hrvScale(low: number, high: number, ...values: (number | undefined)[]): [number, number] {
  const pad = Math.max(1, (high - low) / 2);
  let min = low - pad;
  let max = high + pad;
  // 当晚的值、手表基线都要装得下。
  for (const value of values) {
    if (value == null) continue;
    min = Math.min(min, value - 2);
    max = Math.max(max, value + 2);
  }
  return [Math.max(0, Math.floor(min)), Math.ceil(max)];
}

/** 一天的压力按小时求均值，24 格；那一小时一个点都没有就留空，不补 0。 */
export function hourlyStress(series: StressSample[], offsetMin: number): (number | undefined)[] {
  const slots = daySlots(series.map((p) => ({ t: p.t, value: p.stress })), offsetMin);
  const per = DAY_SLOTS / 24;
  return Array.from({ length: 24 }, (_, h) => {
    const vals = slots.slice(h * per, h * per + per).filter((v): v is number => v != null);
    return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : undefined;
  });
}

/** 压力值落在哪一段：0–25、26–50、51–75、76–100 → 0…3。表盘按段上色。 */
export function stressBand(v: number): 0 | 1 | 2 | 3 {
  if (v <= 25) return 0;
  if (v <= 50) return 1;
  if (v <= 75) return 2;
  return 3;
}

/** 值落在哪个警戒段里；不在任何段里给空。 */
export function zoneOf<T extends { from: number; to: number }>(fraction: number, zones: T[] | undefined): T | undefined {
  return zones?.find((z) => fraction >= z.from && fraction <= z.to);
}

/** 两个 ISO 日期之间差几天（b − a）。 */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

/** 刻度条的量程：以基线为中心上下各留 spread 比例，值在外面也装得下。 */
export function centeredScale(base: number, spread: number, value?: number): [number, number] {
  let min = base * (1 - spread);
  let max = base * (1 + spread);
  if (value != null) {
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  return [Math.floor(min), Math.ceil(max)];
}
