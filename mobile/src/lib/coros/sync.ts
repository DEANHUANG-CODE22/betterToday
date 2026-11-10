import { addDays, toISODate } from '../metrics';
import type { Ability, Activity, DailyHealth, Dataset, SleepNight } from '../types';
import { McpClient } from './mcp';
import {
  activityKeys,
  parseActivityDetail,
  parseDailyBlocks,
  parseDateValues,
  parseDatedNumbers,
  parseFitness,
  parseHrvAssessmentDetail,
  parseLaps,
  parseMetricNearDate,
  parseRecoveryStatus,
  parseSleepOverview,
  parseSportRecords,
  parseStressTimeSeries,
  parseTrainingLoadAssessment,
  parseWellnessCheck,
} from './parse';

export interface SyncReport {
  counts: Record<keyof Dataset, number>;
  tools: Partial<Record<keyof Dataset, string>>;
  errors: string[];
  /** 这次压力曲线实际返回了哪些日期。不在里面、且落在最近 7 天的日子，不再沿用旧曲线。 */
  stressSeriesDates?: string[];
}

const ymd = (iso: string) => iso.replace(/-/g, '');

function emptyReport(): SyncReport {
  return { counts: { sleep: 0, daily: 0, activities: 0, ability: 0, loads: 0 }, tools: {}, errors: [] };
}

async function toolText(client: McpClient, name: string, args: Record<string, unknown>, report: SyncReport): Promise<string | null> {
  try {
    const raw = await client.call<unknown>(name, args);
    if (raw == null) return '';
    return typeof raw === 'string' ? raw : JSON.stringify(raw);
  } catch (e) {
    report.errors.push(`${name}: ${(e as Error).message}`);
    return null;
  }
}

function noteIfEmpty(report: SyncReport, tool: string, text: string | null, count: number) {
  if (text && count === 0) report.errors.push(`${tool} 有返回但没有解析出记录：${text.replace(/\s+/g, ' ').slice(0, 180)}`);
}

function blankSleep(date: string): SleepNight {
  return { date, bedtime: '', wakeTime: '', totalMin: 0, deepMin: 0, lightMin: 0, remMin: 0, awakeMin: 0 };
}

export async function syncFromCoros(days = 90): Promise<{ data: Partial<Dataset>; report: SyncReport }> {
  const client = new McpClient();
  const report = emptyReport();
  const today = toISODate(new Date());
  const from = addDays(today, -days + 1);
  const data: Partial<Dataset> = {};

  const activities: Activity[] = [];
  report.tools.activities = 'querySportRecords';
  let sportSample = '';
  for (let cursor = from; cursor <= today; cursor = addDays(cursor, 30)) {
    const end = addDays(cursor, 29) > today ? today : addDays(cursor, 29);
    const text = await toolText(client, 'querySportRecords', { startDate: ymd(cursor), endDate: ymd(end), limit: 50 }, report);
    if (text) {
      sportSample ||= text;
      activities.push(...parseSportRecords(text));
    }
  }
  noteIfEmpty(report, 'querySportRecords', sportSample, activities.length);
  // 每段返回是倒序的，先统一成正序；否则下面的 slice 会取到最旧的那批。
  activities.sort((a, b) => a.startTime.localeCompare(b.startTime));
  // 列表接口不返回单次负荷，只有详情里有。负荷比和体能/疲劳要 42 天，
  // 所以详情拉到 45 天；分圈只给最近 12 条（那个没人翻那么远）。
  const withKeys = activities.filter((a) => activityKeys(a).labelId && activityKeys(a).sportType != null);
  const detailFrom = addDays(today, -44);
  const forDetail = withKeys.filter((a) => toISODate(new Date(a.startTime)) >= detailFrom);
  const lapIds = new Set(withKeys.slice(-12).map((a) => a.id));
  for (const activity of forDetail) {
    const keys = activityKeys(activity);
    const detail = await toolText(client, 'getActivityDetail', { labelId: keys.labelId, sportType: keys.sportType }, report);
    if (detail) Object.assign(activity, defined(parseActivityDetail(detail)));
    if (!lapIds.has(activity.id)) continue;
    const laps = await toolText(client, 'queryActivityLapData', { labelId: keys.labelId, sportType: keys.sportType }, report);
    if (laps) {
      const parsed = parseLaps(laps);
      if (parsed.length) activity.laps = parsed;
    }
  }
  data.activities = activities;
  report.counts.activities = activities.length;

  report.tools.loads = 'queryTrainingLoadAssessment';
  const loadText = await toolText(client, 'queryTrainingLoadAssessment', { days }, report);
  const loads = parseTrainingLoadAssessment(loadText ?? '');
  if (loads.length) {
    data.loads = loads;
    report.counts.loads = loads.length;
  } else noteIfEmpty(report, 'queryTrainingLoadAssessment', loadText, 0);

  report.tools.sleep = 'querySleepOverview';
  const sleepText = await toolText(client, 'querySleepOverview', { startDate: ymd(from), endDate: ymd(today) }, report);
  const sleep = new Map<string, SleepNight>();
  for (const night of parseSleepOverview(sleepText ?? '')) sleep.set(night.date, night);
  noteIfEmpty(report, 'querySleepOverview', sleepText, sleep.size);

  for (let cursor = addDays(today, -34); cursor <= today; cursor = addDays(cursor, 7)) {
    const end = addDays(cursor, 6) > today ? today : addDays(cursor, 6);
    const text = await toolText(client, 'querySleepHrv', { startDate: ymd(cursor), endDate: ymd(end) }, report);
    const labeled = parseHrvAssessmentDetail(text ?? '');
    const rows: { date: string; value: number; status?: string; low?: number; high?: number; baseline?: number }[] = labeled.length
      ? labeled
      : parseMetricNearDate(text ?? '', 'HRV Avg|HRV|心率变异性');
    for (const row of rows) {
      const night = sleep.get(row.date) ?? blankSleep(row.date);
      night.hrv = row.value;
      if (row.status) night.hrvStatus = row.status;
      if (row.low != null) night.hrvLow = row.low;
      if (row.high != null) night.hrvHigh = row.high;
      if (row.baseline != null) night.hrvBaseline = row.baseline;
      sleep.set(row.date, night);
    }
  }
  const resting = await toolText(client, 'queryRestingHeartRate', { days: 35 }, report);
  const restingRows = parseMetricNearDate(resting ?? '', 'Resting Heart Rate|静息心率|RHR');
  for (const row of restingRows.length ? restingRows : parseDatedNumbers(resting ?? '', /bpm/).concat(parseDateValues(resting ?? ''))) {
    const night = sleep.get(row.date) ?? blankSleep(row.date);
    night.restingHr = row.value;
    sleep.set(row.date, night);
  }
  const recoveryText = await toolText(client, 'queryRecoveryStatus', {}, report);
  const recovery = parseRecoveryStatus(recoveryText ?? '');
  if (recovery.percent != null || recovery.level || recovery.hours != null) {
    const todayNight = sleep.get(today) ?? blankSleep(today);
    if (recovery.percent != null) todayNight.recovery = recovery.percent;
    if (recovery.level) todayNight.recoveryLevel = recovery.level;
    if (recovery.hours != null) todayNight.fullRecoveryH = recovery.hours;
    sleep.set(today, todayNight);
  }

  report.tools.daily = 'queryDailyHealthData';
  const daily = new Map<string, DailyHealth>();
  const ensure = (date: string) => daily.get(date) ?? { date };
  const health = await toolText(client, 'queryDailyHealthData', { days: 35 }, report);
  for (const row of parseDailyBlocks(health ?? '')) {
    const item = ensure(row.date);
    if (row.steps != null) item.steps = row.steps;
    if (row.activeKcal != null) item.activeKcal = row.activeKcal;
    if (row.stress != null) item.stress = row.stress;
    if (row.exerciseMin != null) item.exerciseMin = row.exerciseMin;
    if (row.floors != null) item.floors = row.floors;
    daily.set(row.date, item);
    if (row.sleepHrAvg != null || row.sleepHrMin != null || row.sleepHrMax != null) {
      const night = sleep.get(row.date) ?? blankSleep(row.date);
      if (row.sleepHrAvg != null) night.sleepHrAvg = row.sleepHrAvg;
      if (row.sleepHrMin != null) night.sleepHrMin = row.sleepHrMin;
      if (row.sleepHrMax != null) night.sleepHrMax = row.sleepHrMax;
      sleep.set(row.date, night);
    }
  }
  const avgHrText = await toolText(client, 'queryAvgHeartRate', { days: 35 }, report);
  const avgHrRows = parseMetricNearDate(avgHrText ?? '', 'Average Heart Rate|Avg HR|日均心率');
  for (const row of avgHrRows.length ? avgHrRows : parseDateValues(avgHrText ?? '')) {
    const item = ensure(row.date);
    item.avgHr = row.value;
    daily.set(row.date, item);
  }
  const checkText = await toolText(client, 'queryHealthCheckTimeSeries', { days: 7 }, report);
  const check = parseWellnessCheck(checkText ?? '');
  if (check.date && (check.spo2 != null || check.respiration != null)) {
    const item = ensure(check.date);
    if (check.spo2 != null) item.spo2 = check.spo2;
    if (check.respiration != null) item.respiration = check.respiration;
    daily.set(check.date, item);
  }
  const seriesText = await toolText(client, 'queryStressTimeSeries', { days: 7 }, report);
  if (seriesText != null) {
    const parsed = parseStressTimeSeries(seriesText);
    report.stressSeriesDates = parsed.map((day) => day.date);
    for (const day of parsed) {
      const item = ensure(day.date);
      item.stressSeries = day.points;
      daily.set(day.date, item);
    }
  }
  const stress = await toolText(client, 'queryStressLevel', { days: 35 }, report);
  const stressRows = parseMetricNearDate(stress ?? '', 'Stress|压力');
  for (const row of stressRows.length ? stressRows : parseDateValues(stress ?? '')) {
    const item = ensure(row.date);
    item.stress = row.value;
    daily.set(row.date, item);
  }
  for (const row of restingRows.length ? restingRows : parseDatedNumbers(resting ?? '', /bpm/)) {
    const item = ensure(row.date);
    item.restingHr = row.value;
    daily.set(row.date, item);
  }
  noteIfEmpty(report, 'queryDailyHealthData', health, daily.size);
  data.sleep = [...sleep.values()].filter((s) => s.totalMin > 0 || s.hrv != null || s.restingHr != null || s.recovery != null || s.recoveryLevel || s.sleepHrAvg != null).sort((a, b) => a.date.localeCompare(b.date));
  report.counts.sleep = data.sleep.length;
  data.daily = [...daily.values()].sort((a, b) => a.date.localeCompare(b.date));
  report.counts.daily = data.daily.length;

  report.tools.ability = 'queryFitnessAssessmentOverview';
  const fitnessText = await toolText(client, 'queryFitnessAssessmentOverview', {}, report);
  const fitness = parseFitness(fitnessText ?? '');
  if (Object.values(fitness).some((v) => v != null)) {
    data.ability = [{ date: today, ...fitness }];
    report.counts.ability = 1;
  } else noteIfEmpty(report, 'queryFitnessAssessmentOverview', fitnessText, 0);

  return { data, report };
}

function defined<T extends object>(partial: T): Partial<T> {
  return Object.fromEntries(Object.entries(partial).filter(([, value]) => value != null)) as Partial<T>;
}
