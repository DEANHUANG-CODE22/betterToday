import type { Ability, Activity, Lap, SleepNight, SportType, TrainingLoadDay } from '../types';

const SPORT_BY_CODE: Record<number, SportType> = { 1: 'run', 2: 'bike', 3: 'swim', 4: 'strength', 5: 'trail' };

export function sportTypeOf(code: number | undefined, label: string): SportType {
  if (/越野|trail/i.test(label) || code === 102 || code === 105) return 'trail';
  if (/骑|bike|cycl|ride/i.test(label) || (code != null && code >= 200 && code < 300)) return 'bike';
  if (/泳|swim/i.test(label) || (code != null && code >= 300 && code < 400)) return 'swim';
  if (/力量|strength/i.test(label) || code === 402) return 'strength';
  if (/走|walk|hik/i.test(label) || code === 104 || code === 900) return 'walk';
  if (/跑|run/i.test(label) || (code != null && code >= 100 && code <= 103)) return 'run';
  if (code != null && SPORT_BY_CODE[code]) return SPORT_BY_CODE[code];
  return 'other';
}

export function parseClock(text: string): number | undefined {
  const m = text.trim().match(/(\d+):(\d{2})(?::(\d{2}))?/);
  if (!m) return undefined;
  return m[3] != null ? +m[1] * 3600 + +m[2] * 60 + +m[3] : +m[1] * 60 + +m[2];
}

function parseDurationHM(text: string): number | undefined {
  const hm = text.match(/(\d+)\s*(?:h|小时)\s*(\d+)?\s*(?:m|min|分钟)?/i);
  if (hm) return +hm[1] * 60 + +(hm[2] ?? 0);
  const mins = text.match(/(\d+)\s*(?:min|分钟)/i);
  return mins ? +mins[1] : undefined;
}

function field(block: string, labels: string): string | undefined {
  const m = block.match(new RegExp(`(?:${labels})\\s*[:：]\\s*([^\\n]+)`, 'i'));
  return m?.[1]?.trim();
}

function blocks(text: string): string[] {
  return text.split(/\n(?=\s*\d+\.\s+)/).slice(1);
}

/** 解析 querySportRecords 的文本。活动标识缺失时仍保留摘要，id 用日期和序号代替。 */
export function parseSportRecords(text: string): Activity[] {
  const out: Activity[] = [];
  const chunks = blocks(text);
  chunks.forEach((block, i) => {
    const head = block.match(/^\s*(\d+)\.\s+(.+?)\s+[—–-]\s+(\d{4}-\d{2}-\d{2})/);
    if (!head) return;
    const label = head[2].trim();
    const date = head[3];
    const codeFromName = label.match(/Sport\((\d+)\)/i)?.[1];
    const code = Number(block.match(/SportType:\s*(\d+)/i)?.[1] ?? field(block, 'Sport Type|运动类型')?.match(/\d+/)?.[0] ?? codeFromName);
    const sportType = Number.isFinite(code) ? code : undefined;
    const labelId = block.match(/LabelId:\s*(\d+)/i)?.[1] ?? field(block, 'Label ID|Activity ID|活动标识')?.match(/\d+/)?.[0];
    const distanceKm = field(block, 'Distance|距离')?.match(/[\d.]+/)?.[0];
    const duration = parseClock(field(block, 'Duration|Workout Time|时长|用时') ?? block);
    const hr = block.match(/Avg HR:\s*(\d+)/i)?.[1] ?? field(block, 'Average Heart Rate|平均心率')?.match(/\d+/)?.[0];
    const load = field(block, 'Training Load|训练负荷')?.match(/\d+/)?.[0];
    const started = block.match(/startTimestamp=(\d+)/)?.[1];
    out.push({
      id: labelId || `coros-${date}-${i}`,
      startTime: started ? new Date(Number(started) * 1000).toISOString() : `${date}T08:00:00`,
      sport: sportTypeOf(sportType, label),
      name: /^Sport\(\d+\)$/i.test(label) ? `运动${sportType != null ? ` ${sportType}` : ''}` : label.replace(/^(Outdoor|Indoor)\s+/i, ''),
      distanceM: distanceKm ? Math.round(parseFloat(distanceKm) * 1000) : 0,
      durationS: duration ?? 0,
      avgHr: hr ? +hr : undefined,
      trainingLoad: load ? +load : 0,
      aerobicTE: undefined,
    });
    const last = out[out.length - 1];
    (last as Activity & { sportTypeCode?: number; labelId?: string }).sportTypeCode = sportType;
    if (labelId) (last as Activity & { labelId?: string }).labelId = labelId;
  });
  return out;
}

export function activityKeys(a: Activity): { labelId?: string; sportType?: number } {
  const extra = a as Activity & { sportTypeCode?: number; labelId?: string };
  return { labelId: extra.labelId ?? (a.id.startsWith('coros-') ? undefined : a.id), sportType: extra.sportTypeCode };
}

export function parseActivityDetail(text: string): Partial<Activity> {
  const distanceKm = field(text, 'Distance|距离')?.match(/[\d.]+/)?.[0];
  const hr = field(text, 'Average Heart Rate|平均心率')?.match(/\d+/)?.[0];
  const maxHr = field(text, 'Max Heart Rate|最大心率')?.match(/\d+/)?.[0];
  const load = field(text, 'Training Load|训练负荷')?.match(/\d+/)?.[0];
  const cadence = field(text, 'Average Cadence|平均步频')?.match(/\d+/)?.[0];
  const gainLoss = text.match(/Gain\s*\/\s*Loss:\s*(\d+)\s*m\s*\/\s*(\d+)/i);
  const ascent = gainLoss?.[1] ?? field(text, 'Elevation Gain|Ascent|累计爬升')?.match(/\d+/)?.[0];
  const descent = gainLoss?.[2] ?? field(text, 'Elevation Loss|Descent|累计下降')?.match(/\d+/)?.[0];
  const aerobic = field(text, '(?<![Nn])Aerobic TE|(?<![Nn])Aerobic|有氧')?.match(/[\d.]+/)?.[0];
  const anaerobic = field(text, 'Anaerobic TE|Anaerobic|无氧')?.match(/[\d.]+/)?.[0];
  const paceOf = (label: string) => parseClock(field(text, label) ?? '');
  const stride = field(text, 'Average Stride Length|平均步幅')?.match(/[\d.]+/)?.[0];
  const power = field(text, 'Average Power|平均功率')?.match(/\d+/)?.[0];
  const calories = field(text, 'Calories|卡路里|消耗')?.match(/\d+/)?.[0];
  const performance = field(text, 'Performance|表现')?.trim();
  return {
    durationS: parseClock(field(text, 'Workout Time|Duration|时长') ?? ''),
    distanceM: distanceKm ? Math.round(parseFloat(distanceKm) * 1000) : undefined,
    avgHr: hr ? +hr : undefined,
    maxHr: maxHr ? +maxHr : undefined,
    trainingLoad: load ? +load : undefined,
    avgCadence: cadence ? +cadence : undefined,
    avgStrideM: stride ? +stride : undefined,
    avgPower: power ? +power : undefined,
    calories: calories ? +calories : undefined,
    elevGainM: ascent ? +ascent : undefined,
    elevLossM: descent ? +descent : undefined,
    avgPaceSecPerKm: paceOf('(?<!Moving )Average Pace|平均配速'),
    movingPaceSecPerKm: paceOf('Moving Average Pace|移动配速'),
    adjustedPaceSecPerKm: paceOf('Adjusted Pace|等强配速'),
    bestKmPaceSecPerKm: paceOf('Best Kilometer|最快一公里'),
    aerobicTE: aerobic ? +aerobic : undefined,
    anaerobicTE: anaerobic ? +anaerobic : undefined,
    performance,
  };
}

export function parseLaps(text: string): Lap[] {
  const jsonStart = text.indexOf('{');
  if (jsonStart < 0) return [];
  try {
    const json = JSON.parse(text.slice(jsonStart));
    const laps: any[] = json.lapGroups?.flatMap((g: any) => g.laps ?? []) ?? json.laps ?? [];
    return laps.map((l, i) => {
      const raw = Number(l.distance ?? 0);
      const distanceM = raw >= 1000 ? raw / 100 : raw;
      return {
        index: Number(l.lapIndex ?? i + 1),
        distanceM,
        durationS: Math.round(Number(l.time ?? 0)),
        avgHr: l.avgHr != null ? Number(l.avgHr) : undefined,
        avgCadence: l.avgCadence != null ? Number(l.avgCadence) : undefined,
      };
    });
  } catch {
    return [];
  }
}

function sleepBlock(text: string): { date: string; body: string }[] {
  const parts = text.split(/\n(?=\d{4}-\d{2}-\d{2}\s*$)/m);
  const out: { date: string; body: string }[] = [];
  for (const part of parts) {
    const date = part.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
    if (date) out.push({ date, body: part });
  }
  return out;
}

export function parseSleepOverview(text: string): SleepNight[] {
  return sleepBlock(text).map(({ date, body }) => {
    const totalMin = parseDurationHM(field(body, 'Main Sleep \\(asleep\\)|Main Sleep|主睡眠') ?? field(body, 'Daily Sleep|全天睡眠') ?? '') ?? 0;
    const ratio = (label: string) => {
      const m = body.match(new RegExp(`(?:${label})\\s*[:：]\\s*([\\d.]+)\\s*%`, 'i'));
      return m ? (+m[1] / 100) * totalMin : 0;
    };
    const deepMin = Math.round(ratio('Deep Sleep Ratio|深睡(?:比例)?'));
    const remMin = Math.round(ratio('REM Ratio|REM(?:比例)?'));
    const lightMin = Math.round(ratio('Light Sleep Ratio|浅睡(?:比例)?'));
    const awakeMin = parseDurationHM(field(body, 'Awake Time|清醒') ?? '') ?? 0;
    const awakeCount = body.match(/Awake Count[^:\n]*[:：]\s*(\d+)/i)?.[1];
    const score = body.match(/Sleep Score\s*[:：]\s*(\d+)/i)?.[1];
    const napsMin = parseDurationHM(field(body, 'Naps Total|小睡') ?? '');
    const window = field(body, 'Main Sleep Window|主睡眠时段');
    const times = window?.match(/(\d{2}:\d{2}).+?(\d{2}:\d{2})/);
    return {
      date,
      bedtime: times ? `${date}T${times[1]}:00` : '',
      wakeTime: times ? `${date}T${times[2]}:00` : '',
      totalMin,
      deepMin,
      lightMin: lightMin || (deepMin + remMin > 0 ? Math.max(0, totalMin - deepMin - remMin) : totalMin),
      remMin,
      awakeMin,
      awakeCount: awakeCount != null ? +awakeCount : undefined,
      napsMin,
      sleepScore: score != null ? +score : undefined,
    };
  }).filter((s) => s.totalMin > 0);
}

/** 日期行之后、标签后面的数字。例如 `2026-10-15` 下一行 `Steps: 8000`。 */
export function parseMetricNearDate(text: string, label: string): { date: string; value: number }[] {
  const out: { date: string; value: number }[] = [];
  const re = new RegExp(`(?:${label})\\s*[:：]?\\s*(\\d+(?:\\.\\d+)?)`, 'i');
  let date = '';
  for (const line of text.split('\n')) {
    const found = line.match(/(\d{4}-\d{2}-\d{2})/);
    if (found) date = found[1];
    const value = line.match(re)?.[1];
    if (date && value) out.push({ date, value: +value });
  }
  return out;
}

/** `2026-10-15: 46` 这种没有字段名的日期数值。 */
export function parseDateValues(text: string): { date: string; value: number }[] {
  return [...text.matchAll(/(\d{4}-\d{2}-\d{2})\s*[:：]\s*(\d+(?:\.\d+)?)/g)].map((m) => ({ date: m[1], value: +m[2] }));
}

export function parseDatedNumbers(text: string, unit: RegExp): { date: string; value: number }[] {
  const out: { date: string; value: number }[] = [];
  const re = new RegExp(`(\\d{4}-\\d{2}-\\d{2})[^\\n]{0,80}?(\\d+(?:\\.\\d+)?)\\s*(?:${unit.source})`, 'gi');
  for (const m of text.matchAll(re)) out.push({ date: m[1], value: +m[2] });
  if (out.length) return out;
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const date = lines[i].match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
    if (!date) continue;
    const nearby = lines.slice(i, i + 3).join(' ');
    const value = nearby.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(?:${unit.source})`, 'i'))?.[1];
    if (value) out.push({ date, value: +value });
  }
  return out;
}

/** 只取 HRV Assessment 里的日均值，不取后面的逐点曲线。 */
export function parseHrvAssessment(text: string): { date: string; value: number }[] {
  return parseHrvAssessmentDetail(text).map(({ date, value }) => ({ date, value }));
}

export function parseHrvAssessmentDetail(text: string): { date: string; value: number; status?: string; low?: number; high?: number; baseline?: number }[] {
  const section = text.split(/Time Series/i)[0] ?? text;
  const out: { date: string; value: number; status?: string; low?: number; high?: number; baseline?: number }[] = [];
  for (const block of section.split(/(?=\d{4}-\d{2}-\d{2}\s*:)/)) {
    const date = block.match(/(\d{4}-\d{2}-\d{2})/)?.[1];
    const value = block.match(/HRV Avg:\s*(\d+)/i)?.[1];
    if (!date || !value) continue;
    const status = block.match(/HRV Avg:\s*\d+\s*ms\s*[—–-]\s*([A-Za-z][A-Za-z ]*)/i)?.[1]?.trim();
    const range = block.match(/Normal Range:\s*(\d+)\s*-\s*(\d+)/i);
    const baseline = block.match(/Baseline:\s*(\d+)/i)?.[1];
    out.push({
      date,
      value: +value,
      status,
      low: range ? +range[1] : undefined,
      high: range ? +range[2] : undefined,
      baseline: baseline ? +baseline : undefined,
    });
  }
  return out;
}

/** queryDailyHealthData 的日期是 yyyyMMdd，步数带千分位。 */
export function parseDailyBlocks(text: string): { date: string; steps?: number; activeKcal?: number; stress?: number; exerciseMin?: number; floors?: number; sleepHrAvg?: number; sleepHrMin?: number; sleepHrMax?: number }[] {
  const parts = text.split(/---\s*(\d{8})\s*---/);
  const out: { date: string; steps?: number; activeKcal?: number; stress?: number; exerciseMin?: number; floors?: number; sleepHrAvg?: number; sleepHrMin?: number; sleepHrMax?: number }[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    const raw = parts[i];
    const body = parts[i + 1] ?? '';
    const num = (re: RegExp) => {
      const found = body.match(re)?.[1]?.replace(/,/g, '');
      return found != null && found !== '' ? Number(found) : undefined;
    };
    out.push({
      date: `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`,
      steps: num(/Steps:\s*([\d,]+)/i),
      activeKcal: num(/Calories:\s*([\d,]+)/i),
      stress: num(/Stress:\s*Avg\s*(\d+)/i),
      exerciseMin: num(/Exercise:\s*(\d+)/i),
      floors: num(/Floors:\s*(\d+)/i),
      sleepHrAvg: num(/Sleep HR:\s*Avg\s*(\d+)/i),
      sleepHrMin: num(/Sleep HR:[^\n]*Min\s*(\d+)/i),
      sleepHrMax: num(/Sleep HR:[^\n]*Max\s*(\d+)/i),
    });
  }
  return out.filter((row) => row.steps != null || row.activeKcal != null || row.stress != null || row.exerciseMin != null || row.floors != null || row.sleepHrAvg != null);
}

function labeledNumber(body: string, labels: string, asRatio = false): number | undefined {
  const raw = field(body, labels);
  const matched = raw?.match(/([\d.]+)\s*(%)?/);
  if (!matched) return undefined;
  const value = +matched[1];
  if (!asRatio) return value;
  return matched[2] || value > 3 ? value / 100 : value;
}

/** queryTrainingLoadAssessment。一天一块，兼容 yyyy-MM-dd 和 --- yyyyMMdd ---。 */
export function parseTrainingLoadAssessment(text: string): TrainingLoadDay[] {
  const normalized = text.replace(/---\s*(\d{4})(\d{2})(\d{2})\s*---/g, '\n$1-$2-$3\n');
  const out: TrainingLoadDay[] = [];
  for (const part of normalized.split(/\n(?=\d{4}-\d{2}-\d{2}\b)/)) {
    const date = part.match(/\d{4}-\d{2}-\d{2}/)?.[0];
    if (!date) continue;
    const shortTerm = labeledNumber(part, 'Short-term Load|Load Impact|短期负荷');
    const longTerm = labeledNumber(part, 'Long-term Load|Base Fitness|长期负荷');
    const ratio = labeledNumber(part, 'Load Ratio|Intensity Trend|负荷比|强度趋势', true);
    const comment = field(part, 'Comment|Daily Comment|评语');
    if (shortTerm == null && longTerm == null && ratio == null) continue;
    out.push({ date, shortTerm, longTerm, ratio, comment });
  }
  return out;
}

export function parseRecovery(text: string): number | undefined {
  return parseRecoveryStatus(text).percent;
}

export function parseRecoveryStatus(text: string): { percent?: number; level?: string; hours?: number } {
  const m = text.match(/(?:Recovery|恢复)\s*[:：]?\s*(\d+)\s*%/i) ?? text.match(/(\d+)\s*%/);
  const level = text.match(/Level\s*[:：]\s*([^\n]+)/i)?.[1]?.trim();
  const hours = text.match(/Estimated Full Recovery\s*[:：]\s*(\d+)\s*h/i)?.[1];
  return { percent: m ? +m[1] : undefined, level, hours: hours != null ? +hours : undefined };
}

/** queryStressTimeSeries。按日期标题分组。stressHr 为 0 视为没测到心率。 */
export function parseStressTimeSeries(text: string): { date: string; points: { t: number; stress: number; hr?: number }[] }[] {
  const out: { date: string; points: { t: number; stress: number; hr?: number }[] }[] = [];
  let current: { date: string; points: { t: number; stress: number; hr?: number }[] } | undefined;
  for (const line of text.split('\n')) {
    const date = line.match(/^(\d{4}-\d{2}-\d{2}):\s*$/);
    if (date) {
      current = { date: date[1], points: [] };
      out.push(current);
      continue;
    }
    if (!current) continue;
    const ts = line.match(/timestamp=(\d+)/);
    const stress = line.match(/(?:^|[,\s])stress=(\d+(?:\.\d+)?)/);
    if (!ts || !stress) continue;
    const hr = Number(line.match(/stressHr=(\d+(?:\.\d+)?)/)?.[1]);
    current.points.push({
      t: Number(ts[1]),
      stress: Number(stress[1]),
      hr: hr > 0 ? hr : undefined,
    });
  }
  return out.filter((day) => day.points.length > 0);
}

/** 最近一次体检里的血氧和呼吸。对不上格式就什么都不返回。 */
export function parseWellnessCheck(text: string): { date?: string; spo2?: number; respiration?: number } {
  const spo2Match = text.match(/(?:SpO2|血氧)\s*[:：]?\s*(\d+)/i);
  const respMatch = text.match(/(?:Respiration(?: Rate)?|呼吸(?:频率)?)\s*[:：]?\s*([\d.]+)/i);
  if (!spo2Match && !respMatch) return {};
  const anchor = Math.min(...[spo2Match?.index, respMatch?.index].filter((n): n is number => n != null));
  const before = text.slice(Math.max(0, anchor - 240), anchor);
  const iso = [...before.matchAll(/(\d{4}-\d{2}-\d{2})/g)].at(-1)?.[1];
  const compact = [...before.matchAll(/(?<!\d)(\d{8})(?!\d)/g)].at(-1)?.[1]?.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3');
  return {
    date: iso ?? compact,
    spo2: spo2Match ? +spo2Match[1] : undefined,
    respiration: respMatch ? +respMatch[1] : undefined,
  };
}

export function parseFitness(text: string): Partial<Ability> {
  const vo2 = text.match(/(?:VO2\s*max|最大摄氧量)\s*[:：]\s*([\d.]+)/i)?.[1];
  const level = text.match(/(?:Running Level|Running Fitness|跑力|马拉松水平)\s*[:：]\s*([\d.]+)/i)?.[1];
  const lthr = text.match(/(?:LTHR|乳酸阈心率|Threshold Heart Rate)\s*[:：]\s*(\d+)/i)?.[1];
  const pace = parseClock(field(text, 'Threshold Pace|阈值配速|乳酸阈配速') ?? '');
  const race = (label: string) => parseClock(text.match(new RegExp(`(?:${label})\\s*[:：]\\s*(\\d+:\\d+(?::\\d+)?)`, 'i'))?.[1] ?? '');
  const preds = {
    '5k': race('5\\s*km\\s*Prediction|5\\s?k|5公里'),
    '10k': race('10\\s*km\\s*Prediction|10\\s?k|10公里'),
    half: race('Half Marathon Prediction|半马|半程'),
    full: race('(?<!Half )Marathon Prediction|全马|全程'),
  };
  const ability: Partial<Ability> = {
    vo2max: vo2 ? +vo2 : undefined,
    runningFitness: level ? +level : undefined,
    lthr: lthr ? +lthr : undefined,
    thresholdPaceSecPerKm: pace,
  };
  if (Object.values(preds).some((v) => v != null)) ability.racePredictionsS = preds;
  return ability;
}
