import { useState } from 'react';
import { Text, View } from 'react-native';
import type { Advice, AdviceAction } from '@/lib/advice';
import { colors, font, space } from './theme';
import { Card, Chip, Muted } from './ui';

const TONE: Record<Advice['kind'], string> = {
  unknown: colors.sub,
  rest: colors.poor,
  recovery: colors.fair,
  aerobic: colors.blue,
  intensity: colors.good,
};

const CONFIDENCE = { high: '把握高', medium: '把握中', low: '把握低' };

function Verdict({ title, tone }: { title: string; tone: string }) {
  const match = title.match(/有氧|强度|休息/);
  if (!match || match.index == null) {
    return <Text style={{ flex: 1, color: colors.text, fontSize: font.metric, fontWeight: '800', lineHeight: 30 }}>{title}</Text>;
  }
  const at = match.index;
  return (
    <Text style={{ flex: 1, color: colors.text, fontSize: font.metric, fontWeight: '800', lineHeight: 30 }}>
      {title.slice(0, at)}
      <Text style={{ color: tone }}>{match[0]}</Text>
      {title.slice(at + match[0].length)}
    </Text>
  );
}

export function AdviceCard({
  advice,
  yesterday,
  hitRate,
  action,
  actionNote,
  onAction,
}: {
  advice: Advice;
  yesterday?: string;
  hitRate?: string;
  action?: AdviceAction;
  actionNote?: string;
  onAction?: (action: AdviceAction, note?: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const tone = TONE[advice.kind];
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.md }}>
        <Verdict title={advice.title} tone={tone} />
        <Text style={{ color: colors.sub, fontSize: font.subhead, lineHeight: 30 }}>{CONFIDENCE[advice.confidence]}</Text>
      </View>
      <Muted>时长 {advice.duration} · 强度 {advice.zones}</Muted>
      <Text style={{ color: colors.text, fontSize: font.body, lineHeight: 22 }}>{advice.narrative}</Text>
      <View style={{ gap: space.xs }}>
        {advice.reasons.slice(0, 4).map((r) => (
          <Muted key={r}>· {r}</Muted>
        ))}
        {advice.conflicts?.map((r) => (
          <Muted key={r}>· {r}</Muted>
        ))}
        {yesterday ? <Muted>· {yesterday}</Muted> : null}
      </View>
      {hitRate ? <Muted>{hitRate}</Muted> : null}
      {onAction && advice.kind !== 'unknown' && (
        <View style={{ gap: space.sm }}>
          <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
            <Chip label="做完了" active={action === 'followed'} onPress={() => onAction('followed')} />
            <Chip label="改一下" active={action === 'changed'} onPress={() => setEditing((v) => !v)} />
            <Chip label="今天不练" active={action === 'skipped'} onPress={() => onAction('skipped')} />
          </View>
          {editing && (
            <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
              {(['休息', '有氧', '强度'] as const).map((choice) => (
                <Chip key={choice} label={choice} active={action === 'changed' && actionNote === choice} onPress={() => { onAction('changed', choice); setEditing(false); }} />
              ))}
            </View>
          )}
        </View>
      )}
    </Card>
  );
}
