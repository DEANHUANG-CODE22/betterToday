/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays } from '../metrics.ts';
import { aligned, baselineSentence, enoughToChart, judgmentTone, seriesBaseline, sleepScoreTone, windowDates } from '../trend.ts';

test('趋势句只用 7 日和 28 日基线', () => {
  const end = '2026-11-08';
  const points = Array.from({ length: 30 }, (_, i) => ({ date: addDays(end, -29 + i), value: i >= 22 && i < 29 ? 60 : 40 }));
  const sentence = baselineSentence(seriesBaseline(points, end), 'ms');
  assert.equal(sentence, '近 7 日均 60 ms，你的 28 日基线是 45 ms。');
  assert.equal(baselineSentence({ trend: 'normal' }, 'ms'), undefined);
});

test('缺日子留空，凑不满 4 天不画图', () => {
  const dates = windowDates('2026-11-08', 7);
  assert.equal(dates.length, 7);
  assert.equal(dates.at(-1), '2026-11-08');
  const values = aligned(dates, [{ date: '2026-11-08', value: 8 }, { date: '2026-11-06', value: 7 }]);
  assert.equal(values.at(-1), 8);
  assert.equal(values.filter((v) => v == null).length, 5);
  assert.equal(enoughToChart(values), false);
  assert.equal(enoughToChart([1, 2, 3, 4]), true);
});

test('颜色只跟手表已经给出的判断走，评分分档不进建议', () => {
  assert.equal(judgmentTone('Fresh'), 'good');
  assert.equal(judgmentTone('Tired'), 'fair');
  assert.equal(judgmentTone('Exhausted'), 'poor');
  assert.equal(judgmentTone('未知'), undefined);
  assert.equal(sleepScoreTone(85), 'good');
  assert.equal(sleepScoreTone(70), 'fair');
  assert.equal(sleepScoreTone(69), 'poor');
  assert.equal(sleepScoreTone(undefined), undefined);
});
