import { isHardSession, type Advice, type AdviceAction } from './advice.ts';
import { toISODate } from './metrics.ts';
import type { Activity, ISODate } from './types.ts';

/**
 * 训练后结算（PRD §4.2「同一位置，按时间窗切换」）。
 *
 * 为什么单独一个文件、不动 advice.ts：
 * 结算**不改建议**，它只回答「你做的和我说的一样吗」。把它放进规则引擎里，
 * 两条本来独立的判断会互相污染——而这是这个人身上真实发生过的教训
 * （2026-11-05 真机「中断第 62 天」：质量闸门和回归期共用了一个列表）。
 *
 * 三档判定的阈值来自 ROADMAP §2.2：一致 = 时长 ±20%；等价 = 强度对但量差一档。
 * 阈值是我按现有文档定的，没有数据校准过——所以文案不评判，只陈述差别。
 */

export type SettlementOutcome = 'matched' | 'equivalent' | 'deviated' | 'pending' | 'rested';

export interface Settlement {
  outcome: SettlementOutcome;
  /** 判断，≤ 12 字。 */
  headline: string;
  /** 事实对照：建议什么、你做了什么。 */
  detail: string;
  /** 下一步动作。 */
  next: string;
}

/** 「一致」的时长容差（ROADMAP §2.2）。 */
const MATCH_TOL = 0.2;
/** 「等价」的时长容差：强度对、量差一档。 */
const EQUIV_TOL = 0.5;

/** 处方时长是字符串（`45–75 分钟`、`0–20 分钟`），这里解析成区间。 */
export function parseDurationRange(text: string): { min: number; max: number } | undefined {
  const range = text.match(/(\d+)\s*[–\-~至]\s*(\d+)\s*分钟/);
  if (range) return { min: Number(range[1]), max: Number(range[2]) };
  const one = text.match(/(\d+)\s*分钟/);
  if (one) return { min: Number(one[1]), max: Number(one[1]) };
  return undefined;
}

/** 解析不出来时的兜底时长（分钟），按建议类型给一个中位数。 */
const FALLBACK_MIN: Record<Advice['kind'], number> = {
  unknown: 0,
  rest: 10,
  recovery: 20,
  aerobic: 60,
  intensity: 60,
};

function targetMinutes(advice: Advice): { min: number; max: number; mid: number } {
  const parsed = parseDurationRange(advice.duration);
  if (parsed) return { ...parsed, mid: (parsed.min + parsed.max) / 2 };
  const fallback = FALLBACK_MIN[advice.kind];
  return { min: fallback, max: fallback, mid: fallback };
}

const fmtMin = (min: number) => {
  const rounded = Math.round(min);
  return rounded >= 60 ? `${Math.floor(rounded / 60)} 小时 ${rounded % 60} 分` : `${rounded} 分钟`;
};

/** 这一天（按运动开始时间归属）的记录。可疑记录也算「动过」，只有负荷不算它。 */
export function activitiesOn(activities: Activity[], date: ISODate): Activity[] {
  return activities.filter((a) => toISODate(new Date(a.startTime)) === date);
}

/** 当天落库的那份建议（`advice_log`）：结算要对着**发出时**的建议对账，不是对着现在重算的。 */
export interface IssuedLog {
  kind: Advice['kind'];
  title: string;
  duration: string;
  zones: string;
}

/**
 * 取「当天发出的建议」。
 *
 * 为什么必须取旧的：训练一同步，`advice` 会立刻重算——今天的强度课算进近 7 天，
 * 强度课往往就变成「有氧」了。这时候拿新建议去对账，会出现
 * 「我按你说的上了强度，你却说我们不一致」。
 * 结算对的是**承诺**，所以认 `advice_log`；只有它还是一条空壳（`duration: '--'`）时才退回当前建议。
 */
export function issuedAdvice<T extends Advice>(advice: T, log?: IssuedLog): T {
  if (!log || log.duration === '--' || !log.kind) return advice;
  return { ...advice, kind: log.kind, title: log.title, duration: log.duration, zones: log.zones };
}

export function settle(advice: Advice, activities: Activity[], date: ISODate, action?: AdviceAction, note?: string): Settlement {
  const today = activitiesOn(activities, date);
  const actualMin = today.reduce((s, a) => s + a.durationS, 0) / 60;
  const actualHard = today.some(isHardSession);
  const target = targetMinutes(advice);

  // ── 没有训练记录：先认「你点了什么」，别把没同步当成没练 ──────────────
  if (!today.length) {
    if (action === 'skipped') {
      return { outcome: 'rested', headline: '今天按休息走', detail: '没看到训练记录，按你说的留空了。', next: '明天看恢复再定。' };
    }
    if (action === 'changed') {
      return {
        outcome: 'pending',
        headline: '记下了：改成了别的',
        detail: note ? `原本建议${advice.title}，你改成了${note}。` : `原本建议${advice.title}，你改成了别的。`,
        next: '练完同步上来，我再对一次。',
      };
    }
    return {
      outcome: 'pending',
      headline: '已记录',
      detail: `原本建议${advice.title}（${advice.duration}）。`,
      next: '等这次的记录同步上来，我再对一次。',
    };
  }

  const fact = `建议 ${advice.duration}｜你 ${fmtMin(actualMin)}${actualHard ? '，含强度' : ''}`;

  // ── 建议休息 / 回归期：只有「练多了」才算偏离 ──────────────────────
  // 这一段放在「点了不练」之前：休息日走了 15 分钟，不是违约。
  // 结算的作用是对账，不是抓人——先按记录的强度判，再谈按钮说了什么。
  if (advice.kind === 'rest' || advice.kind === 'recovery') {
    if (actualMin <= target.max) {
      return { outcome: 'matched', headline: '今天按恢复走，对', detail: fact, next: '明天看恢复再定。' };
    }
    if (!actualHard && actualMin <= target.max * 1.5) {
      return { outcome: 'equivalent', headline: '比建议的多一点，还行', detail: fact, next: '接下来：今天不用再补，明天按常规走。' };
    }
    return {
      outcome: 'deviated',
      headline: '今天练了，我原本建议收着',
      detail: fact,
      next: '接下来：明天先看恢复，别连着来第二次。',
    };
  }

  // 说了不练、记录里却有训练（且不是休息日能容下的量）：以记录为准，别用按钮覆盖事实。
  if (action === 'skipped') {
    return {
      outcome: 'deviated',
      headline: '记录里有训练',
      detail: `你点了今天不练，但同步到 ${fmtMin(actualMin)}${actualHard ? '，含强度' : ''}。我按记录算。`,
      next: actualHard ? '接下来：明天降一档，别再叠一次强度。' : '接下来：明天按常规走，不用补。',
    };
  }

  // ── 建议强度 / 有氧：先看强度档，再看量 ────────────────────────────
  const expectHard = advice.kind === 'intensity';
  const hardMatch = actualHard === expectHard;
  const ratio = target.mid > 0 ? actualMin / target.mid : 1;
  const off = Math.abs(ratio - 1);

  if (hardMatch && off <= MATCH_TOL) {
    return { outcome: 'matched', headline: '这次和计划基本一致', detail: fact, next: '接下来：今天不用再补，明天看恢复再定。' };
  }

  if ((hardMatch && off <= EQUIV_TOL) || (!hardMatch && off <= MATCH_TOL)) {
    return {
      outcome: 'equivalent',
      headline: hardMatch ? '方向和量对上了，细节有出入' : '量对上了，强度差一档',
      detail: fact,
      next: '接下来：不用补，明天按常规走。',
    };
  }

  const tooMuch = ratio > 1;
  return {
    outcome: 'deviated',
    headline: tooMuch ? '比我建议的重了' : '比我建议的轻了',
    detail: fact,
    next: tooMuch ? '接下来：明天降一档，别再叠一次强度。' : '接下来：明天看恢复，够了就按计划走。',
  };
}
