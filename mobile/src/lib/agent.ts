/**
 * D 版「Agent」的话：每页先一句结论（它说的），再列它看到的数、它有多确定。
 * 只陈述数和缺口，不下该练该歇；今天练不练只在运动页的建议里（advice.ts）。
 * 口吻用「我」（2026-11-15 用户定的）。这里不改 advice.ts 的任何分支。
 */
import type { Confidence } from './advice.ts';
import { addDays, fmtHM } from './metrics.ts';
import type { DailyHealth, ISODate, SleepNight } from './types.ts';

export interface Voice {
  /** 结论那一句，大字。 */
  title: string;
  /** 结论下面的一两句，正文色。 */
  body: string;
}

const md = (d: ISODate) => `${Number(d.slice(5, 7))} 月 ${Number(d.slice(8, 10))} 日`;

/** 睡眠页那句话要用到的手表恢复信息（中文档位、预计完全恢复小时数）。 */
export interface RecoveryFacts {
  level?: string;
  fullRecoveryH?: number;
}

/**
 * HRV 那半句：先报数，再和你自己的平时（手表基线）比，最后说在不在你的正常范围（手表给的区间）里，范围写出数。
 * 不用「手表区间」这种内部说法（2026-11-25 用户说看不懂）。和基线差 5% 以内算「差不多」。
 */
export function hrvPhrase(v: number, base?: number, low?: number, high?: number): { text: string; outside: boolean } {
  const range = low != null && high != null ? `${low}–${high}` : undefined;
  if (range && v > high!) return { text: `HRV ${v}，高过你的正常范围（${range}）。`, outside: true };
  if (range && v < low!) return { text: `HRV ${v}，低于你的正常范围（${range}）。`, outside: true };
  const cmp = base != null && base > 0 ? (Math.abs(v - base) / base <= 0.05 ? 'same' : v > base ? 'high' : 'low') : undefined;
  if (cmp === 'same') return { text: `HRV ${v}，和你平时的 ${base} 差不多。`, outside: false };
  if (cmp && range) return { text: `HRV ${v}，比你平时的 ${base} ${cmp === 'high' ? '高' : '低'}，还在你的正常范围（${range}）里。`, outside: false };
  if (cmp) return { text: `HRV ${v}，你平时是 ${base}。`, outside: false };
  if (range) return { text: `HRV ${v}，在你的正常范围（${range}）里。`, outside: false };
  return { text: `HRV ${v}。`, outside: false };
}

/** 睡眠页那一句。night 是最近一条有睡眠时长的记录；today 是今天；recovery 是手表对恢复的原话。 */
export function sleepVoice(night: SleepNight | undefined, today: ISODate, recovery?: RecoveryFacts): Voice {
  if (!night || !(night.totalMin > 0)) {
    return { title: '我还没看到昨夜的睡眠。', body: '戴表睡一晚、同步之后，这里才有东西可说。' };
  }
  // 睡眠记在醒来那天：今天醒来就是「昨夜」，更早的写「X 日醒来」，不写「X 日那晚」（会被读成那天晚上）。
  let title = night.date === today ? `昨夜睡了 ${fmtHM(night.totalMin)}。` : `${md(night.date)}醒来，睡了 ${fmtHM(night.totalMin)}。`;
  let outside = false;
  if (night.hrv != null) {
    const p = hrvPhrase(Math.round(night.hrv), night.hrvBaseline, night.hrvLow, night.hrvHigh);
    title += p.text;
    outside = p.outside;
  }
  const parts: string[] = [];
  if (night.date < today) parts.push('这是最近一晚的数，昨夜的还没同步。');
  if (outside) parts.push('这只是一晚，我不拿它下结论。');
  if (recovery?.level || recovery?.fullRecoveryH != null) {
    const level = recovery.level ? `手表说恢复${recovery.level}` : '手表说';
    const h = recovery.fullRecoveryH;
    const tail = h == null ? '' : h === 0 ? '，已经完全恢复' : `，预计 ${h} 小时后完全恢复`;
    parts.push(`${level}${tail}。`);
  }
  return { title, body: parts.join('') };
}

/** 日常健康页那一句。rhrBase：这天静息心率的 28 日基线和方向。 */
export function dailyVoice(
  row: DailyHealth | undefined,
  dayWord: string,
  rhrBase?: { avg28?: number; trend?: 'up' | 'down' | 'normal' },
): Voice {
  const steps = typeof row?.steps === 'number' ? Math.round(row.steps) : undefined;
  const stress = typeof row?.stress === 'number' ? Math.round(row.stress) : undefined;
  const head = [
    steps != null ? `走了 ${steps.toLocaleString('en-US')} 步` : '',
    stress != null ? `压力日均 ${stress}` : '',
  ].filter(Boolean);
  const title = head.length ? `${dayWord}${head.join('，')}。` : `${dayWord}我没看到步数和压力。`;
  let body = '';
  const rhr = typeof row?.restingHr === 'number' ? Math.round(row.restingHr) : undefined;
  if (rhr != null) {
    const base = rhrBase?.avg28 != null ? Math.round(rhrBase.avg28) : undefined;
    if (base == null) body = `静息心率 ${rhr}。`;
    else if (rhrBase?.trend === 'up') body = `静息心率 ${rhr}，比你平时的 ${base} 高。`;
    else if (rhrBase?.trend === 'down') body = `静息心率 ${rhr}，比你平时的 ${base} 低。`;
    else body = `静息心率 ${rhr}，和你平时的 ${base} 差不多。`;
  }
  return { title, body };
}

/**
 * 「把握」后面那句：缺什么、补上什么就能更确定。
 * 只认 advice.ts 里同样会让把握变低的缺口（今夜没睡眠、近 7 天不到 3 晚、今夜没 HRV），
 * 口径和那边一致：近 7 天 = 今天往前数 6 天加今天，有时长或有 HRV 都算一晚。
 */
export function confidenceTip(sleep: SleepNight[], today: ISODate, confidence: Confidence): string | undefined {
  if (confidence === 'high') return undefined;
  const start = addDays(today, -6);
  const nights = sleep.filter((s) => s.date >= start && s.date <= today && (s.totalMin > 0 || s.hrv != null)).length;
  const tonight = sleep.find((s) => s.date === today);
  const hasTonight = !!tonight && tonight.totalMin > 0;
  if (!hasTonight && nights < 3) {
    const more = 3 - nights;
    return `近 7 天我只看到 ${nights} 晚睡眠。今晚起再戴表睡 ${more} 晚，我就能比你自己的平时。`;
  }
  if (!hasTonight) return '昨夜没有睡眠记录。今晚戴表睡，明天会更确定。';
  if (nights < 3) return `近 7 天我只看到 ${nights} 晚睡眠。再戴表睡 ${3 - nights} 晚，我就能比你自己的平时。`;
  if (tonight && tonight.hrv == null) return '昨夜没测到 HRV，只能按你平时的数看。';
  return undefined;
}

export const CONFIDENCE_LABEL: Record<Confidence, string> = { high: '把握高', medium: '把握中', low: '把握低' };
export const CONFIDENCE_BARS: Record<Confidence, number> = { high: 3, medium: 2, low: 1 };

/** 依据句式是「人话 —— 参照」，拆成两段，证据行上下排。 */
export function splitReason(reason: string): { head: string; tail?: string } {
  const at = reason.indexOf(' —— ');
  if (at < 0) return { head: reason };
  return { head: reason.slice(0, at), tail: reason.slice(at + 4) };
}
