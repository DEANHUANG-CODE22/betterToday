/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { issuedAdvice, parseDurationRange, settle } from '../settle.ts';
import type { Advice } from '../advice.ts';
import type { Activity } from '../types.ts';

/**
 * 训练后结算的五种结局（PRD §4.2）：一致 / 等价 / 偏离 / 已记录 / 按休息走。
 *
 * 这些阈值（时长 ±20%、±50%）来自 ROADMAP §2.2，没有数据校准过。
 * 测试锁的是「判定边界」，不是文案字面——文案改字不该把测试弄红。
 */

const TODAY = '2026-11-05';

function advice(kind: Advice['kind'], duration: string, title = '可以上强度'): Advice {
  return {
    kind,
    title,
    duration,
    zones: 'Z4',
    reasons: [],
    narrative: '',
    confidence: 'high',
    inputs: { recovery: { level: 'good', score: 80, reasons: [], hrv: { trend: 'normal' }, restingHr: { trend: 'normal' } }, hardSessions7d: 0, anomalies: [] },
  } as Advice;
}

function run(minutes: number, opts: { hard?: boolean } = {}): Activity {
  const durationS = minutes * 60;
  return {
    id: `a-${minutes}-${opts.hard ? 'hard' : 'easy'}`,
    startTime: `${TODAY}T07:00:00`,
    sport: 'run',
    name: 'run',
    distanceM: Math.round(minutes * 200), // 5:00/km，过质量闸门
    durationS,
    avgHr: opts.hard ? 170 : 135,
    trainingLoad: minutes,
    anaerobicTE: opts.hard ? 4 : 1,
  } as Activity;
}

test('处方时长解析：区间、单值、无法解析', () => {
  assert.deepEqual(parseDurationRange('45–75 分钟'), { min: 45, max: 75 });
  assert.deepEqual(parseDurationRange('50–70 分钟（含热身放松）'), { min: 50, max: 70 });
  assert.deepEqual(parseDurationRange('0–20 分钟'), { min: 0, max: 20 });
  assert.deepEqual(parseDurationRange('60 分钟'), { min: 60, max: 60 });
  assert.equal(parseDurationRange('--'), undefined);
});

test('强度课：60 分钟高强度 → 一致', () => {
  const s = settle(advice('intensity', '50–70 分钟'), [run(60, { hard: true })], TODAY, 'followed');
  assert.equal(s.outcome, 'matched');
});

test('强度课：85 分钟高强度 → 等价（量多了一档，不是偏离）', () => {
  const s = settle(advice('intensity', '50–70 分钟'), [run(85, { hard: true })], TODAY, 'followed');
  assert.equal(s.outcome, 'equivalent');
});

test('强度课：20 分钟慢跑 → 偏离，且方向是「轻了」', () => {
  const s = settle(advice('intensity', '50–70 分钟'), [run(20)], TODAY, 'followed');
  assert.equal(s.outcome, 'deviated');
  assert.match(s.headline, /轻/);
});

test('建议休息却练了 60 分钟高强度 → 偏离', () => {
  const s = settle(advice('rest', '0–20 分钟', '今天别上强度'), [run(60, { hard: true })], TODAY, 'followed');
  assert.equal(s.outcome, 'deviated');
});

test('建议休息、只走了 15 分钟 → 一致', () => {
  const s = settle(advice('rest', '0–20 分钟', '今天别上强度'), [run(15)], TODAY, 'skipped');
  assert.equal(s.outcome, 'matched');
});

test('没有训练记录、点了「做完了」→ 已记录，不判偏离', () => {
  const s = settle(advice('aerobic', '45–75 分钟'), [], TODAY, 'followed');
  assert.equal(s.outcome, 'pending');
});

test('没有训练记录、点了「今天不练」→ 按休息走', () => {
  const s = settle(advice('aerobic', '45–75 分钟'), [], TODAY, 'skipped');
  assert.equal(s.outcome, 'rested');
});

test('点了「今天不练」但记录里有训练 → 以记录为准', () => {
  const s = settle(advice('aerobic', '45–75 分钟'), [run(50, { hard: true })], TODAY, 'skipped');
  assert.equal(s.outcome, 'deviated');
  assert.match(s.detail, /记录/);
});

test('训练后建议被重算时，结算仍对着「发出时」的建议', () => {
  // 早上发的是强度课；跑完同步后引擎重算成「有氧」（今天的强度课算进近 7 天）。
  const current = advice('aerobic', '45–75 分钟', '今天练有氧');
  const issued = issuedAdvice(current, { kind: 'intensity', title: '可以上强度', duration: '50–70 分钟', zones: 'Z4' });
  assert.equal(issued.kind, 'intensity');
  assert.equal(issued.duration, '50–70 分钟');
  // 60 分钟高强度 → 对着发出时的强度课算，是一致的；对着重算后的有氧算，就会判成偏离。
  assert.equal(settle(issued, [run(60, { hard: true })], TODAY, 'followed').outcome, 'matched');
  assert.equal(settle(current, [run(60, { hard: true })], TODAY, 'followed').outcome, 'equivalent');
});

test('当天的建议还是一条空壳时，退回当前建议', () => {
  const current = advice('aerobic', '45–75 分钟');
  const issued = issuedAdvice(current, { kind: 'unknown', title: '—', duration: '--', zones: '--' });
  assert.equal(issued.kind, 'aerobic');
  assert.equal(issued.duration, '45–75 分钟');
});

test('「改一下」带备注 → 写出改成了什么', () => {
  const s = settle(advice('aerobic', '45–75 分钟'), [], TODAY, 'changed', '休息');
  assert.equal(s.outcome, 'pending');
  assert.match(s.detail, /休息/);
});
