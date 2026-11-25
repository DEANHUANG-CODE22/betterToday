import { useState } from 'react';
import { Text, View } from 'react-native';
import { splitReason } from '@/lib/agent';
import { spaceZhDates, type Advice, type AdviceAction } from '@/lib/advice';
import { AgentMark, ConfidenceRow, Evidence, type EvidenceItem } from './agent';
import { colors, font, space } from './theme';
import { Chip, Muted } from './ui';

const md = (d: string) => `${Number(d.slice(5, 7))} 月 ${Number(d.slice(8, 10))} 日`;

/**
 * 运动页最上面的判断：贴边铺满，底色按 kind（有氧蓝、强度绿、休息红、回归期黄褐）。
 * 色块已经说了是哪一档，标题整句白字，不再单独涂一个词。
 */
export function AdviceHero({ advice, today }: { advice: Advice; today: string }) {
  return (
    <View style={{ backgroundColor: colors.kindField[advice.kind], paddingHorizontal: space.lg + 4, paddingTop: space.lg, paddingBottom: space.xl, gap: space.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <AgentMark track="rgba(255,255,255,0.3)" dot="#FFFFFF" gap={colors.kindField[advice.kind]} />
        <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: font.subhead, fontWeight: '600' }}>今天 · {md(today)}</Text>
      </View>
      <Text style={{ color: '#FFFFFF', fontSize: font.figure, lineHeight: 44, fontWeight: '800' }}>{spaceZhDates(advice.title)}</Text>
      <Text style={{ color: '#FFFFFF', fontSize: font.title, lineHeight: 24 }}>
        {advice.duration}，{advice.zones}。
      </Text>
      {advice.narrative ? <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: font.body, lineHeight: 21 }}>{spaceZhDates(advice.narrative)}</Text> : null}
    </View>
  );
}

/** 判断下面：把握、它看到的数（依据拆成标签）、你怎么回（三个按钮）。 */
export function AdviceBody({
  advice,
  tip,
  yesterday,
  hitRate,
  action,
  actionNote,
  onAction,
}: {
  advice: Advice;
  tip?: string;
  yesterday?: string;
  hitRate?: string;
  action?: AdviceAction;
  actionNote?: string;
  onAction?: (action: AdviceAction, note?: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <View style={{ gap: space.lg }}>
      <ConfidenceRow level={advice.confidence} tip={tip} />
      <Evidence items={adviceItems(advice, yesterday)} />
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
    </View>
  );
}

/** 依据「人话 —— 参照」拆成标签：人话在前，参照是灰字。最多四条，冲突和昨天那句跟在后面。 */
export function adviceItems(advice: Advice, yesterday?: string): EvidenceItem[] {
  const lines = [...advice.reasons.slice(0, 4), ...(advice.conflicts ?? []), ...(yesterday ? [yesterday] : [])];
  return lines.map((line, i) => {
    const { head, tail } = splitReason(spaceZhDates(line));
    return { key: `r${i}`, label: head, note: tail };
  });
}
