/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acwr, addDays, assessRecovery, baseline, detectAnomalies, fitnessSeries } from '../metrics.ts';
import { dailyAdvice } from '../advice.ts';
import { mockDataset } from '../mock.ts';
import type { Activity, Dataset, SleepNight } from '../types.ts';

const TODAY = '2026-10-30';

test('addDays 跨月', () => {
  assert.equal(addDays('2026-10-30', 3), '2026-11-02');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});

test('baseline 识别偏离', () => {
  const series = Array.from({ length: 29 }, (_, i) => ({ date: addDays(TODAY, -i), value: i === 0 ? 70 : 60 }));
  const b = baseline(series, TODAY);
  assert.equal(b.avg28, 60);
  assert.equal(b.trend, 'up');
  assert.ok(Math.abs(b.deltaPct! - 1 / 6) < 1e-9);
});

const run = (date: string, load: number): Activity => ({
  id: date, startTime: `${date}T07:00:00`, sport: 'run', name: 'r', distanceM: 10000, durationS: 3000, trainingLoad: load,
});

test('ACWR 与 CTL/ATL', () => {
  const acts = Array.from({ length: 28 }, (_, i) => run(addDays(TODAY, -i), i < 7 ? 200 : 50));
  const r = acwr(acts, TODAY)!;
  assert.ok(r > 2, `acwr=${r}`);
  const s = fitnessSeries(acts, addDays(TODAY, -27), TODAY);
  assert.ok(s.at(-1)!.atl > s.at(-1)!.ctl);
});

const night = (date: string, hrv: number, rhr: number, totalMin = 460): SleepNight => ({
  date, bedtime: '', wakeTime: '', totalMin, deepMin: 80, lightMin: 280, remMin: 100, awakeMin: 15, hrv, restingHr: rhr,
});

test('恢复差时建议休息', () => {
  const sleep = Array.from({ length: 29 }, (_, i) => (i < 3 ? night(addDays(TODAY, -i), 42, 52, 340) : night(addDays(TODAY, -i), 60, 45)));
  const rec = assessRecovery(sleep, TODAY);
  assert.equal(rec.level, 'poor');
  const daily = sleep.map((s) => ({ date: s.date, restingHr: s.restingHr }));
  assert.ok(detectAnomalies(daily, sleep, TODAY).some((a) => a.metric === 'restingHr'));
  const acts = Array.from({ length: 28 }, (_, i) => run(addDays(TODAY, -i), 50));
  const data: Dataset = { sleep, daily, activities: acts, ability: [] };
  assert.equal(dailyAdvice(data, TODAY).kind, 'rest');
});

test('恢复好且强度少时建议强度课', () => {
  const sleep = Array.from({ length: 29 }, (_, i) => night(addDays(TODAY, -i), i === 0 ? 66 : 60, 45));
  const acts = Array.from({ length: 28 }, (_, i) => run(addDays(TODAY, -i - 1), 60));
  const data: Dataset = { sleep, daily: [], activities: acts, ability: [] };
  assert.equal(dailyAdvice(data, TODAY).kind, 'intensity');
});

test('连续几天同一判断时，正文不把第一条依据再贴一遍', () => {
  const sleep = Array.from({ length: 29 }, (_, i) => night(addDays(TODAY, -i), i === 0 ? 66 : 60, 45));
  const acts = Array.from({ length: 28 }, (_, i) => run(addDays(TODAY, -i - 1), 60));
  const data: Dataset = { sleep, daily: [], activities: acts, ability: [] };
  const advice = dailyAdvice(data, TODAY, { recentKinds: ['intensity', 'intensity'], yesterdayAction: 'followed' });
  assert.match(advice.narrative, /连续几天都是这个判断。$/);
  for (const reason of advice.reasons) assert.equal(advice.narrative.includes(reason), false, reason);
});

test('负荷暴增时建议恢复跑', () => {
  const sleep = Array.from({ length: 29 }, (_, i) => night(addDays(TODAY, -i), 60, 45));
  const acts = Array.from({ length: 28 }, (_, i) => run(addDays(TODAY, -i - 1), i < 6 ? 250 : 40));
  const data: Dataset = { sleep, daily: [], activities: acts, ability: [] };
  const advice = dailyAdvice(data, TODAY);
  assert.equal(advice.kind, 'rest');
  assert.match(advice.zones, /交叉|不要再跑/);
});

test('没有数据时不给出训练建议', () => {
  assert.equal(dailyAdvice({ sleep: [], daily: [], activities: [], ability: [] }, TODAY).kind, 'unknown');
});

test('官方负荷评估可以代替单次负荷', () => {
  const sleep = Array.from({ length: 10 }, (_, i) => night(addDays(TODAY, -i), 60, 45));
  const advice = dailyAdvice({
    sleep,
    daily: [],
    activities: [],
    ability: [],
    loads: [{ date: TODAY, shortTerm: 80, longTerm: 40, ratio: 2 }],
  }, TODAY);
  assert.equal(advice.kind, 'rest');
  assert.equal(advice.inputs.acwr, 2);
  assert.equal(advice.inputs.tsb, -40);
});

test('只有睡眠没有负荷时不给训练建议', () => {
  const sleep = Array.from({ length: 10 }, (_, i) => night(addDays(TODAY, -i), 60, 45));
  const advice = dailyAdvice({ sleep, daily: [], activities: [], ability: [] }, TODAY);
  assert.notEqual(advice.kind, 'intensity');
  assert.equal(advice.confidence, 'low');
  assert.ok(advice.reasons.some((r) => r.includes('负荷')));
});

test('睡眠不足时即使有负荷也不给训练建议', () => {
  const sleep = [night(TODAY, 60, 45), night(addDays(TODAY, -1), 60, 45)];
  const acts = Array.from({ length: 28 }, (_, i) => run(addDays(TODAY, -i), 60));
  const advice = dailyAdvice({ sleep, daily: [], activities: acts, ability: [] }, TODAY);
  assert.notEqual(advice.kind, 'intensity');
  assert.equal(advice.confidence, 'low');
  assert.ok(advice.reasons.some((r) => r.includes('睡眠')));
});

test('今天的强度课算进近 7 天', () => {
  const sleep = Array.from({ length: 29 }, (_, i) => night(addDays(TODAY, -i), 60, 45));
  const base = Array.from({ length: 21 }, (_, i) => run(addDays(TODAY, -i - 1), 60));
  const yesterday = { ...run(addDays(TODAY, -1), 80), id: 'y-hard', anaerobicTE: 3.2 };
  const today = { ...run(TODAY, 80), id: 't-hard', anaerobicTE: 3.2 };
  const advice = dailyAdvice({ sleep, daily: [], activities: [...base, yesterday, today], ability: [] }, TODAY);
  assert.notEqual(advice.kind, 'intensity');
  assert.equal(advice.inputs.hardSessions7d, 2);
});

test('mock 数据可用于整条链路', () => {
  const data = mockDataset(TODAY);
  assert.equal(data.sleep.length, 90);
  assert.ok(data.activities.length > 50);
  const a = dailyAdvice(data, TODAY);
  assert.ok(a.reasons.length > 0 && a.narrative.length > 0);
});
