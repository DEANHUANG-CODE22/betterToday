/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthGrid, sessionsByDate, weekDates, yearMonths } from '../volume.ts';

const run = (startTime: string, distanceM: number) => ({ startTime, distanceM });

test('2026-11-09 是周一，本周从这一天起到周日', () => {
  const days = weekDates('2026-11-09');
  assert.deepEqual(days, [
    '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15',
  ]);
  assert.equal(weekDates('2026-11-15')[0], '2026-11-09');
});

test('同一天两次训练，周公里相加，月次数记两次，格子只占一天', () => {
  const byDate = sessionsByDate([
    run('2026-11-09T18:17:00', 3000),
    run('2026-11-09T21:00:00', 1000),
    run('2026-11-02T08:00:00', 5000),
  ]);
  const week = weekDates('2026-11-09').map((date) => byDate.get(date)?.distanceM ?? 0);
  assert.deepEqual(week, [4000, 0, 0, 0, 0, 0, 0]);
  const month = monthGrid('2026-11-09', byDate);
  assert.equal(month.label, '11 月');
  assert.equal(month.total, 3);
  assert.equal(month.cells[0].date, undefined);
  assert.equal(month.cells[6].date, '2026-11-01');
  assert.equal(month.cells.filter((cell) => !cell.date).length, 12);
  const ninth = month.cells.find((cell) => cell.date === '2026-11-09');
  assert.equal(ninth?.count, 2);
  assert.equal(month.cells.find((cell) => cell.date === '2026-11-02')?.count, 1);
  assert.equal(month.cells.find((cell) => cell.date === '2026-11-10')?.count, 0);
});

test('今年只数这一年，还没到的月份空着', () => {
  const byDate = sessionsByDate([
    run('2026-11-09T18:17:00', 3000),
    run('2025-11-09T18:17:00', 3000),
    run('2026-01-03T08:00:00', 1000),
  ]);
  const months = yearMonths('2026-11-09', byDate);
  assert.equal(months.length, 12);
  assert.equal(months[0].count, 1);
  assert.equal(months[0].future, false);
  assert.equal(months[0].known, true);
  assert.equal(months[1].known, true);
  assert.equal(months[1].count, 0);
  assert.equal(months[10].label, '11 月');
  assert.equal(months[10].count, 1);
  assert.equal(months[11].future, true);
  assert.equal(months[11].known, false);
  assert.equal(months[11].count, 0);
});

test('库里还没有的月份不写成 0，第一条记录之后没练的月份仍写 0', () => {
  const byDate = sessionsByDate([
    run('2026-08-02T07:00:00', 5000),
    run('2026-11-09T18:17:00', 3000),
    run('2025-12-01T08:00:00', 1000),
  ]);
  const months = yearMonths('2026-11-09', byDate);
  assert.equal(months[6].known, false);
  assert.equal(months[7].label, '8 月');
  assert.equal(months[7].known, true);
  assert.equal(months[7].count, 1);
  assert.equal(months[9].known, true);
  assert.equal(months[9].count, 0);
  assert.equal(months[11].future, true);
  const empty = yearMonths('2026-11-09', sessionsByDate([]));
  assert.equal(empty.every((month) => !month.known), true);
});
