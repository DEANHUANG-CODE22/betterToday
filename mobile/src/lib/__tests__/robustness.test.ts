/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activityQuality } from '../metrics.ts';
import { dailyAdvice } from '../advice.ts';
import { addDays } from '../metrics.ts';
import type { Activity, Dataset, SleepNight } from '../types.ts';

/**
 * 三条「健壮性」规则：
 *   1. 训练记录质量闸门（PRD §6.2）
 *   2. 冲突矩阵（两条以上证据打架 → 更保守）（PRD §5.1）
 *   3. 回归期四档（PRD §6.0）
 */

const TODAY = '2026-10-30';

const act = (date: string, load: number, extra: Partial<Activity> = {}): Activity => ({
  id: date,
  startTime: `${date}T07:00:00`,
  sport: 'run',
  name: 'r',
  distanceM: 8000,
  durationS: 3000,
  avgHr: 140,
  trainingLoad: load,
  ...extra,
});

const night = (date: string, hrv = 60, totalMin = 460): SleepNight => ({
  date, bedtime: '', wakeTime: '', totalMin,
  deepMin: 80, lightMin: 280, remMin: 100, awakeMin: 15, hrv, restingHr: 45,
});

const goodSleep = (until = TODAY) =>
  Array.from({ length: 29 }, (_, i) => night(addDays(until, -i)));

// ── 1. 质量闸门 ────────────────────────────────────────────────────

test('质量闸门认得四种坏记录', () => {
  assert.equal(activityQuality(act(TODAY, 60)), 'ok');
  // 没有负荷 ≠ 记录有问题：它只是进不了负荷计算，仍然是「那天练过」的证据。
  // （2026-11-05 修的 bug：原来把 load=0 判成 suspect，而列表接口本来就不返回负荷，
  //   结果整批记录被判可疑，回归期从 9 月初算起，界面显示「中断第 62 天」。）
  assert.equal(activityQuality(act(TODAY, 0)), 'ok', '没有负荷不算坏记录');
  assert.equal(activityQuality(act(TODAY, 60, { durationS: 60 })), 'suspect', '不到 2 分钟');
  assert.equal(activityQuality(act(TODAY, 60, { avgHr: 250 })), 'suspect', '心率离谱');
  assert.equal(
    activityQuality(act(TODAY, 60, { distanceM: 8000, durationS: 600, sport: 'run' })),
    'suspect',
    '1:15/km，配速不可能',
  );
  // 骑车不按跑步配速判，40km/h 是正常的
  assert.equal(
    activityQuality(act(TODAY, 60, { sport: 'bike', distanceM: 20000, durationS: 1800 })),
    'ok',
  );
});

test('离谱的一条记录不会把负荷比拉爆', () => {
  const base = Array.from({ length: 28 }, (_, i) => act(addDays(TODAY, -i - 1), 50));
  const bogus = act(TODAY, 9999, { avgHr: 0 }); // 心率 0，典型的掉线记录
  const withBogus: Dataset = { sleep: goodSleep(), daily: [], activities: [...base, bogus], ability: [] };

  const advice = dailyAdvice(withBogus, TODAY);

  assert.notEqual(advice.kind, 'rest', `被一条坏记录带成了「${advice.title}」`);
  assert.ok(advice.inputs.acwr != null && advice.inputs.acwr < 1.5, `acwr=${advice.inputs.acwr}`);
});

// ── 2. 冲突矩阵 ────────────────────────────────────────────────────

test('两条依据互相打架时，把握降到 low，并把打架的内容写进文案', () => {
  // 冲突一：睡得少（5 小时）但 HRV 不差
  // 冲突二：静息心率连续 3 天高于基线，但 HRV 仍在基线内
  const sleep = goodSleep().map((s, i) => (i === 0 ? night(TODAY, 60, 300) : s));
  const daily = Array.from({ length: 29 }, (_, i) => ({
    date: addDays(TODAY, -i),
    restingHr: i < 3 ? 56 : 45, // 最近三天偏高 11 bpm
  }));
  const activities = Array.from({ length: 28 }, (_, i) => act(addDays(TODAY, -i - 1), 50));

  const advice = dailyAdvice({ sleep, daily, activities, ability: [] }, TODAY);

  assert.equal(advice.kind, 'rest', '静息心率异常应该先走休息');
  assert.equal(advice.confidence, 'low');
  assert.ok((advice.conflicts?.length ?? 0) >= 2, `conflicts=${JSON.stringify(advice.conflicts)}`);
  assert.match(advice.narrative, /互相打架/);
});

// ── 3. 回归期四档 ──────────────────────────────────────────────────

const afterGap = (kind: 'major' | 'severe', days: number) => {
  const activities = [
    ...Array.from({ length: 10 }, (_, i) => act(addDays(TODAY, -days - 30 + i), 50)),
    ...Array.from({ length: days }, (_, i) => act(addDays(TODAY, -days + 1 + i), 50)),
  ];
  return dailyAdvice(
    { sleep: goodSleep(), daily: [], activities, ability: [] },
    TODAY,
    { recentKinds: [], returnKind: kind },
  );
};

test('回归期第 25 天：21 天档已经出关，42 天档还在里头', () => {
  assert.notEqual(afterGap('major', 25).kind, 'recovery', 'major 是 21 天，第 25 天该结束了');
  assert.equal(afterGap('severe', 25).kind, 'recovery', 'severe 是 42 天，第 25 天还在里头');
});

test('列表接口没有负荷时，不能把最近一次训练算丢', () => {
  // 真实情况：querySportRecords 不返回 trainingLoad，同步下来全是 0。
  // 如果拿「有负荷的记录」去算「距上次训练」，最近一次训练会被算丢。
  const activities = [
    act(addDays(TODAY, -9), 50),
    act(addDays(TODAY, -5), 50),
    act(addDays(TODAY, -3), 0), // 最新的这次没有负荷
  ];
  const advice = dailyAdvice({ sleep: goodSleep(), daily: [], activities, ability: [] }, TODAY);

  assert.notEqual(advice.kind, 'recovery', '不该把它当成中断期');
  assert.doesNotMatch(advice.narrative, /中断第/, advice.narrative);
});

// ── 回归期出关的三条路（PRD §6.0） ─────────────────────────────

const retPeriod = (opts: { kind?: 'major' | 'severe'; days: number; minutes: number; earlyMinutes?: number; anomaly?: boolean }) => {
  const { kind = 'major', days, minutes, earlyMinutes = 20, anomaly = false } = opts;
  const start = addDays(TODAY, -(days - 1)); // 回归期第一天
  // 中断前：每周约 2 次 × 50 分钟 → 基准约 125 分钟/周
  const base = Array.from({ length: 10 }, (_, i) => act(addDays(start, -30 + i * 2), 50, { durationS: 3000 }));
  // 回归期内每 3 天一次：最近 7 天用 minutes，之前用 earlyMinutes。
  // 这样「近 7 天」够、但「前一个 7 天」不够 → A 不成立，专门测 B。
  const back = [];
  for (let d = TODAY; d >= start; d = addDays(d, -3)) {
    const recent = d > addDays(TODAY, -7);
    back.push(act(d, 50, { durationS: Math.round((recent ? minutes : earlyMinutes) * 60) }));
  }
  // 保证回归期第一天确实有训练，否则「第几天」会从下一条算起
  if (back.at(-1)?.startTime.slice(0, 10) !== start) {
    back.push(act(start, 50, { durationS: Math.round(earlyMinutes * 60) }));
  }
  const daily = Array.from({ length: 29 }, (_, i) => ({
    date: addDays(TODAY, -i),
    restingHr: anomaly && i < 3 ? 60 : 45,
  }));
  return dailyAdvice(
    { sleep: goodSleep(), daily, activities: [...base, ...back], ability: [] },
    TODAY,
    { recentKinds: [], returnKind: kind },
  );
};

test('出关 A：天数够了、两个窗口的量都回来 → 放行', () => {
  // 每天 50 分钟，量远超 65%
  const activities = [
    ...Array.from({ length: 10 }, (_, i) => act(addDays(TODAY, -52 + i), 50)),
    ...Array.from({ length: 25 }, (_, i) => act(addDays(TODAY, -24 + i), 50)),
  ];
  const advice = dailyAdvice(
    { sleep: goodSleep(), daily: [], activities, ability: [] },
    TODAY,
    { recentKinds: [], returnKind: 'major' },
  );
  assert.notEqual(advice.kind, 'recovery');
});

test('出关 B：天数超过档位 +7、无异常、确实在练 → 放行', () => {
  const advice = retPeriod({ days: 29, minutes: 60 });
  assert.notEqual(advice.kind, 'recovery', '29 天、练了 4 次、没有异常，应该放行');
});

test('出关 B 不放行：有异常信号时继续待在回归期', () => {
  const advice = retPeriod({ days: 29, minutes: 60, anomaly: true });
  assert.equal(advice.kind, 'recovery', '有异常信号不能靠天数放行');
});

test('出关 B 不放行：42 天档在第 29 天还没到放行门槛', () => {
  const advice = retPeriod({ kind: 'severe', days: 29, minutes: 60 });
  assert.equal(advice.kind, 'recovery', 'severe 要 42+7 天');
});
