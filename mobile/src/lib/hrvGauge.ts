/** 夜间 HRV 在环上的位置。0 是尺子的低端，1 是高端，调用方不要把两端画到同一个角度。 */

export interface HrvRingMark {
  bandStart: number;
  bandEnd: number;
  dot: number;
  outside: boolean;
}

/** 区间占尺子中间一半，两端各留出半个区间宽度。出界的点贴在端点，不绕回另一头。 */
export function hrvRingMark(value: number, low: number, high: number): HrvRingMark | undefined {
  if (!Number.isFinite(value) || !Number.isFinite(low) || !Number.isFinite(high)) return undefined;
  const lo = Math.min(low, high);
  const hi = Math.max(low, high);
  const span = hi - lo;
  const pad = span > 0 ? span / 2 : Math.max(Math.abs(lo) * 0.25, 1);
  const domainLo = lo - pad;
  const domainHi = hi + pad;
  const place = (v: number) => (Math.min(domainHi, Math.max(domainLo, v)) - domainLo) / (domainHi - domainLo);
  return {
    bandStart: place(lo),
    bandEnd: place(hi),
    dot: place(value),
    outside: value < lo || value > hi,
  };
}
