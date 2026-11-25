/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { arcPath, centeredScale, daysBetween, frac, hourlyStress, hrvScale, RULE } from '../gauge.ts';

test('RULE：门槛和 advice.ts 里的字面量一致（那边改了这里要跟）', () => {
  const src = readFileSync(new URL('../advice.ts', import.meta.url), 'utf8');
  assert.ok(src.includes(`ratio > ${RULE.acwrStop}`), 'acwrStop');
  assert.ok(src.includes(`tsb < ${RULE.tsbStop}`), 'tsbStop');
  assert.ok(src.includes(`tsb > ${RULE.tsbNoIntensity}`), 'tsbNoIntensity');
  assert.ok(src.includes(`sinceHard >= ${RULE.minDaysBetweenHard}`), 'minDaysBetweenHard');
});

test('frac：夹在 0…1，量程坏了给 0', () => {
  assert.equal(frac(21, -40, 30), 61 / 70);
  assert.equal(frac(-50, -40, 30), 0);
  assert.equal(frac(99, 0, 2), 1);
  assert.equal(frac(5, 3, 3), 0);
});

test('arcPath：超过半圈用大弧标记，满圈不退化成一个点', () => {
  assert.match(arcPath(52, 52, 40, 135, 405), / 0 1 1 /);
  assert.match(arcPath(60, 60, 44, 180, 270), / 0 0 1 /);
  const full = arcPath(50, 50, 10, 0, 360);
  assert.notEqual(full.split('A')[0].trim().slice(1), full.split(' 1 ').at(-1));
});

test('hrvScale：手表区间占中间一半，当晚的值在外面也装得下', () => {
  assert.deepEqual(hrvScale(26, 52), [13, 65]);
  assert.deepEqual(hrvScale(26, 52, 70), [13, 72]);
});

test('hourlyStress：按小时求均值，没采到的小时留空', () => {
  const base = Date.UTC(2026, 10, 10, 0, 0) / 1000;
  const series = [
    { t: base + 8 * 3600, stress: 40 },
    { t: base + 8 * 3600 + 300, stress: 60 },
    { t: base + 15 * 3600, stress: 30 },
  ];
  const hours = hourlyStress(series, 0);
  assert.equal(hours.length, 24);
  assert.equal(hours[8], 50);
  assert.equal(hours[15], 30);
  assert.equal(hours[12], undefined);
});

test('daysBetween 和 centeredScale', () => {
  assert.equal(daysBetween('2026-11-06', '2026-11-15'), 9);
  assert.deepEqual(centeredScale(46, 0.2), [36, 56]);
  assert.deepEqual(centeredScale(46, 0.2, 60), [36, 60]);
});

test('stressBand 和 zoneOf', async () => {
  const { stressBand, zoneOf } = await import('../gauge.ts');
  assert.deepEqual([0, 25, 26, 50, 51, 75, 76, 100].map(stressBand), [0, 0, 1, 1, 2, 2, 3, 3]);
  const zones = [{ from: 0, to: 0.14, color: 'r' }, { from: 0.14, to: 0.43, color: 'y' }];
  assert.equal(zoneOf(0.1, zones)?.color, 'r');
  assert.equal(zoneOf(0.3, zones)?.color, 'y');
  assert.equal(zoneOf(0.9, zones), undefined);
});
