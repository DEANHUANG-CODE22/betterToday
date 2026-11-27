/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULE } from '../gauge.ts';
import { PAGE_TOPICS, TOPICS, type TopicId } from '../knowledge.ts';

const all = Object.values(TOPICS);
const text = (id: TopicId) => {
  const t = TOPICS[id];
  return [t.title, t.what, t.forRunning, t.changes, t.doctor ?? ''].join('\n');
};

test('每条都有是什么 / 对跑步意味着什么 / 什么会让它变 / 至少一个来源', () => {
  for (const t of all) {
    assert.ok(t.title && t.what && t.forRunning && t.changes, t.id);
    assert.ok(t.sources.length >= 1, `${t.id} 缺来源`);
  }
});

test('边界：不说「异常」，不诊断', () => {
  for (const t of all) {
    assert.doesNotMatch(text(t.id), /异常|你可能有|确诊/, t.id);
  }
});

test('睡眠、日常两页不出许可语，也不放「今天怎么排」', () => {
  for (const page of ['sleep', 'daily'] as const) {
    const ids: readonly TopicId[] = PAGE_TOPICS[page];
    assert.ok(!ids.includes('plan'), page);
    for (const id of ids) assert.doesNotMatch(text(id), /可以上强度/, `${page}/${id}`);
  }
});

test('条目里的门槛和规则一致（RULE 改了这里会挂）', () => {
  const plan = TOPICS.plan.forRunning;
  assert.ok(plan.includes(`超过 ${RULE.acwrStop}`));
  assert.ok(plan.includes(`低于 −${-RULE.tsbStop}`));
  assert.ok(plan.includes(`高于 −${-RULE.tsbNoIntensity}`));
  assert.ok(plan.includes(`至少 ${RULE.minDaysBetweenHard} 天`));
  assert.ok(TOPICS.acwr.forRunning.includes(String(RULE.acwrStop)));
});

test('「你的」只填事实层的数；缺数时说没有', () => {
  assert.equal(TOPICS.hrv.yours({ hrv: { date: '2026-11-25', value: 48.4, base: 55, low: 40, high: 60 } }), '11 月 25 日：HRV 48，比你平时的 55 低，还在你的正常范围（40–60）里。');
  assert.equal(TOPICS.hrv.yours({}), '我还没看到夜间 HRV。');
  assert.equal(TOPICS.recovery.yours({ recovery: { date: '2026-11-25', score: 82, level: '良好', fullH: 8 } }), '手表给的恢复分 82（良好），11 月 25 日，预计 8 小时后完全恢复。');
  assert.equal(TOPICS.recovery.yours({}), '这一晚手表没给恢复分。');
  assert.equal(TOPICS.restingHr.yours({ restingHr: { value: 52, avg28: 46 } }), '静息心率 52，比你平时的 46 高 6。');
  assert.equal(TOPICS.restingHr.yours({ restingHr: { value: 47, avg28: 46 } }), '静息心率 47，和你平时的 46 差不多。');
  assert.equal(TOPICS.acwr.yours({ acwr: 1.82 }), '负荷比 1.8（短期 / 长期），规则的停训线是 1.5。');
  assert.equal(TOPICS.confidence.yours({ confidence: { level: 'low', tip: '昨夜没有睡眠记录。今晚戴表睡，明天会更确定。' } }), '今天把握低：昨夜没有睡眠记录。今晚戴表睡，明天会更确定。');
  assert.equal(TOPICS.feel.yours({ feel: { today: 4, avg: 3.5, n: 6 } }), '今天早上你记的是 4 / 5。最近 6 天平均 3.5。');
  assert.equal(TOPICS.zones.yours({}), undefined);
});

test('「你的」不出现「异常」', () => {
  const f = { deviations: ['静息心率已连续 3 天高于平时'] };
  assert.doesNotMatch(TOPICS.deviation.yours(f) ?? '', /异常/);
});
