import { useState } from 'react';
import { Text, View } from 'react-native';
import { spaceZhDates, type Advice, type AdviceAction } from '@/lib/advice';
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

/**
 * 只涂这个判断自己的那个词。按 kind 找词，不按标题里先出现哪个词：
 * 「今天别上强度」是休息，「今天不追强度」是有氧，被否定的「强度」不能上色。
 */
const KIND_WORD: Partial<Record<Advice['kind'], string>> = {
  rest: '休息',
  aerobic: '有氧',
  intensity: '强度',
};

function Verdict({ title: raw, kind, tone }: { title: string; kind: Advice['kind']; tone: string }) {
  const title = spaceZhDates(raw);
  const word = KIND_WORD[kind];
  const at = word ? title.indexOf(word) : -1;
  if (!word || at < 0) {
    return <Text style={{ flex: 1, color: colors.text, fontSize: font.metric, fontWeight: '800', lineHeight: 30 }}>{title}</Text>;
  }
  return (
    <Text style={{ flex: 1, color: colors.text, fontSize: font.metric, fontWeight: '800', lineHeight: 30 }}>
      {title.slice(0, at)}
      <Text style={{ color: tone }}>{word}</Text>
      {title.slice(at + word.length)}
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
        <Verdict title={advice.title} kind={advice.kind} tone={tone} />
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
