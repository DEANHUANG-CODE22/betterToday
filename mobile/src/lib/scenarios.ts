import type { AdviceKind, Confidence } from './advice.ts';
import { addDays, toISODate } from './metrics.ts';
import type { Activity, DailyHealth, Dataset, ISODate, SleepNight, SportType, TrainingLoadDay } from './types.ts';

/**
 * 演练场景（正式包里的「演练模式」）。
 *
 * 为什么要有：38 条单测守住了纯函数，全周期回放守住了真实数据，
 * 但「真机上从数据库到卡片文案」这一整条链没有人守。以前只能靠装到手机上碰运气，
 * 而碰运气的结果是：0.1.12 之前「中断第 62 天」这种错，单测全绿、回放也看不出来。
 *
 * 每个场景都带 `expect`：这是 PRD 的**应该**，不是代码的现状。
 * 如果哪个场景红了，先怀疑代码——`scenarios.test.ts` 就是拿它当验收的。
 */

export interface Scenario {
  id: string;
  title: string;
  /** 这个场景想验什么。 */
  why: string;
  expect: { kind: AdviceKind; confidence: Confidence };
  dataset: Dataset;
}

interface Plan {
  minutes: number;
  hard?: boolean;
  sport?: SportType;
  load?: number;
  /** 覆盖距离（用来造配速离谱的记录）。 */
  distanceM?: number;
  avgHr?: number;
}

interface Blueprint {
  days?: number;
  /** i = 距今天几天（0 = 今天）；返回 null 表示这天不训练。 */
  train: (i: number) => Plan | null;
  /** 昨夜：'none' 表示整晚没有记录；hrv: 'none' 表示有睡眠但没有 HRV。只有 i === 0 用得上。 */
  tonight?: 'none' | { totalMin?: number; hrv?: number | 'none'; recovery?: number; rhr?: number };
  loads?: TrainingLoadDay[];
  /** 额外塞的记录（用来造可疑数据）。 */
  extra?: (today: ISODate) => Activity[];
  /** 近 3 天压力偏高，用来触发「异常信号」。 */
  stressSpike?: boolean;
}

const BASE_SLEEP = { totalMin: 450, hrv: 62, recovery: 82, rhr: 46 };

function night(date: ISODate, o: { totalMin?: number; hrv?: number | 'none'; recovery?: number; rhr?: number }): SleepNight {
  const totalMin = o.totalMin ?? BASE_SLEEP.totalMin;
  return {
    date,
    bedtime: `${addDays(date, -1)}T23:00:00`,
    wakeTime: `${date}T07:00:00`,
    totalMin,
    deepMin: Math.round(totalMin * 0.2),
    lightMin: Math.round(totalMin * 0.6),
    remMin: Math.round(totalMin * 0.17),
    awakeMin: 12,
    hrv: o.hrv === 'none' ? undefined : o.hrv ?? BASE_SLEEP.hrv,
    restingHr: o.rhr ?? BASE_SLEEP.rhr,
    recovery: o.recovery,
  };
}

function activity(today: ISODate, i: number, p: Plan): Activity {
  const date = addDays(today, -i);
  const distanceM = p.distanceM ?? (p.sport === 'strength' ? 0 : p.minutes * 200); // 5:00/km
  return {
    id: `s-${i}-${p.minutes}`,
    startTime: `${date}T07:00:00`,
    sport: p.sport ?? 'run',
    name: p.sport === 'strength' ? '力量' : p.hard ? '阈值跑' : '有氧跑',
    distanceM,
    durationS: p.minutes * 60,
    avgHr: p.avgHr ?? (p.hard ? 170 : 135),
    maxHr: p.hard ? 182 : 148,
    trainingLoad: p.load ?? p.minutes,
    aerobicTE: p.hard ? 4.2 : 2.6,
    anaerobicTE: p.hard ? 4 : 1,
  };
}

function build(today: ISODate, bp: Blueprint): Dataset {
  const days = bp.days ?? 70;
  const sleep: SleepNight[] = [];
  const daily: DailyHealth[] = [];
  const activities: Activity[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(today, -i);
    const tonight = i === 0 ? bp.tonight : undefined;
    if (tonight !== 'none') {
      sleep.push(night(date, tonight ?? BASE_SLEEP));
    }
    const stress = bp.stressSpike && i <= 2 ? 62 : 24;
    daily.push({ date, steps: 9000, activeKcal: 520, restingHr: 46, stress, spo2: 97 });

    if (i === 0) continue; // 今天还没练
    const plan = bp.train(i);
    if (plan) activities.push(activity(today, i, plan));
  }

  return { sleep, daily, activities, ability: [], loads: bp.loads, ...(bp.extra ? { activities: [...activities, ...bp.extra(today)] } : {}) };
}

/** 常规节奏：隔天一次有氧 45 分钟，6 天前上过一次强度。 */
const normal = (i: number): Plan | null => {
  if (i === 6) return { minutes: 60, hard: true, load: 80 };
  if (i % 2 === 1) return { minutes: 45, load: 55 };
  return null;
};

/** 正常节奏 + 官方负荷评估（把 ACWR / TSB 钉死在可控值上）。 */
const officialLoads = (today: ISODate, ratio: number, shortTerm: number, longTerm: number): TrainingLoadDay[] => [
  { date: addDays(today, -1), ratio, shortTerm, longTerm },
  { date: today, ratio, shortTerm, longTerm },
];

const OK_LOADS = (today: ISODate) => officialLoads(today, 0.67, 40, 60); // TSB +20，负荷比 0.67
const SPIKE_LOADS = (today: ISODate) => officialLoads(today, 1.82, 92, 50); // TSB −42，负荷比超 1.5

export function buildScenarios(today: ISODate = toISODate(new Date())): Scenario[] {
  const noTrain = () => null;

  return [
    {
      id: 'intensity',
      title: '一切正常 · 该上强度',
      why: '恢复够、近 7 天只上过 1 次强度、TSB 为正 → 强度课，把握高',
      expect: { kind: 'intensity', confidence: 'high' },
      dataset: build(today, { train: normal, loads: OK_LOADS(today) }),
    },
    {
      id: 'poor-recovery',
      title: '恢复差 · 今天别上强度',
      why: '设备给的恢复 30 分 → 休息，且不因为「数据齐全」给高把握',
      expect: { kind: 'rest', confidence: 'high' },
      dataset: build(today, { train: normal, loads: OK_LOADS(today), tonight: { recovery: 30 } }),
    },
    {
      id: 'no-sleep-tonight',
      title: '昨夜没同步 · 不给强度',
      why: '今夜无睡眠 → 降成有氧 + 把握低（验收 K）',
      expect: { kind: 'aerobic', confidence: 'low' },
      dataset: build(today, { train: normal, loads: OK_LOADS(today), tonight: 'none' }),
    },
    {
      id: 'no-hrv-tonight',
      title: '只有睡眠没有 HRV · 把握中',
      why: '今夜有睡眠但没有 HRV → 最高 medium，仍可给强度课',
      expect: { kind: 'intensity', confidence: 'medium' },
      dataset: build(today, { train: normal, loads: OK_LOADS(today), tonight: { totalMin: 455, hrv: 'none' } }),
    },
    {
      id: 'gap-5-days',
      title: '中断 5 天 · 强制降档',
      why: '中断 4–6 天不进回归期，但强度课必须降成有氧（09-25 的真实教训）',
      expect: { kind: 'aerobic', confidence: 'high' },
      dataset: build(today, { train: (i) => (i >= 5 ? normal(i) : null), loads: OK_LOADS(today) }),
    },
    {
      id: 'gap-9-days',
      title: '中断 9 天 · 还在中断里',
      why: '≥7 天进入 P-1 gap 阶段：recovery + low，文案写「中断第 9 天」',
      expect: { kind: 'recovery', confidence: 'low' },
      dataset: build(today, { train: (i) => (i >= 9 ? normal(i) : null), loads: OK_LOADS(today) }),
    },
    {
      id: 'return-day-3',
      title: '回归期第 3 天',
      why: '中断后刚回来 3 天：仍按回归期走，不给强度课',
      expect: { kind: 'recovery', confidence: 'low' },
      dataset: build(today, {
        train: (i) => {
          if (i === 2) return { minutes: 30, load: 35 }; // 复训第一天
          if (i > 2 && i < 13) return null; // 之前断了 11 天
          return normal(i);
        },
        loads: OK_LOADS(today),
      }),
    },
    {
      id: 'conflicts-two',
      title: '两条依据打架 · 把握拉低',
      why: '睡眠 5 小时 + 压力连续 3 天偏离 → 两条矛盾 → low，文案写出打架的内容',
      expect: { kind: 'rest', confidence: 'low' },
      dataset: build(today, { train: normal, loads: OK_LOADS(today), tonight: { totalMin: 300 }, stressSpike: true }),
    },
    {
      id: 'load-spike',
      title: '负荷暴增 · 今天别跑',
      why: '负荷比 1.82、TSB −42 → 休息（P2），不是「恢复跑」',
      expect: { kind: 'rest', confidence: 'high' },
      dataset: build(today, { train: normal, loads: SPIKE_LOADS(today) }),
    },
    {
      id: 'bad-records',
      title: '数据可疑 · 把握降级',
      why: '近 28 天可疑记录 > 30% → 把握 low，且强度课降成有氧（验收 L）',
      expect: { kind: 'aerobic', confidence: 'low' },
      dataset: build(today, {
        train: (i) => ([2, 8, 14, 20].includes(i) ? normal(i) : null),
        loads: OK_LOADS(today),
        extra: (d) => [
          { id: 'bad-1', startTime: `${addDays(d, -1)}T07:00:00`, sport: 'run', name: '跑', distanceM: 100, durationS: 1 * 60, trainingLoad: 2 },
          { id: 'bad-2', startTime: `${addDays(d, -3)}T07:00:00`, sport: 'run', name: '跑', distanceM: 8000, durationS: 3000, avgHr: 20, trainingLoad: 50 },
          { id: 'bad-3', startTime: `${addDays(d, -5)}T07:00:00`, sport: 'run', name: '跑', distanceM: 30000, durationS: 3600, avgHr: 140, trainingLoad: 60 },
        ],
      }),
    },
  ];
}
