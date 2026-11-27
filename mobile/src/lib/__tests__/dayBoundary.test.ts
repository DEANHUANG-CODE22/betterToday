/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayBoundaryMinutes, dayInfo, usualWakeMinutes } from '../dayBoundary.ts';
import type { SleepNight } from '../types.ts';

/** 当地时间构造，避免测试机时区影响。 */
const local = (y: number, m: number, d: number, h: number, min = 0) => new Date(y, m - 1, d, h, min);
const night = (date: string, wakeH: number, wakeM = 0, totalMin = 420): SleepNight => {
  const [y, m, d] = date.split('-').map(Number);
  return { date, bedtime: '', wakeTime: local(y, m, d, wakeH, wakeM).toISOString(), totalMin, deepMin: 0, lightMin: 0, remMin: 0, awakeMin: 0 } as SleepNight;
};
const history = ['2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26'].map((d) => night(d, 7, 0));

test('平时 7 点醒：翻天时刻是 9 点', () => {
  assert.equal(usualWakeMinutes(history, '2026-11-27'), 7 * 60);
  assert.equal(dayBoundaryMinutes(history, '2026-11-27'), 9 * 60);
});

test('半夜 3 点、昨夜还没结束：今天仍是昨天', () => {
  const info = dayInfo(local(2026, 11, 27, 3), history);
  assert.deepEqual(info, { today: '2026-11-26', calendarToday: '2026-11-27', beforeMorning: true });
});

test('早上 7 点半已经有今天醒来的睡眠记录：马上翻天', () => {
  const info = dayInfo(local(2026, 11, 27, 7, 30), [...history, night('2026-11-27', 7, 10)]);
  assert.deepEqual(info, { today: '2026-11-27', calendarToday: '2026-11-27', beforeMorning: false });
});

test('过了平时醒来 + 2 小时，就算没同步也翻天', () => {
  assert.equal(dayInfo(local(2026, 11, 27, 9, 5), history).today, '2026-11-27');
  assert.equal(dayInfo(local(2026, 11, 27, 8, 55), history).today, '2026-11-26');
});

test('夹在 5:00–12:00；没有记录按 9:00', () => {
  const late = ['2026-11-25', '2026-11-26'].map((d) => night(d, 11, 0));
  assert.equal(dayBoundaryMinutes(late, '2026-11-27'), 12 * 60);
  const early = ['2026-11-25', '2026-11-26'].map((d) => night(d, 2, 0));
  assert.equal(dayBoundaryMinutes(early, '2026-11-27'), 5 * 60);
  assert.equal(dayBoundaryMinutes([], '2026-11-27'), 9 * 60);
});
