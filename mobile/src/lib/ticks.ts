/**
 * 纵轴两条刻度取整：26 和 73 这种数据端点像坐标，不像路标。
 * 按跨度取 1 / 2 / 5 × 10^n 的步长（约五分之一跨度），落在数据范围之内；取不出两条就退回端点。
 */
export function niceTicks(min: number, max: number): [number, number] {
  const span = max - min;
  if (!(span > 0)) return [max, min];
  const raw = span / 5;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((k) => k * mag).find((k) => k >= raw - 1e-9) ?? 10 * mag;
  const top = Math.floor(max / step + 1e-9) * step;
  const bottom = Math.ceil(min / step - 1e-9) * step;
  return top > bottom ? [round(top), round(bottom)] : [max, min];
}

const round = (v: number) => Math.round(v * 1e6) / 1e6;
