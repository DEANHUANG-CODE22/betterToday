export type ISODate = string; // YYYY-MM-DD

export interface SleepNight {
  date: ISODate; // 醒来那天
  bedtime: string; // ISO datetime
  wakeTime: string;
  totalMin: number; // 扣除清醒后的睡眠时长
  deepMin: number;
  lightMin: number;
  remMin: number;
  awakeMin: number;
  awakeCount?: number;
  napsMin?: number;
  sleepScore?: number;
  hrv?: number; // 夜间 HRV, ms
  hrvStatus?: string;
  hrvLow?: number;
  hrvHigh?: number;
  hrvBaseline?: number;
  restingHr?: number;
  recovery?: number; // 0-100，COROS 提供时使用
  recoveryLevel?: string;
  fullRecoveryH?: number;
  sleepHrAvg?: number;
  sleepHrMin?: number;
  sleepHrMax?: number;
}

/** queryStressTimeSeries 的一个点。t 是 Unix 秒。hr 缺测或为 0 时不记。 */
export interface StressSample {
  t: number;
  stress: number;
  hr?: number;
}

export interface DailyHealth {
  date: ISODate;
  steps?: number;
  activeKcal?: number;
  exerciseMin?: number;
  floors?: number;
  restingHr?: number;
  avgHr?: number;
  stress?: number; // 0-100
  /** 当天的压力点，约每 5 分钟一个。接口最多给 7 天，更早的日子没有。 */
  stressSeries?: StressSample[];
  spo2?: number; // %
  respiration?: number;
}

export type SportType = 'run' | 'trail' | 'bike' | 'swim' | 'strength' | 'walk' | 'other';

export interface Lap {
  index: number;
  distanceM: number;
  durationS: number;
  avgHr?: number;
  avgCadence?: number;
}

export interface Sample {
  t: number; // 距开始秒数
  hr?: number;
  paceSecPerKm?: number;
  cadence?: number;
  power?: number;
}

export interface Activity {
  id: string;
  startTime: string;
  sport: SportType;
  name: string;
  distanceM: number;
  durationS: number;
  avgHr?: number;
  maxHr?: number;
  avgCadence?: number;
  avgStrideM?: number;
  avgPower?: number;
  calories?: number;
  elevGainM?: number;
  elevLossM?: number;
  avgPaceSecPerKm?: number;
  movingPaceSecPerKm?: number;
  adjustedPaceSecPerKm?: number;
  bestKmPaceSecPerKm?: number;
  performance?: string;
  trainingLoad: number;
  aerobicTE?: number;
  anaerobicTE?: number;
  hrZonesS?: [number, number, number, number, number];
  laps?: Lap[];
  samples?: Sample[];
}

export interface Ability {
  date: ISODate;
  vo2max?: number;
  lthr?: number;
  thresholdPaceSecPerKm?: number;
  marathonLevel?: number; // 0-100
  runningFitness?: number;
  racePredictionsS?: { '5k'?: number; '10k'?: number; half?: number; full?: number };
}

/** queryTrainingLoadAssessment 的一天。ratio 已折成「短期 / 长期」，不是百分数。 */
export interface TrainingLoadDay {
  date: ISODate;
  shortTerm?: number;
  longTerm?: number;
  ratio?: number;
  comment?: string;
}

export interface Dataset {
  sleep: SleepNight[];
  daily: DailyHealth[];
  activities: Activity[];
  ability: Ability[];
  loads?: TrainingLoadDay[];
}
