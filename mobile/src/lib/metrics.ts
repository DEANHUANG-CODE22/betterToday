import type { Activity, DailyHealth, ISODate, SleepNight, TrainingLoadDay } from './types.ts';

export const DAY_MS = 86_400_000;

export function toISODate(d: Date): ISODate {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(date: ISODate, n: number): ISODate {
  const [y, m, d] = date.split('-').map(Number);
  return toISODate(new Date(y, m - 1, d + n));
}

export function mean(xs: number[]): number | undefined {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined;
}

export type Trend = 'up' | 'down' | 'normal';

export interface Baseline {
  value?: number;
  avg7?: number;
  avg28?: number;
  deltaPct?: number; // 相对 28 日基线
  trend: Trend;
}

/** 对 date 当天的值与此前 7 / 28 天（不含当天）的均值比较。threshold 为相对 28 日均值的显著偏离比例。 */
export function baseline(
  series: { date: ISODate; value?: number }[],
  date: ISODate,
  threshold = 0.07,
): Baseline {
  const byDate = new Map(series.filter((s) => s.value != null).map((s) => [s.date, s.value as number]));
  const window = (n: number) => {
    const xs: number[] = [];
    for (let i = 1; i <= n; i++) {
      const v = byDate.get(addDays(date, -i));
      if (v != null) xs.push(v);
    }
    return mean(xs);
  };
  const value = byDate.get(date);
  const avg7 = window(7);
  const avg28 = window(28);
  const deltaPct = value != null && avg28 ? (value - avg28) / avg28 : undefined;
  const trend: Trend = deltaPct == null || Math.abs(deltaPct) < threshold ? 'normal' : deltaPct > 0 ? 'up' : 'down';
  return { value, avg7, avg28, deltaPct, trend };
}

/**
 * 一条训练记录能不能用来算负荷（PRD §6.2 数据质量闸门）。
 *
 * 为什么需要：负荷比、体能/疲劳、强度课计数全都建立在 trainingLoad 上，
 * 而 trainingLoad 是手表自动算的。GPS 漂移、心率带脱落、记录中途中断，
 * 都会产出一条数值离谱的记录——它会污染分母，然后被规则放大成一个错误的决定。
 *
 * 判据只看「这条记录本身是否自洽」，不猜原因。
 */
export function activityQuality(a: Activity): 'ok' | 'suspect' {
  if (!a.durationS || a.durationS < 120) return 'suspect'; // 不到 2 分钟，负荷无意义
  if (a.avgHr != null && (a.avgHr < 40 || a.avgHr > 210)) return 'suspect'; // 心率离谱
  if (a.distanceM > 0) {
    const pace = a.durationS / (a.distanceM / 1000); // 秒/公里
    // 跑步和越野：3:00 – 15:00 /km；走路和徒步：1.0 – 12:00 /km。
    // 徒步 1.9 km/h 是正常的，用跑步的尺子量会把真正的长距离活动删掉，
    // 慢性负荷一变小，负荷比就会虚高（2026-11-05 真机事故）。
    if (a.sport === 'run' || a.sport === 'trail') {
      if (pace < 180 || pace > 900) return 'suspect';
    } else if (a.sport === 'walk') {
      if (pace < 300 || pace > 3600) return 'suspect';
    }
  }
  return 'ok';
}

export function dailyLoads(activities: Activity[], from: ISODate, to: ISODate): { date: ISODate; load: number }[] {
  const sums = new Map<ISODate, number>();
  for (const a of activities) {
    const d = toISODate(new Date(a.startTime));
    sums.set(d, (sums.get(d) ?? 0) + a.trainingLoad);
  }
  const out: { date: ISODate; load: number }[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push({ date: d, load: sums.get(d) ?? 0 });
  return out;
}

export interface FitnessPoint {
  date: ISODate;
  load: number;
  atl: number; // 疲劳，7 天时间常数
  ctl: number; // 体能，42 天时间常数
  tsb: number; // 状态 = CTL - ATL（取前一日值，反映训练前状态）
}

function officialLoads(loads: TrainingLoadDay[] | undefined, from: ISODate, to: ISODate): FitnessPoint[] | undefined {
  const rows = (loads ?? [])
    .filter((row) => row.date >= from && row.date <= to && (row.shortTerm != null || row.longTerm != null))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!rows.length) return undefined;
  return rows.map((row) => ({
    date: row.date,
    load: 0,
    atl: row.shortTerm ?? 0,
    ctl: row.longTerm ?? 0,
    tsb: (row.longTerm ?? 0) - (row.shortTerm ?? 0),
  }));
}

export function fitnessSeries(activities: Activity[], from: ISODate, to: ISODate, loads?: TrainingLoadDay[]): FitnessPoint[] {
  const official = officialLoads(loads, from, to);
  if (official) return official;
  const kA = 1 - Math.exp(-1 / 7);
  const kC = 1 - Math.exp(-1 / 42);
  const loadsDaily = dailyLoads(activities, from, to);
  // 以首次训练后 28 天的日均负荷作为初值，避免从 0 冷启动导致 TSB 系统性偏负
  const first = loadsDaily.findIndex((l) => l.load > 0);
  let atl = first < 0 ? 0 : mean(loadsDaily.slice(first, first + 28).map((l) => l.load))!;
  let ctl = atl;
  return loadsDaily.slice(Math.max(0, first)).map(({ date, load }) => {
    const tsb = ctl - atl;
    atl += (load - atl) * kA;
    ctl += (load - ctl) * kC;
    return { date, load, atl, ctl, tsb };
  });
}

/** 急慢性负荷比：近 7 天日均负荷 / 近 28 天日均负荷（截至 date，含当天）。 */
export function acwr(activities: Activity[], date: ISODate, loads?: TrainingLoadDay[]): number | undefined {
  // 只认「离今天足够近」的官方负荷。否则一周前的残留会被当成今天的读数。
  const official = [...(loads ?? [])]
    .filter((row) => row.date <= date && row.ratio != null)
    .filter((row) => {
      const gap = Math.round((new Date(`${date}T00:00:00Z`).getTime() - new Date(`${row.date}T00:00:00Z`).getTime()) / 86_400_000);
      return gap <= 3;
    })
    .sort((a, b) => a.date.localeCompare(b.date))
    .at(-1);
  if (official?.ratio != null) return official.ratio;
  const daily = dailyLoads(activities, addDays(date, -27), date).map((l) => l.load);
  const acute = mean(daily.slice(-7))!;
  const chronic = mean(daily)!;
  return chronic > 0 ? acute / chronic : undefined;
}

export type RecoveryLevel = 'good' | 'fair' | 'poor';

export interface RecoveryAssessment {
  level: RecoveryLevel;
  score: number;
  reasons: string[];
  hrv: Baseline;
  restingHr: Baseline;
  sleepMin?: number;
}

const SLEEP_SHORT_MIN = 390;

export function assessRecovery(sleep: SleepNight[], date: ISODate): RecoveryAssessment {
  const night = sleep.find((s) => s.date === date);
  const hrv = baseline(sleep.map((s) => ({ date: s.date, value: s.hrv })), date);
  const restingHr = baseline(sleep.map((s) => ({ date: s.date, value: s.restingHr })), date, 0.05);
  const reasons: string[] = [];

  let score = night?.recovery;
  if (score == null) {
    score = 75;
    if (hrv.deltaPct != null) score += Math.max(-25, Math.min(15, hrv.deltaPct * 150));
    if (restingHr.deltaPct != null) score -= Math.max(-10, Math.min(20, restingHr.deltaPct * 200));
    if (night) score += Math.max(-20, Math.min(10, (night.totalMin - 450) / 6));
    score = Math.round(Math.max(0, Math.min(100, score)));
  }

  if (hrv.trend === 'down') reasons.push(`昨晚身体有点紧 —— HRV 比你 28 日的常态低 ${pct(hrv.deltaPct)}，今天别再加码`);
  else if (hrv.trend === 'up') reasons.push(`昨晚恢复得比平时好 —— HRV 比你 28 日的常态高 ${pct(hrv.deltaPct)}，还有余量`);
  else if (hrv.value != null) reasons.push('昨晚的恢复在常态里 —— HRV 没有偏离你的基线');
  if (restingHr.trend === 'up') reasons.push(`身体比平时费劲 —— 静息心率比你的基线高 ${Math.round(restingHr.value! - restingHr.avg28!)} bpm，今天收着点`);
  else if (restingHr.trend === 'down') reasons.push('静息心率比平时低 —— 相对你的基线，在放松的一侧');
  else if (restingHr.value != null) reasons.push('静息心率在常态里 —— 没有偏离你的基线');
  if (!night) reasons.push('昨夜没有睡眠数据 —— 缺的是这一晚，不靠它下结论');
  else if (night.totalMin < SLEEP_SHORT_MIN) reasons.push(`这一晚偏短 —— 睡了 ${fmtHM(night.totalMin)}，今天不拿它撑强度`);
  else if (night.totalMin >= 450) reasons.push(`睡够了 —— ${fmtHM(night.totalMin)}，够支撑今天的安排`);
  else reasons.push(`睡眠在中间 —— 睡了 ${fmtHM(night.totalMin)}，余量有限`);

  const level: RecoveryLevel = score >= 70 ? 'good' : score >= 45 ? 'fair' : 'poor';
  return { level, score, reasons, hrv, restingHr, sleepMin: night?.totalMin };
}

export interface Anomaly {
  metric: string;
  message: string;
}

/** 某指标连续 days 天偏离 28 日基线超过阈值时报警。 */
export function detectAnomalies(daily: DailyHealth[], sleep: SleepNight[], date: ISODate, days = 3): Anomaly[] {
  const checks: { metric: string; label: string; series: { date: ISODate; value?: number }[]; dir: 1 | -1; threshold: number }[] = [
    { metric: 'restingHr', label: '静息心率', series: daily.map((d) => ({ date: d.date, value: d.restingHr })), dir: 1, threshold: 0.05 },
    { metric: 'stress', label: '压力', series: daily.map((d) => ({ date: d.date, value: d.stress })), dir: 1, threshold: 0.2 },
    { metric: 'hrv', label: 'HRV', series: sleep.map((s) => ({ date: s.date, value: s.hrv })), dir: -1, threshold: 0.1 },
    { metric: 'sleep', label: '睡眠时长', series: sleep.map((s) => ({ date: s.date, value: s.totalMin })), dir: -1, threshold: 0.12 },
  ];
  const out: Anomaly[] = [];
  for (const c of checks) {
    let streak = 0;
    for (let i = 0; i < days; i++) {
      const b = baseline(c.series, addDays(date, -i), c.threshold);
      if (b.deltaPct != null && b.trend === (c.dir > 0 ? 'up' : 'down')) streak++;
      else break;
    }
    if (streak === days) {
      out.push({ metric: c.metric, message: `${c.label}已连续 ${days} 天${c.dir > 0 ? '高于' : '低于'}个人基线` });
    }
  }
  return out;
}

export function pct(x?: number): string {
  return x == null ? '--' : `${Math.round(Math.abs(x) * 100)}%`;
}

export function fmtHM(min: number): string {
  return `${Math.floor(min / 60)}h${String(Math.round(min % 60)).padStart(2, '0')}m`;
}

export function fmtDuration(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.round(s % 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

export function fmtPace(secPerKm?: number): string {
  if (!secPerKm || !isFinite(secPerKm)) return '--';
  return `${Math.floor(secPerKm / 60)}'${String(Math.round(secPerKm % 60)).padStart(2, '0')}"`;
}

export function fmtKm(m: number): string {
  return (m / 1000).toFixed(2);
}

/** 固定成 24 小时制，避免 toLocaleString 随系统语言变成 AM/PM。 */
export function zhMonthDay(d: Date): string {
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`;
}

export function fmtDateTime(input: string | Date): string {
  const d = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return '--';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${zhMonthDay(d)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
