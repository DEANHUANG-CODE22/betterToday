/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { confidenceTip, dailyVoice, hrvPhrase, sleepVoice, splitReason } from '../agent.ts';
import type { SleepNight } from '../types.ts';

const night = (date: string, totalMin: number, extra: Partial<SleepNight> = {}): SleepNight =>
  ({ date, bedtime: '', wakeTime: '', totalMin, deepMin: 0, lightMin: 0, remMin: 0, awakeMin: 0, ...extra }) as SleepNight;

test('sleepVoice：没有睡眠记录时说没看到，不编数', () => {
  const v = sleepVoice(undefined, '2026-11-15');
  assert.match(v.title, /还没看到/);
});

test('sleepVoice：今天醒来那晚写「昨夜」，HRV 出范围只陈述、不下结论', () => {
  const v = sleepVoice(night('2026-11-15', 381, { hrv: 56, hrvLow: 26, hrvHigh: 52 }), '2026-11-15');
  assert.equal(v.title, '昨夜睡了 6 小时 21 分。HRV 56，高过你的正常范围（26–52）。');
  assert.match(v.body, /不拿它下结论/);
  assert.doesNotMatch(v.body, /还没同步/);
});

test('sleepVoice：数据停在更早一天时写那天，并说昨夜的还没同步', () => {
  const v = sleepVoice(night('2026-11-10', 381, { hrv: 40, hrvLow: 26, hrvHigh: 52 }), '2026-11-15');
  assert.match(v.title, /^11 月 10 日醒来，睡了 6 小时 21 分。/);
  assert.match(v.title, /在你的正常范围（26–52）里/);
  assert.match(v.body, /还没同步/);
  assert.doesNotMatch(v.body, /下结论/);
});

test('sleepVoice：不再用「手表区间」，手表的恢复原话进正文', () => {
  const v = sleepVoice(night('2026-11-25', 400, { hrv: 48, hrvLow: 40, hrvHigh: 60, hrvBaseline: 55 }), '2026-11-25', { level: '良好', fullRecoveryH: 8 });
  assert.equal(v.title, '昨夜睡了 6 小时 40 分。HRV 48，比你平时的 55 低，还在你的正常范围（40–60）里。');
  assert.equal(v.body, '手表说恢复良好，预计 8 小时后完全恢复。');
  assert.doesNotMatch(v.title + v.body, /手表区间/);
});

test('hrvPhrase：四种情况', () => {
  assert.equal(hrvPhrase(56, 55, 40, 60).text, 'HRV 56，和你平时的 55 差不多。');
  assert.equal(hrvPhrase(70, 55, 40, 60).text, 'HRV 70，高过你的正常范围（40–60）。');
  assert.equal(hrvPhrase(36, 55, 40, 60).text, 'HRV 36，低于你的正常范围（40–60）。');
  assert.equal(hrvPhrase(48, 55).text, 'HRV 48，你平时是 55。');
  assert.equal(hrvPhrase(48).text, 'HRV 48。');
  assert.equal(hrvPhrase(70, 55, 40, 60).outside, true);
});

test('sleepVoice：不出现许可语', () => {
  const v = sleepVoice(night('2026-11-15', 480, { hrv: 60, hrvLow: 40, hrvHigh: 70 }), '2026-11-15');
  assert.doesNotMatch(v.title + v.body, /可以上强度|恢复良好/);
});

test('dailyVoice：步数加千分位，静息心率按基线方向说', () => {
  const v = dailyVoice({ date: '2026-11-10', steps: 8678, stress: 38.4, restingHr: 47 }, '这天', { avg28: 46, trend: 'normal' });
  assert.equal(v.title, '这天走了 8,678 步，压力日均 38。');
  assert.equal(v.body, '静息心率 47，和你平时的 46 差不多。');
  const up = dailyVoice({ date: '2026-11-10', restingHr: 52 }, '今天', { avg28: 46, trend: 'up' });
  assert.match(up.title, /没看到步数和压力/);
  assert.match(up.body, /比你平时的 46 高/);
});

test('confidenceTip：把握高时不说话', () => {
  assert.equal(confidenceTip([], '2026-11-15', 'high'), undefined);
});

test('confidenceTip：昨夜没有、近 7 天也不够时，说还要戴几晚', () => {
  const tip = confidenceTip([night('2026-11-10', 381)], '2026-11-15', 'low');
  assert.equal(tip, '近 7 天我只看到 1 晚睡眠。今晚起再戴表睡 2 晚，我就能比你自己的平时。');
});

test('confidenceTip：近 7 天够、只缺昨夜时说今晚戴表', () => {
  const sleep = ['2026-11-12', '2026-11-13', '2026-11-14'].map((d) => night(d, 400));
  assert.equal(confidenceTip(sleep, '2026-11-15', 'low'), '昨夜没有睡眠记录。今晚戴表睡，明天会更确定。');
});

test('confidenceTip：有昨夜但没 HRV', () => {
  const sleep = ['2026-11-13', '2026-11-14', '2026-11-15'].map((d) => night(d, 400));
  assert.equal(confidenceTip(sleep, '2026-11-15', 'medium'), '昨夜没测到 HRV，只能按你平时的数看。');
});

test('splitReason：按「 —— 」拆成人话和参照', () => {
  assert.deepEqual(splitReason('离上次强度隔开了 —— 9 天前上过'), { head: '离上次强度隔开了', tail: '9 天前上过' });
  assert.deepEqual(splitReason('中断了 9 天'), { head: '中断了 9 天' });
});
