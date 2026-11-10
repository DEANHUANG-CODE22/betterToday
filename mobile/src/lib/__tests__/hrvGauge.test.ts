/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hrvRingMark } from '../hrvGauge.ts';

test('71 落在 41–69 的右边外面，贴着色带，不绕回起点', () => {
  const mark = hrvRingMark(71, 41, 69);
  assert.ok(mark);
  assert.equal(mark.outside, true);
  assert.ok(Math.abs(mark.bandStart - 0.25) < 1e-9);
  assert.ok(Math.abs(mark.bandEnd - 0.75) < 1e-9);
  assert.ok(Math.abs(mark.dot - 44 / 56) < 1e-9);
  assert.ok(mark.dot > mark.bandEnd);
  assert.ok(mark.dot < 1);
});

test('区间内的点停在色带上，边界算在里面', () => {
  const mid = hrvRingMark(55, 41, 69);
  assert.equal(mid?.outside, false);
  assert.ok(mid && mid.dot > mid.bandStart && mid.dot < mid.bandEnd);
  assert.equal(hrvRingMark(41, 41, 69)?.outside, false);
  assert.equal(hrvRingMark(69, 41, 69)?.outside, false);
});

test('出界很多时点贴在端点，高低两端不是同一个位置', () => {
  const low = hrvRingMark(20, 41, 69);
  const high = hrvRingMark(120, 41, 69);
  assert.equal(low?.outside, true);
  assert.equal(low?.dot, 0);
  assert.equal(high?.outside, true);
  assert.equal(high?.dot, 1);
});

test('区间写反了也能放，缺数不编尺子', () => {
  const swapped = hrvRingMark(71, 69, 41);
  assert.equal(swapped?.outside, true);
  assert.equal(hrvRingMark(Number.NaN, 41, 69), undefined);
});
