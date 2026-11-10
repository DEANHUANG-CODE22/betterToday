/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dailyAdvice, yesterdaySentence } from '../advice.ts';
import { addDays } from '../metrics.ts';
import type { Activity, Dataset, SleepNight } from '../types.ts';

/**
 * PRD v0.4 §6.3 补丁 + §14 验收 K。
 *
 * 真实反例：2026-11-01 ~ 11-03 这三晚完全没有睡眠记录，
 * 旧代码仍给出 `confidence: high` 的强度课——因为 `missingSleep` 只看
 * 「近 7 天有几天睡眠」，从来不看今天这一晚。
 *
 * 这段改成：今夜无睡眠 → 强制 low 且不出强度课；今夜无 HRV → 最高 medium。
 */

const TODAY = '2026-10-30';

const run = (date: string, load = 60): Activity => ({
  id: date,
  startTime: `${date}T07:00:00`,
  sport: 'run',
  name: 'r',
  distanceM: 8000,
  durationS: 3000,
  trainingLoad: load,
});

/** 连续 28 天都在练，保证有负荷、ACWR 正常、距上次训练 1 天。 */
const activities = Array.from({ length: 28 }, (_, i) => run(addDays(TODAY, -i - 1)));

const night = (date: string, hrv?: number): SleepNight => ({
  date,
  bedtime: '',
  wakeTime: '',
  totalMin: 460,
  deepMin: 80,
  lightMin: 280,
  remMin: 100,
  awakeMin: 15,
  hrv,
  restingHr: 45,
});

/** 29 晚睡眠，含今天；hrv 默认给 60。 */
const sleepWith = (opts: { skipToday?: boolean; todayHrv?: number } = {}): SleepNight[] => {
  const todayHrv = 'todayHrv' in opts ? opts.todayHrv : 60;
  return Array.from({ length: 29 }, (_, i) => addDays(TODAY, -i))
    .filter((d) => !(opts.skipToday && d === TODAY))
    .map((d) => night(d, d === TODAY ? todayHrv : 60));
};

test('基线：数据齐全时给强度课，把握 high', () => {
  const advice = dailyAdvice({ sleep: sleepWith(), daily: [], activities, ability: [] }, TODAY);

  assert.equal(advice.kind, 'intensity');
  assert.equal(advice.confidence, 'high');
});

test('今夜没有睡眠记录时，不给强度课，把握 low（验收 K）', () => {
  const advice = dailyAdvice(
    { sleep: sleepWith({ skipToday: true }), daily: [], activities, ability: [] },
    TODAY,
  );

  assert.notEqual(advice.kind, 'intensity', `今夜无数据却建议了「${advice.title}」`);
  assert.equal(advice.confidence, 'low');
  assert.match(advice.title, /昨夜没数据/);
  assert.ok(
    advice.reasons.some((r) => r.includes('昨夜没有睡眠记录')),
    '依据里要说明缺的是昨夜睡眠',
  );
});

test('今夜有睡眠但没有 HRV 时，把握最高只到 medium', () => {
  const advice = dailyAdvice(
    { sleep: sleepWith({ todayHrv: undefined }), daily: [], activities, ability: [] },
    TODAY,
  );

  assert.equal(advice.confidence, 'medium');
  // 有睡眠就能判断，不应过度降级到不给强度课
  assert.equal(advice.kind, 'intensity');
});

test('昨天的建议把人话和参照分开', () => {
  const glued = '昨天的建议你还没记 —— 昨夜没数据，最近是 11\u00A0月\u00A03\u00A0日，今天先按有氧';
  assert.equal(yesterdaySentence('昨夜没数据，最近是 11 月 3 日，今天先按有氧'), glued);
  assert.equal(yesterdaySentence('昨夜没数据，最近是11月3日，今天先按有氧'), glued);
  assert.equal(glued.includes('11 月'), false);
  assert.equal(yesterdaySentence('今天按有氧走', 'followed'), '昨天的建议你照做了 —— 今天按有氧走');
});
