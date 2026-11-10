import { acwr, activityQuality, addDays, assessRecovery, detectAnomalies, fitnessSeries, fmtHM, toISODate, type Anomaly, type RecoveryAssessment } from './metrics.ts';
import type { Activity, Dataset, ISODate } from './types.ts';

export type AdviceKind = 'unknown' | 'rest' | 'recovery' | 'aerobic' | 'intensity';
export type Confidence = 'high' | 'medium' | 'low';
export type AdviceAction = 'followed' | 'changed' | 'skipped';

/** 日期内部用不断行空格，避免「3」和「日」被拆到两行。日期前面仍可换行。 */
const DATE_GAP = '\u00A0';

/** 旧标题里的「11月3日」补上空格，和新的「11 月 3 日」同一套。 */
export function spaceZhDates(text: string): string {
  return text
    .replace(/(\d{1,2})\s*月\s*(\d{1,2})\s*日/g, (_, month, day) => `${Number(month)} 月 ${Number(day)} 日`)
    .replace(/([^\s\d])(\d{1,2} 月 )/g, '$1 $2')
    .replace(/(\d{1,2}) 月 (\d{1,2}) 日/g, (_, month, day) => `${month}${DATE_GAP}月${DATE_GAP}${day}${DATE_GAP}日`);
}

/** 昨天那条依据：人话在前，建议原文在破折号后面，避免把标题嵌进句子中间。 */
export function yesterdaySentence(title: string, action?: AdviceAction, note?: string): string {
  const did = action === 'followed' ? '你照做了' : action === 'changed' ? `你改成了${note ?? '别的'}` : action === 'skipped' ? '你没练' : '你还没记';
  return `昨天的建议${did} —— ${spaceZhDates(title)}`;
}

export interface AdviceMemory {
  /** 不含今天，从旧到新。 */
  recentKinds: AdviceKind[];
  yesterdayAction?: AdviceAction;
  /** 回归期类型，按「大概多久能恢复」分档。缺省 major（21 天）——更保守。见 PRD §6.0。 */
  returnKind?: 'rest' | 'minor' | 'moderate' | 'major' | 'severe';
}

export interface Advice {
  kind: AdviceKind;
  title: string;
  duration: string;
  zones: string;
  reasons: string[];
  narrative: string;
  confidence: Confidence;
  conflicts?: string[];
  inputs: { recovery: RecoveryAssessment; acwr?: number; tsb?: number; hardSessions7d: number; anomalies: Anomaly[] };
}

const SLEEP_SHORT = 390;

export function isHardSession(a: Activity): boolean {
  if (a.anaerobicTE != null && a.anaerobicTE >= 3) return true;
  const z = a.hrZonesS;
  if (!z) return false;
  const total = z.reduce((s, x) => s + x, 0);
  return total > 0 && (z[3] + z[4]) / total >= 0.25;
}

function activityDate(a: Activity): ISODate {
  return toISODate(new Date(a.startTime));
}

function daysBetween(from: ISODate, to: ISODate): number {
  const a = new Date(`${from}T00:00:00`);
  const b = new Date(`${to}T00:00:00`);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/**
 * 回归期长度（天）。PRD §6.0：按「大概多久能恢复」分档，不再只分伤病/休息。
 *
 * 为什么改：原来的「伤病 21 天」是一个桶，感冒和骨应力性损伤都装在里面——
 * 等于把最严重的伤按最轻的处理，而那恰恰是这套规则要防的事故。
 */
const RETURN_DAYS = {
  rest: 10, // 没受伤，主动休息
  minor: 10, // 轻伤，3 天内能好
  moderate: 14, // 1–2 周
  major: 21, // 3–4 周（缺省：不知道就保守）
  severe: 42, // 更久
} as const;
export type ReturnKind = keyof typeof RETURN_DAYS;

/** 出关要的量：连续两个 7 天窗口都回到中断前的这个比例。 */
const RETURN_RATIO = 0.65;
/** 无异常放行：额外等几天、近 7 天至少练几次、量至少回到多少。 */
const RETURN_PASS_EXTRA_DAYS = 7;
const RETURN_PASS_MIN_SESSIONS = 3;
const RETURN_PASS_MIN_RATIO = 0.5;

/** 只有「主动休息」给 70% 起始量和 Z3 上限；其余按伤病处理。 */
const isRestKind = (k: ReturnKind): boolean => k === 'rest';

/**
 * 中断/回归期状态。PRD §6.0 的 P-1。
 *
 * - `gap`   ：已经中断 ≥7 天还没回来，仍在中断里
 * - `return`：刚从中断回来，处在回归期第 N 天
 */
interface ReturnState {
  phase: 'gap' | 'return';
  /** 造成这次回归期的那次中断有几天。 */
  gapDays: number;
  /** gap 阶段 = 已中断天数；return 阶段 = 回归期第几天（1 起）。 */
  daysIn: number;
  /** 中断前 4 周的周均训练时长，分钟。 */
  baseWeeklyMin: number;
}

function activityDates(activities: Activity[], date: ISODate): ISODate[] {
  return [...new Set(activities.filter((a) => activityDate(a) <= date).map(activityDate))].sort();
}

/** 中断前 4 周（28 天）的周均训练时长，分钟。 */
function baseWeeklyMinutes(activities: Activity[], before: ISODate): number {
  const from = addDays(before, -27);
  const seconds = activities
    .filter((a) => {
      const d = activityDate(a);
      return d >= from && d <= before;
    })
    .reduce((s, a) => s + a.durationS, 0);
  return seconds / 60 / 4;
}

/**
 * 判断当前是否处在「中断 / 回归期」。
 *
 * 为什么需要这个状态：休息越久，风险指标越归零、许可指标越拉满，
 * 「伤退」和「状态极佳」在 P0–P4 的输入上长得一模一样。调参修不好，
 * 只能靠一个时序状态把这两种情况分开。见 PRD §6.0。
 */
function returnState(
  activities: Activity[],
  date: ISODate,
  kind: ReturnKind = 'major',
  hasAnomaly = false,
): ReturnState | undefined {
  const dates = activityDates(activities, date);
  if (!dates.length) return undefined;

  const last = dates[dates.length - 1];
  const gapNow = daysBetween(last, date);

  // 还在中断里，没有回来。
  if (gapNow >= 7) {
    return {
      phase: 'gap',
      gapDays: gapNow,
      daysIn: gapNow,
      baseWeeklyMin: baseWeeklyMinutes(activities, last),
    };
  }

  // 已经回来：找当前这段训练块的起点。
  let i = dates.length - 1;
  while (i > 0 && daysBetween(dates[i - 1], dates[i]) < 7) i -= 1;
  if (i === 0) return undefined; // 历史上没有 ≥7 天的中断，不在回归期

  const gapDays = daysBetween(dates[i - 1], dates[i]);
  const start = dates[i];
  const daysIn = daysBetween(start, date) + 1;
  const baseWeeklyMin = baseWeeklyMinutes(activities, dates[i - 1]);
  const limit = RETURN_DAYS[kind];

  // 退出条件：天数够了 **并且** 量回来了，两个都要满足。
  // 只看天数会出问题——真实数据里他回归期第 22 天还只跑 3 km，
  // 周量不到中断前的三成，那时候「出关」等于放任他加量。
  const minutesIn = (from: ISODate, to: ISODate) =>
    activities
      .filter((a) => {
        const d = activityDate(a);
        return d > from && d <= to;
      })
      .reduce((s, a) => s + a.durationS, 0) / 60;
  // 连续两个 7 天窗口都要达标：单窗口会被休息日或一周的偶然波动影响，
  // 而 28 天窗口在 21 天的回归期内数学上不可能满足。
  const recent7Min = minutesIn(addDays(date, -7), date);
  const prev7Min = minutesIn(addDays(date, -14), addDays(date, -8));
  const ratio7 = baseWeeklyMin > 0 ? recent7Min / baseWeeklyMin : 0;
  const ratioPrev7 = baseWeeklyMin > 0 ? prev7Min / baseWeeklyMin : 0;
  const count7 = activities.filter((a) => {
    const d = activityDate(a);
    return d > addDays(date, -7) && d <= date;
  }).length;

  // A 量回来了：连续两个 7 天窗口都到 65%
  if (daysIn > limit && ratio7 >= RETURN_RATIO && ratioPrev7 >= RETURN_RATIO) return undefined;

  // B 无异常放行：天数再宽限 7 天、没有异常信号、而且确实在练（≥3 次、量 ≥50%）。
  // 加「确实在练」这条，是因为躺一个月的人也没有异常信号——那样放行等于什么都没防。
  if (
    daysIn > limit + RETURN_PASS_EXTRA_DAYS &&
    !hasAnomaly &&
    count7 >= RETURN_PASS_MIN_SESSIONS &&
    ratio7 >= RETURN_PASS_MIN_RATIO
  ) {
    return undefined;
  }

  // C 兜底：量一直回不来也不能永远卡在回归期，2 倍时长后放行。
  if (daysIn > limit * 2) return undefined;

  return { phase: 'return', gapDays, daysIn, baseWeeklyMin };
}

export function dailyAdvice(data: Dataset, date: ISODate, memory?: AdviceMemory): Advice {
  const recovery = assessRecovery(data.sleep, date);
  const anomalies = detectAnomalies(data.daily, data.sleep, date);
  // 数据质量闸门（PRD §6.2）：可疑记录不进负荷计算。否则它会污染分母，
  // 再被规则放大成一个错误的决定。
  const usable = data.activities.filter((a) => activityQuality(a) === 'ok');
  // 只有带负荷的记录能进负荷计算；但「有没有练过」看全部记录。
  const withLoad = usable.filter((a) => a.trainingLoad > 0);
  const in28 = data.activities.filter((a) => {
    const d = activityDate(a);
    return d >= addDays(date, -27) && d <= date;
  });
  const suspect28d = in28.filter((a) => activityQuality(a) === 'suspect').length;
  const noLoad28d = in28.filter((a) => activityQuality(a) === 'ok' && a.trainingLoad <= 0).length;
  const badQuality = in28.length > 0 && (suspect28d + noLoad28d) / in28.length > 0.3;
  const ratio = acwr(withLoad, date, data.loads);
  const series = fitnessSeries(withLoad, addDays(date, -120), date, data.loads);
  const tsb = series.at(-1)?.tsb;
  const windowStart = addDays(date, -6);
  const hardSessions7d = usable.filter((a) => {
    const d = activityDate(a);
    return d >= windowStart && d <= date && isHardSession(a);
  }).length;
  const inputs = { recovery, acwr: ratio, tsb, hardSessions7d, anomalies };
  const fmt = (x?: number, digits = 2) => (x == null ? '--' : x.toFixed(digits));
  const recentSleep = data.sleep.filter((s) => s.date >= windowStart && s.date <= date && (s.totalMin > 0 || s.hrv != null)).length;
  const hasLoad = ratio != null;
  const missingSleep = recentSleep < 3;
  // 今夜（起床日 = 今天）这一晚的数据。PRD §6.3 补丁：
  // 近 7 天有数据不代表今天有——原来的 missingSleep 只看近 7 天，从不看今天。
  const tonight = data.sleep.find((s) => s.date === date);
  const hasTonightSleep = !!tonight && tonight.totalMin > 0;
  const hasTonightHrv = tonight?.hrv != null;
  const priorNight = [...data.sleep].filter((s) => s.date < date && (s.totalMin > 0 || s.hrv != null)).at(-1);
  const priorLabel = priorNight ? `${Number(priorNight.date.slice(5, 7))} 月 ${Number(priorNight.date.slice(8, 10))} 日` : '';
  const lastHard = data.activities
    .filter((a) => isHardSession(a) && activityDate(a) <= date)
    .map(activityDate)
    .sort()
    .at(-1);
  const sinceHard = lastHard ? daysBetween(lastHard, date) : Number.POSITIVE_INFINITY;
  const hardYesterday = data.activities.some((a) => isHardSession(a) && activityDate(a) === addDays(date, -1));
  const returnKind: ReturnKind = memory?.returnKind ?? 'major';
  // 训练证据 ≠ 负荷质量：一条可疑记录也算「那天动过」。
  const ret = returnState(data.activities, date, returnKind, anomalies.length > 0);
  const activityDays = activityDates(data.activities, date);
  const gapNow = activityDays.length ? daysBetween(activityDays[activityDays.length - 1], date) : Number.POSITIVE_INFINITY;

  const finish = (advice: Omit<Advice, 'confidence' | 'conflicts'>, confidence: Confidence, conflicts?: string[]): Advice => {
    let next: Advice = { ...advice, confidence, conflicts };
    const yesterdayKind = memory?.recentKinds.at(-1);
    const skippedIntensity = yesterdayKind === 'intensity' && memory?.yesterdayAction !== 'followed' && memory?.yesterdayAction !== 'changed' && !hardYesterday;
    if (skippedIntensity && next.kind === 'intensity') {
      next = {
        ...next,
        kind: 'aerobic',
        title: '今天不追强度',
        duration: '45–75 分钟',
        zones: 'Z2 为主',
        narrative: '昨天建议上强度，你没练。今天不追，按有氧走。想上的话留到后天。',
        confidence: 'medium',
      };
    }
    // 冲突矩阵（PRD §5.1）：一条矛盾 → medium + 常规有氧；
    // 两条以上 → low + 缩短处方。矛盾越多，处方越保守。
    if (conflicts?.length && next.kind === 'intensity') {
      next = {
        ...next,
        kind: 'aerobic',
        title: '今天按有氧走',
        duration: '45–75 分钟',
        zones: 'Z2 为主',
        narrative: `${conflicts[0]} 这条我拿不准，建议按有氧走。`,
        confidence: 'medium',
        conflicts,
      };
    }
    // 冲突矩阵（PRD §5.1）：两条以上依据互相打架 → 不管落在哪个分支，
    // 都降到 low，并把打架的内容写出来。矛盾越多，话说得越软。
    if (conflicts && conflicts.length >= 2) {
      next = {
        ...next,
        confidence: 'low',
        narrative: `${next.narrative}（但${conflicts.join('；')}——这几条互相打架，今天我按保守的走。）`,
      };
    }
    // PRD §6.3：今天这一晚没有睡眠记录 → 不出强度课，且说清是缺哪一项。
    // 放在通用的「把握低」降档前面，好让文案具体。
    if (!hasTonightSleep && next.kind === 'intensity') {
      next = {
        ...next,
        kind: 'aerobic',
        title: priorLabel ? `昨夜没数据，最近是${priorLabel}，今天先按有氧` : '昨夜没数据，今天先按有氧',
        duration: '45–75 分钟',
        zones: 'Z2 为主',
        narrative: '昨晚的睡眠没同步上来，我不给强度课。想动就 Z2，别顶阈值。',
      };
    }
    if (next.confidence === 'low' && next.kind === 'intensity') {
      next = {
        ...next,
        kind: 'aerobic',
        title: '今天先按有氧',
        duration: '45–75 分钟',
        zones: 'Z2 为主',
        narrative: '关键数据不全，今天不给强度课。想动就 Z2，别顶阈值。',
      };
    }
    // PRD §6.0：中断 4–6 天必须强制降一档，不能只在依据区加一句话。
    // 真实数据里 09-25（停 3 天）、09-28（停 6 天）都曾被建议上强度课。
    if (gapNow >= 4 && gapNow <= 6 && next.kind === 'intensity') {
      next = {
        ...next,
        kind: 'aerobic',
        title: '停过几天，今天降一档',
        duration: '45–75 分钟',
        zones: 'Z2 为主',
        narrative: `你停了 ${gapNow} 天。今天先不追强度，按 Z2 走，强度课留到后天。`,
      };
    }
    const prior = memory?.recentKinds ?? [];
    if (prior.length >= 2 && prior.at(-1) === next.kind && prior.at(-2) === next.kind) {
      next = { ...next, narrative: `${next.narrative} 连续几天都是这个判断。` };
    }
    return next;
  };

  if (missingSleep && !hasLoad) {
    return {
      kind: 'unknown',
      title: '先认识你的基线',
      duration: '--',
      zones: '这 7 天先不给处方',
      reasons: ['睡眠和负荷都还不够'],
      narrative: '数据已连上的话，接下来 7 天我先看基线，再判断你今天的状态。',
      confidence: 'low',
      inputs,
    };
  }

  // ── P-1 回归期（PRD §6.0）────────────────────────────────────────────
  // 优先级高于 P0–P4。中断 ≥7 天时，风险指标全归零、许可指标全拉满，
  // 和「状态极佳」无法区分——只能靠这个状态拦住。
  if (ret) {
    const limit = RETURN_DAYS[returnKind];
    const base = ret.baseWeeklyMin;
    const startRatio = isRestKind(returnKind) ? 0.7 : 0.5;
    const baseWeek = Math.round(base * startRatio);

    if (ret.phase === 'gap') {
      return finish(
        {
          kind: 'recovery',
          title: '先别急着回来',
          duration: '0–20 分钟',
          zones: 'Z1，能说话就行',
          reasons: [
            `已经中断 ${ret.daysIn} 天`,
            `回来那天起算回归期，前 ${limit} 天不上强度`,
            `中断前周均 ${Math.round(base)} 分钟，回来第一周最多 ${baseWeek} 分钟`,
          ],
          narrative: `中断第 ${ret.daysIn} 天。先在中断里养好，别用训练去"试试还行不行"。等你回来那天起算回归期，第一周只做中断前一半的量。`,
          inputs,
        },
        'low',
      );
    }

    const week = Math.min(2, Math.floor((ret.daysIn - 1) / 7));
    const cap = ['20–30 分钟', '30–40 分钟', '40–50 分钟'][week];
    const zones = isRestKind(returnKind)
      ? week >= 2
        ? 'Z2 为主，状态好可以碰一下 Z3'
        : 'Z1–Z2'
      : week === 0
        ? 'Z1–Z2，别碰阈值'
        : 'Z2 为主，先不碰阈值';
    const weeklyCap = Math.max(20, Math.round(base * startRatio * Math.pow(1.15, week)));

    return finish(
      {
        kind: 'recovery',
        title: `回归期第 ${ret.daysIn} 天`,
        duration: cap,
        zones,
        reasons: [
          `中断了 ${ret.gapDays} 天`,
          `回归期第 ${ret.daysIn} 天 / 共 ${limit} 天`,
          `这周总时长上限 ${weeklyCap} 分钟，每周最多加 15%`,
          `中断前周均 ${Math.round(base)} 分钟`,
        ],
        narrative: `回归期第 ${ret.daysIn} 天 —— 今天 ${cap}，${zones}。别急着回到中断前的量，这周总时长上限 ${weeklyCap} 分钟。`,
        inputs,
      },
      'low',
    );
  }

  const deviceRecovery = tonight?.recovery;
  const gaps = [
    missingSleep ? '睡眠样本还不够 —— 近 7 天不到 3 晚，今天不下结论' : '',
    !hasTonightSleep
      ? `昨夜没有睡眠记录 —— ${priorLabel ? `最近一条是 ${priorLabel}，` : ''}缺的是这一晚，不拿更早的数当今夜`
      : '',
    !hasLoad ? '还没有训练负荷 —— 近 28 天算不出负荷比，今天不谈加量' : '',
    badQuality ? `近 28 天有 ${suspect28d + noLoad28d} 条记录对不上 —— 缺负荷或不可信，没有算进负荷` : '',
  ].filter(Boolean);
  let confidence: Confidence = gaps.length ? 'low' : 'high';
  // 有睡眠但没 HRV：基线可用就还能判断，降一档到 medium，不给 high。
  if (confidence === 'high' && !hasTonightHrv) confidence = 'medium';
  const sleepMin = recovery.sleepMin;
  const conflicts: string[] = [];
  if (recovery.hrv.trend !== 'down' && sleepMin != null && sleepMin > 0 && sleepMin < SLEEP_SHORT) {
    conflicts.push(`HRV 不差，但只睡了 ${fmtHM(sleepMin)}`);
  }
  if (anomalies.length && recovery.hrv.trend !== 'down') {
    conflicts.push('压力或静息心率在偏离，HRV 仍在基线内');
  }
  if (conflicts.length && confidence === 'high') confidence = 'medium';
  // 两条以上证据互相打架 → 不是「拿不准」，是「证据不足」，降到 low。
  if (conflicts.length >= 2) confidence = 'low';

  const hrvCrash = recovery.hrv.trend === 'down' && (sleepMin ?? 0) < SLEEP_SHORT;
  if (anomalies.length || hrvCrash || recovery.level === 'poor') {
    const reasons = [...anomalies.map((a) => a.message), ...recovery.reasons, ...gaps];
    return finish({
      kind: 'rest',
      title: '今天别上强度',
      duration: '0–20 分钟',
      zones: '想动就散步，保持能说话',
      reasons,
      narrative: '想动就 20 分钟散步，别超过轻松说话的程度。',
      inputs,
    }, confidence, conflicts.length ? conflicts : undefined);
  }

  if ((ratio != null && ratio > 1.5) || (tsb != null && tsb < -30)) {
    const reasons = [
      ...gaps,
      ratio != null && ratio > 1.5 ? `这周加量偏猛 —— 负荷比 ${fmt(ratio)}，超过 1.5，今天别再跑` : '',
      tsb != null && tsb < -30 ? `疲劳还欠着 —— 状态值 ${fmt(tsb, 0)}，低于 −30，先把账还上` : '',
    ].filter(Boolean);
    return finish({
      kind: 'rest',
      title: '今天别跑',
      duration: '0–30 分钟',
      zones: '休息，或 Z1 交叉，不要再跑',
      reasons,
      narrative: '最近负荷偏高，今天别再加跑步。想动就 30 分钟以内的 Z1，骑车或走路都行。',
      inputs,
    }, confidence, conflicts);
  }

  const intensityOk = recovery.level === 'good' && hardSessions7d <= 1 && (tsb == null || tsb > -10) && sinceHard >= 2;
  if (intensityOk) {
    const sinceHardText = Number.isFinite(sinceHard) ? `${sinceHard} 天前上过` : '近期没有记录';
    const reasons = [
      ...gaps,
      deviceRecovery != null ? `身体还有余量 —— 恢复分 ${deviceRecovery}，手表给的是这一晚` : '',
      `离上次强度隔开了 —— ${sinceHardText}`,
      tsb != null ? `疲劳没欠账 —— 状态值 ${fmt(tsb, 0)}，没有欠到要停的地步` : '',
    ].filter(Boolean);
    return finish({
      kind: 'intensity',
      title: '可以上强度',
      duration: '50–70 分钟（含热身放松）',
      zones: '主课 Z4 或 Z5',
      reasons,
      narrative: '恢复够，近期强度也不密。主课放在 Z4 或 Z5，热身和放松算在时长里。',
      inputs,
    }, confidence, conflicts);
  }

  const reasons = [
    ...gaps,
    deviceRecovery != null
      ? `今天走有氧 —— 恢复分 ${deviceRecovery}，手表给的是这一晚，先不上强度`
      : '今天走有氧 —— 这一晚没有手表给的恢复分，先不上强度',
    ratio != null ? `负荷还在可控范围 —— 负荷比 ${fmt(ratio)}，安全区到 1.5` : '',
    `这周的强度课 —— 近 7 天 ${hardSessions7d} 次，今天不再加`,
    ...recovery.reasons,
  ].filter(Boolean);
  return finish({
    kind: 'aerobic',
    title: '今天练有氧',
    duration: '45–75 分钟',
    zones: 'Z2 为主',
    reasons,
    narrative: hardSessions7d >= 2 || sinceHard < 2
      ? '这几天强度够了。今天 Z2，别再顶阈值。'
      : '状态中规中矩。今天一节稳定的 Z2，给下一次强度留力气。',
    inputs,
  }, confidence, conflicts);
}

/** 五档在界面上的中文说法。顺序即建议的展示顺序。 */
export const RETURN_KIND_LABEL: Record<ReturnKind, string> = {
  rest: '没受伤，只是主动休息',
  minor: '轻伤，3 天内能好',
  moderate: '1–2 周',
  major: '3–4 周',
  severe: '更久（骨性、术后等）',
};

export const RETURN_KIND_ORDER: ReturnKind[] = ['rest', 'minor', 'moderate', 'major', 'severe'];

export interface ReturnPrompt {
  /** 是否该问用户「大概多久能恢复」。 */
  ask: boolean;
  /** 这次中断是从哪一天（最后一次训练）开始的，用来判断「问过没有」。 */
  since?: ISODate;
  /** 已经中断了几天。 */
  gapDays?: number;
}

/**
 * 回归期「问一次」的入口判定（PRD §6.0）。
 *
 * 为什么要单独一个函数：`returnKind` 写进引擎很久了，但界面从来没问过，
 * 永远走默认值——**测试全绿，功能不存在**。把「该不该问」抽成纯函数，
 * 才能被测试盯住。
 *
 * 规则：
 * - 距上次训练 < 7 天：不进入中断，不问。
 * - ≥ 7 天且这次中断没回答过：问。
 * - 已经回答过（`answeredFor` 等于这次中断的起始日）：不再问。
 * - 复训之后又中断：起始日变了，会再问一次。
 */
export function returnKindPrompt(
  activities: Activity[],
  date: ISODate,
  answeredFor?: string,
): ReturnPrompt {
  const dates = activityDates(activities, date);
  if (!dates.length) return { ask: false };
  const since = dates[dates.length - 1];
  const gapDays = daysBetween(since, date);
  if (gapDays < 7) return { ask: false };
  if (answeredFor === since) return { ask: false };
  return { ask: true, since, gapDays };
}
