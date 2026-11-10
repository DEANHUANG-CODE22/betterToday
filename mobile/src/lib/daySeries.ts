import type { StressSample } from './types';

/** 一天按 5 分钟切成 288 格，横轴是当地时间。缺的格留空，不补 0。 */
export const DAY_SLOTS = 288;

export function daySlots(points: { t: number; value: number }[], offsetMin: number): (number | undefined)[] {
  const out: (number | undefined)[] = Array(DAY_SLOTS).fill(undefined);
  for (const point of points) {
    const local = point.t + offsetMin * 60;
    const minute = ((Math.floor(local / 60) % 1440) + 1440) % 1440;
    out[Math.floor(minute / 5)] = point.value;
  }
  return out;
}

export function stressSlots(points: StressSample[], offsetMin: number): (number | undefined)[] {
  return daySlots(points.map((point) => ({ t: point.t, value: point.stress })), offsetMin);
}

export function heartSlots(points: StressSample[], offsetMin: number): (number | undefined)[] {
  return daySlots(
    points.flatMap((point) => (point.hr != null && point.hr > 0 ? [{ t: point.t, value: point.hr }] : [])),
    offsetMin,
  );
}

export function filledSlots(values: (number | undefined)[]): number {
  return values.filter((value) => value != null).length;
}

export function slotClock(slot: number): string {
  const minute = slot * 5;
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}
