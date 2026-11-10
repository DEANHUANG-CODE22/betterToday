import { addDays, toISODate } from './metrics.ts';
import type { Ability, Activity, Dataset, DailyHealth, ISODate, Lap, Sample, SleepNight, SportType, StressSample } from './types.ts';

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

type Plan = { sport: SportType; name: string; km: number; pace: number; hr: number; hard: boolean } | null;

const WEEK: Plan[] = [
  null,
  { sport: 'run', name: '轻松跑', km: 8, pace: 345, hr: 138, hard: false },
  { sport: 'run', name: '阈值跑 3×10min', km: 12, pace: 290, hr: 160, hard: true },
  { sport: 'strength', name: '力量训练', km: 0, pace: 0, hr: 110, hard: false },
  { sport: 'run', name: '有氧跑', km: 10, pace: 330, hr: 145, hard: false },
  { sport: 'run', name: '间歇 6×800m', km: 10, pace: 300, hr: 158, hard: true },
  { sport: 'trail', name: '越野长距离', km: 22, pace: 420, hr: 142, hard: false },
];

/** 醒着的时段每 5 分钟一个点，午间留一段空档。心率不造，和真账号一样不画出心率线。 */
function mockStressSeries(date: ISODate, level: number, r: () => number): StressSample[] {
  const [y, m, d] = date.split('-').map(Number);
  const points: StressSample[] = [];
  for (let minute = 7 * 60; minute <= 22 * 60; minute += 5) {
    if (minute >= 12 * 60 && minute < 13 * 60) continue;
    const wave = Math.sin(minute / 70) * 8 + (r() - 0.5) * 6;
    const t = Math.floor(new Date(y, m - 1, d, 0, minute).getTime() / 1000);
    points.push({ t, stress: Math.max(0, Math.min(100, Math.round(level + wave))) });
  }
  return points;
}

export function mockDataset(today: ISODate = toISODate(new Date()), days = 90): Dataset {
  const r = rng(42);
  const sleep: SleepNight[] = [];
  const daily: DailyHealth[] = [];
  const activities: Activity[] = [];
  const ability: Ability[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(today, -i);
    const [y, m, d] = date.split('-').map(Number);
    const dow = new Date(y, m - 1, d).getDay();
    const fatigue = i < 4 ? 1 : 0; // 最近几天制造轻微疲劳，便于演示
    const total = Math.round(400 + r() * 90 - fatigue * 25);
    const deep = Math.round(total * (0.16 + r() * 0.06));
    const rem = Math.round(total * (0.2 + r() * 0.05));
    const bed = new Date(y, m - 1, d - 1, 23, Math.round(r() * 50));
    const awake = Math.round(10 + r() * 25);
    const hrv = Math.round(56 + r() * 10 - fatigue * 6);
    const restingHr = Math.round(45 + r() * 3 + fatigue * 2);
    sleep.push({
      date,
      bedtime: bed.toISOString(),
      wakeTime: new Date(bed.getTime() + (total + awake) * 60_000).toISOString(),
      totalMin: total,
      deepMin: deep,
      remMin: rem,
      lightMin: total - deep - rem,
      awakeMin: awake,
      hrv,
      hrvLow: i === 0 ? hrv - 30 : hrv - 12,
      hrvHigh: i === 0 ? hrv - 4 : hrv + 12,
      hrvBaseline: 55,
      restingHr,
    });
    const stress = Math.round(20 + r() * 20 + fatigue * 8);
    daily.push({
      date,
      steps: Math.round(7000 + r() * 8000),
      activeKcal: Math.round(400 + r() * 500),
      restingHr: Math.round(45 + r() * 3 + fatigue * 2),
      stress,
      spo2: Math.round(96 + r() * 3),
      stressSeries: mockStressSeries(date, stress, r),
    });

    const plan = WEEK[dow];
    if (plan && r() > 0.1 && i > 0) {
      const km = plan.km * (0.9 + r() * 0.2);
      const durationS = plan.sport === 'strength' ? 2700 : Math.round(km * plan.pace * (0.97 + r() * 0.06));
      const start = new Date(y, m - 1, d, 6, 30 + Math.round(r() * 30));
      const samples: Sample[] = [];
      for (let t = 0; t <= durationS; t += 30) {
        const phase = t / durationS;
        const warm = Math.min(1, phase * 8);
        const interval = plan.hard && phase > 0.2 && phase < 0.8 ? (Math.sin(phase * 40) > 0 ? 1 : 0) : 0;
        samples.push({
          t,
          hr: Math.round(plan.hr - 20 + 20 * warm + interval * 12 + r() * 4),
          paceSecPerKm: plan.pace ? Math.round(plan.pace + 20 * (1 - warm) - interval * 25 + r() * 8) : undefined,
          cadence: plan.pace ? Math.round(172 + interval * 8 + r() * 4) : undefined,
        });
      }
      const laps: Lap[] = [];
      for (let k = 0; k < Math.floor(km); k++) {
        laps.push({ index: k + 1, distanceM: 1000, durationS: Math.round(plan.pace * (0.95 + r() * 0.1)), avgHr: Math.round(plan.hr + r() * 6 - 3), avgCadence: Math.round(174 + r() * 6) });
      }
      const z = plan.hard ? [0.1, 0.25, 0.25, 0.28, 0.12] : [0.15, 0.55, 0.25, 0.05, 0];
      const load = Math.round((durationS / 60) * (plan.hard ? 1.6 : 1.0) * (0.9 + r() * 0.2));
      activities.push({
        id: `mock-${date}`,
        startTime: start.toISOString(),
        sport: plan.sport,
        name: plan.name,
        distanceM: plan.sport === 'strength' ? 0 : Math.round(km * 1000),
        durationS,
        avgHr: plan.hr,
        maxHr: plan.hr + (plan.hard ? 20 : 12),
        avgCadence: plan.pace ? 176 : undefined,
        elevGainM: plan.sport === 'trail' ? Math.round(600 + r() * 600) : Math.round(r() * 80),
        trainingLoad: load,
        aerobicTE: Number((2.5 + r() * 1.5).toFixed(1)),
        anaerobicTE: Number((plan.hard ? 3 + r() : r() * 1.5).toFixed(1)),
        hrZonesS: z.map((p) => Math.round(p * durationS)) as Activity['hrZonesS'],
        laps,
        samples,
      });
    }

    if (i % 7 === 0) {
      const p = (days - i) / days;
      const vo2 = 52 + p * 2;
      const marathon = Math.round(3 * 3600 + 25 * 60 - p * 360);
      ability.push({
        date,
        vo2max: Number(vo2.toFixed(1)),
        lthr: 168,
        thresholdPaceSecPerKm: Math.round(262 - p * 6),
        marathonLevel: Math.round(72 + p * 4),
        runningFitness: Number((50 + p * 2.5).toFixed(1)),
        racePredictionsS: {
          '5k': Math.round(marathon * 0.1585),
          '10k': Math.round(marathon * 0.3305),
          half: Math.round(marathon * 0.4755),
          full: marathon,
        },
      });
    }
  }

  const [ty, tm, td] = today.split('-').map(Number);
  const todayStart = new Date(ty, tm - 1, td, 18, 17);
  activities.push({
    id: 'mock-today',
    startTime: todayStart.toISOString(),
    sport: 'run',
    name: 'Run',
    distanceM: 3000,
    durationS: 18 * 60,
    avgHr: 134,
    maxHr: 152,
    avgCadence: 170,
    trainingLoad: 30,
    aerobicTE: 2.4,
    anaerobicTE: 0.4,
  });

  return { sleep, daily, activities, ability };
}
