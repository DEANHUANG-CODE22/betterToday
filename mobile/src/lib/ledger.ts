/**
 * 每日记录（2026-11-25）：替代手填的「每日训练记录」表。只记不判，不改建议，不进 advice.ts。
 * 一天一行：那天发出的建议、照没照做、早上感觉 1–5、次日 HRV（下一晚醒来那天的夜间 HRV，自动取）。
 */
import type { AdviceLog } from './db.ts';
import { addDays } from './metrics.ts';
import type { ISODate, SleepNight } from './types.ts';

export type Feel = 1 | 2 | 3 | 4 | 5;
export const FEELS: Feel[] = [1, 2, 3, 4, 5];
/** 两头的字，中间三档不写字。这是你给自己打的分，不是 App 的评价。 */
export const FEEL_ENDS = ['很累', '很好'] as const;

export interface LedgerRow {
  date: ISODate;
  /** 那天发出的建议的档位词；没有建议记录时为空。 */
  kind?: AdviceLog['kind'];
  title?: string;
  action?: AdviceLog['userAction'];
  /** 「改一下」时改成了什么。 */
  note?: string;
  feel?: Feel;
  /** 次日 HRV：date + 1 那天醒来的夜间 HRV。还没到或没测到为空。 */
  nextHrv?: number;
}

export function isFeel(v: unknown): v is Feel {
  return v === 1 || v === 2 || v === 3 || v === 4 || v === 5;
}

/** 从今天往前 days 天（含今天），新的在前。 */
export function buildLedger(
  logs: AdviceLog[],
  feelings: Record<ISODate, Feel>,
  sleep: SleepNight[],
  today: ISODate,
  days = 14,
): LedgerRow[] {
  const logBy = new Map(logs.map((l) => [l.date, l]));
  const hrvBy = new Map(sleep.filter((s) => s.hrv != null).map((s) => [s.date, Math.round(s.hrv!)]));
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(today, -i);
    const log = logBy.get(date);
    // 占位行（先点按钮、当天还没算出建议时写的）只有动作，没有建议。
    const issued = log && log.kind !== 'unknown' ? log : undefined;
    return {
      date,
      kind: issued?.kind,
      title: issued?.title,
      action: log?.userAction,
      note: log?.note,
      feel: feelings[date],
      nextHrv: hrvBy.get(addDays(date, 1)),
    };
  });
}

/** 记录页顶上的一句：这几天记了几天感觉、照做了几次。只数，不评价。 */
export function ledgerSummary(rows: LedgerRow[]): string {
  const felt = rows.filter((r) => r.feel != null);
  const acted = rows.filter((r) => r.action);
  const followed = acted.filter((r) => r.action === 'followed').length;
  const avg = felt.length ? Math.round((felt.reduce((s, r) => s + r.feel!, 0) / felt.length) * 10) / 10 : undefined;
  const parts = [
    `${rows.length} 天里记了 ${felt.length} 天感觉${avg != null ? `，平均 ${avg.toFixed(1)}` : ''}`,
    acted.length ? `点过 ${acted.length} 次按钮，照做 ${followed} 次` : '还没点过按钮',
  ];
  return `${parts.join('；')}。`;
}
