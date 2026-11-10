/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { returnKindPrompt } from '../advice.ts';
import { addDays } from '../metrics.ts';
import type { Activity } from '../types.ts';

/**
 * 回归期「问一次」的入口判定（PRD §6.0）。
 *
 * 这条之所以单独测：`returnKind` 写进引擎之后，界面从来没问过用户，
 * 永远走默认值——**28 个测试全绿，功能却不存在**。
 * 现在把「该不该问」抽成纯函数，让它能被测试盯住。
 */

const TODAY = '2026-10-30';

const act = (date: string): Activity => ({
  id: date,
  startTime: `${date}T07:00:00`,
  sport: 'run',
  name: 'r',
  distanceM: 8000,
  durationS: 3000,
  avgHr: 140,
  trainingLoad: 60,
});

test('距上次训练不到 7 天：不问', () => {
  const activities = [act(addDays(TODAY, -3)), act(addDays(TODAY, -4))];
  assert.equal(returnKindPrompt(activities, TODAY).ask, false);
});

test('中断 ≥7 天且没回答过：要问', () => {
  const activities = [act(addDays(TODAY, -9))];
  const p = returnKindPrompt(activities, TODAY);

  assert.equal(p.ask, true);
  assert.equal(p.gapDays, 9);
  assert.equal(p.since, addDays(TODAY, -9));
});

test('这次中断已经回答过：不再问', () => {
  const since = addDays(TODAY, -9);
  const activities = [act(since)];

  assert.equal(returnKindPrompt(activities, TODAY, since).ask, false);
});

test('复训之后又中断：起始日变了，要再问一次', () => {
  const firstGap = addDays(TODAY, -40);   // 第一次中断的起始日
  const secondGap = addDays(TODAY, -20);  // 复训后又断了，这次从这天算起
  const activities = [act(firstGap), act(secondGap)];

  // 上次回答的是第一次中断，这次起始日变了 → 应该再问
  assert.equal(returnKindPrompt(activities, TODAY, firstGap).ask, true);
  // 回答过这一次之后 → 不再问
  assert.equal(returnKindPrompt(activities, TODAY, secondGap).ask, false);
});

test('没有任何训练记录：不问', () => {
  assert.equal(returnKindPrompt([], TODAY).ask, false);
});
