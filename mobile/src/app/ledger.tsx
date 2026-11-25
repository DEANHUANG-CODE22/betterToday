import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { FeelPicker } from '@/components/feel';
import { colors, font, space, touch } from '@/components/theme';
import { Card, Muted, Screen } from '@/components/ui';
import { buildLedger, ledgerSummary, type LedgerRow } from '@/lib/ledger';
import { useData } from '@/lib/store';

/**
 * 每日记录：替代手填的「每日训练记录」表（2026-11-25）。一天一行，最近 14 天。
 * 只记不判：不算相关、不下结论、不改建议。点一行可以补那天的早上感觉。
 */
const KIND_WORD: Record<string, { word: string; color: string }> = {
  rest: { word: '休息', color: colors.poor },
  recovery: { word: '回归期', color: colors.fair },
  aerobic: { word: '有氧', color: colors.blue },
  intensity: { word: '强度', color: colors.good },
};
const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
const md = (d: string) => `${Number(d.slice(5, 7))} 月 ${Number(d.slice(8, 10))} 日`;
const wk = (d: string) => `周${WEEK[new Date(`${d}T00:00:00`).getDay()]}`;

function actionText(row: LedgerRow): string {
  if (row.action === 'followed') return '照做';
  if (row.action === 'skipped') return '没练';
  if (row.action === 'changed') return row.note ? `改成${row.note}` : '改了';
  return '—';
}

export default function LedgerScreen() {
  const { data, logs, feelings, setFeel, today } = useData();
  const [open, setOpen] = useState<string>();
  const rows = buildLedger(logs, feelings, data.sleep, today);
  return (
    <Screen>
      <Muted>{ledgerSummary(rows)}点一行可以补记那天的早上感觉。</Muted>
      <Card style={{ paddingVertical: space.xs, gap: 0 }}>
        <View style={{ flexDirection: 'row', paddingVertical: space.sm, gap: space.sm }}>
          {['日期', '建议', '照做', '感觉', '次日 HRV'].map((h, i) => (
            <Text key={h} style={{ flex: i === 0 ? 1.4 : 1, color: colors.sub, fontSize: font.footnote, textAlign: i === 0 ? 'left' : 'center' }}>{h}</Text>
          ))}
        </View>
        {rows.map((row) => {
          const kind = row.kind ? KIND_WORD[row.kind] : undefined;
          const expanded = open === row.date;
          return (
            <View key={row.date} style={{ borderTopWidth: 1, borderTopColor: colors.border }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${md(row.date)}，建议${kind?.word ?? '没有'}，${actionText(row)}，早上感觉${row.feel ?? '没记'}，次日 HRV ${row.nextHrv ?? '没有'}。补记感觉`}
                onPress={() => setOpen(expanded ? undefined : row.date)}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', minHeight: touch, gap: space.sm, opacity: pressed ? 0.7 : 1 })}
              >
                <View style={{ flex: 1.4 }}>
                  <Text style={{ color: colors.text, fontSize: font.body }}>{row.date === today ? '今天' : md(row.date)}</Text>
                  <Text style={{ color: colors.sub, fontSize: font.footnote }}>{wk(row.date)}</Text>
                </View>
                <Text style={{ flex: 1, textAlign: 'center', color: kind?.color ?? colors.sub, fontSize: font.body, fontWeight: kind ? '700' : '400' }}>{kind?.word ?? '—'}</Text>
                <Text style={{ flex: 1, textAlign: 'center', color: row.action ? colors.text : colors.sub, fontSize: font.body }}>{actionText(row)}</Text>
                <Text style={{ flex: 1, textAlign: 'center', color: row.feel ? colors.text : colors.sub, fontSize: font.lead, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{row.feel ?? '·'}</Text>
                <Text style={{ flex: 1, textAlign: 'center', color: row.nextHrv ? colors.text : colors.sub, fontSize: font.body, fontVariant: ['tabular-nums'] }}>{row.nextHrv ?? '—'}</Text>
              </Pressable>
              {expanded ? (
                <View style={{ paddingBottom: space.md, gap: space.xs }}>
                  <Muted>{md(row.date)}早上感觉</Muted>
                  <FeelPicker value={row.feel} onPick={(v) => { void setFeel(row.date, v); setOpen(undefined); }} />
                </View>
              ) : null}
            </View>
          );
        })}
      </Card>
      <Muted>次日 HRV 是第二天醒来那晚的夜间 HRV，同步后自动填上。记录只存在这台手机里。</Muted>
    </Screen>
  );
}
