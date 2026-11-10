/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dailyAdvice } from '../advice.ts';
import { addDays } from '../metrics.ts';
import { RETURN_DATE, returnSnapshot } from './fixtures/return-2026-10-01.ts';
import type { Activity, Dataset, SleepNight } from '../types.ts';

const TODAY = '2026-10-30';

const night = (date: string, hrv: number, rhr: number, totalMin = 460): SleepNight => ({
  date,
  bedtime: '',
  wakeTime: '',
  totalMin,
  deepMin: 80,
  lightMin: 280,
  remMin: 100,
  awakeMin: 15,
  hrv,
  restingHr: rhr,
});

const run = (date: string, load = 60): Activity => ({
  id: date,
  startTime: `${date}T07:00:00`,
  sport: 'run',
  name: 'r',
  distanceM: 8000,
  durationS: 3000,
  trainingLoad: load,
});

/** 连续 29 天睡眠都正常，保证恢复分是 good —— 也就是「除了中断，别的都正常」。 */
const goodSleep = (until: string) =>
  Array.from({ length: 29 }, (_, i) => night(addDays(until, -i), 60, 45));

// ── PRD §14 验收 I ────────────────────────────────────────────────
// 真实快照：2026-10-01，伤退第 9 天，睡 9h01、HRV 63、ACWR 0、TSB +19。
// 修之前，v3 在这天输出「可以上强度 / high」。
test('回归期首日不得建议强度课（真实快照 2026-10-01）', () => {
  const advice = dailyAdvice(returnSnapshot, RETURN_DATE);

  assert.notEqual(advice.kind, 'intensity', `伤退第 9 天建议了「${advice.title}」`);
  assert.equal(advice.confidence, 'low', '回归期内的置信度必须恒为 low');
  assert.match(advice.narrative, /回归期|中断第/, '文案必须交代中断/回归期的天数和渐进方案');
});

// ── PRD §6.0：中断 4–6 天强制降档 ────────────────────────────────
// 真实数据里 09-28（停 6 天）曾被 v3 建议上强度课；P-1 只拦 ≥7 天，拦不住这一天。
test('中断 4–6 天必须降档，不给强度课', () => {
  const activities = Array.from({ length: 26 }, (_, i) => run(addDays(TODAY, -i - 5)));
  const data: Dataset = { sleep: goodSleep(TODAY), daily: [], activities, ability: [] };

  const advice = dailyAdvice(data, TODAY); // 距上次训练 5 天，其余条件都指向 intensity

  assert.notEqual(advice.kind, 'intensity');
  assert.match(advice.narrative, /停了 5 天/);
});

// ── PRD §6.0：已复训，仍在回归期内 ───────────────────────────────
test('复训第 5 天仍在回归期，文案带天数，且不上强度', () => {
  const activities = [
    run(addDays(TODAY, -20)),
    ...Array.from({ length: 4 }, (_, i) => run(addDays(TODAY, -4 + i))),
  ];
  const data: Dataset = { sleep: goodSleep(TODAY), daily: [], activities, ability: [] };

  const advice = dailyAdvice(data, TODAY);

  assert.equal(advice.kind, 'recovery');
  assert.equal(advice.confidence, 'low');
  assert.match(advice.title, /回归期第 5 天/);
});

// ── PRD §6.0：回归期会结束 ────────────────────────────────────────
test('中断后的第 22 天，回归期已经结束', () => {
  const activities = [
    ...Array.from({ length: 10 }, (_, i) => run(addDays(TODAY, -52 + i))),
    ...Array.from({ length: 22 }, (_, i) => run(addDays(TODAY, -21 + i))),
  ];
  const data: Dataset = { sleep: goodSleep(TODAY), daily: [], activities, ability: [] };

  assert.notEqual(dailyAdvice(data, TODAY).kind, 'recovery');
});
