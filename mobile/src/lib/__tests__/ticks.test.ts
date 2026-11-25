/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { niceTicks } from '../ticks.ts';

test('niceTicks：HRV 26–73 取 30 和 70', () => {
  assert.deepEqual(niceTicks(26, 73), [70, 30]);
});

test('niceTicks：刻度落在数据范围之内', () => {
  const [top, bottom] = niceTicks(41.3, 58.9);
  assert.ok(top <= 58.9 && bottom >= 41.3 && top > bottom);
});

test('niceTicks：小数跨度不出浮点尾巴', () => {
  assert.deepEqual(niceTicks(5.1, 7.4), [7, 5.5]);
});

test('niceTicks：跨度为 0 退回端点', () => {
  assert.deepEqual(niceTicks(50, 50), [50, 50]);
});
