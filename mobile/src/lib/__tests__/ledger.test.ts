/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLedger, isFeel, ledgerSummary } from '../ledger.ts';
import type { AdviceLog } from '../db.ts';
import type { SleepNight } from '../types.ts';

const log = (date: string, extra: Partial<AdviceLog> = {}): AdviceLog => ({
  date, kind: 'aerobic', title: '今天有氧', duration: '45–75 分钟', zones: 'Z2', narrative: '', confidence: 'high', ...extra,
});
const night = (date: string, hrv?: number) => ({ date, hrv, totalMin: 400 }) as SleepNight;

test('buildLedger：新的在前，次日 HRV 取下一天醒来那晚', () => {
  const rows = buildLedger(
    [log('2026-11-24', { userAction: 'followed' }), log('2026-11-25')],
    { '2026-11-24': 4 },
    [night('2026-11-25', 58.4), night('2026-11-24', 50)],
    '2026-11-25',
    3,
  );
  assert.deepEqual(rows.map((r) => r.date), ['2026-11-25', '2026-11-24', '2026-11-23']);
  assert.equal(rows[1].feel, 4);
  assert.equal(rows[1].action, 'followed');
  assert.equal(rows[1].nextHrv, 58);
  assert.equal(rows[0].nextHrv, undefined);
  assert.equal(rows[2].kind, undefined);
});

test('buildLedger：先点按钮写下的占位行只算动作，不算建议', () => {
  const [row] = buildLedger([log('2026-11-25', { kind: 'unknown', title: '—', userAction: 'skipped' })], {}, [], '2026-11-25', 1);
  assert.equal(row.kind, undefined);
  assert.equal(row.action, 'skipped');
});

test('ledgerSummary：只数，不评价', () => {
  const rows = buildLedger([log('2026-11-25', { userAction: 'followed' }), log('2026-11-24', { userAction: 'changed', note: '休息' })], { '2026-11-25': 4, '2026-11-24': 3 }, [], '2026-11-25', 2);
  assert.equal(ledgerSummary(rows), '2 天里记了 2 天感觉，平均 3.5；点过 2 次按钮，照做 1 次。');
  assert.equal(ledgerSummary(buildLedger([], {}, [], '2026-11-25', 3)), '3 天里记了 0 天感觉；还没点过按钮。');
});

test('isFeel', () => {
  assert.ok(isFeel(3));
  assert.ok(!isFeel(0));
  assert.ok(!isFeel(6));
  assert.ok(!isFeel('3'));
});
