import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { CONFIDENCE_BARS, CONFIDENCE_LABEL } from '@/lib/agent';
import type { Confidence } from '@/lib/advice';
import { colors, font, space, touch } from './theme';

/**
 * Agent 的标记：和应用图标同一个「环与点」，缩小。Agent 开口的地方才出现。
 * track 传色带下面的轨道色（放在蓝色判断底上时要换浅一点）。
 */
export function AgentMark({ size = 24, track = colors.border, dot = colors.text, gap = colors.bg }: { size?: number; track?: string; dot?: string | null; gap?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 108 108" accessibilityElementsHidden importantForAccessibility="no">
      <Circle cx={54} cy={54} r={34} fill="none" stroke={track} strokeWidth={12} />
      <Circle cx={54} cy={54} r={34} fill="none" stroke={colors.agent} strokeWidth={12} strokeLinecap="round" strokeDasharray="60 214" transform="rotate(-130 54 54)" />
      {/* 点要大到小尺寸也看得见，不然整个标记像加载转圈。外圈一道底色缝，和应用图标一样。 */}
      {dot ? <Circle cx={60} cy={20.5} r={16} fill={dot} stroke={gap} strokeWidth={7} /> : null}
    </Svg>
  );
}

/** 每页最上面那一句：标记 + 它看的是哪天 + 结论 + 一两句补充。 */
export function AgentVoice({ by, title, body, action }: { by: string; title: string; body?: string; action?: { label: string; onPress: () => void } }) {
  return (
    <View style={{ gap: space.sm }} accessibilityRole="summary">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <AgentMark />
        <Text style={{ color: colors.agentText, fontSize: font.subhead, fontWeight: '600' }}>{by}</Text>
      </View>
      <Text style={{ color: colors.text, fontSize: font.display, lineHeight: 38, fontWeight: '700' }}>{title}</Text>
      {body ? <Text style={{ color: colors.textSoft, fontSize: font.callout, lineHeight: 22 }}>{body}</Text> : null}
      {action ? (
        <Pressable accessibilityRole="link" onPress={action.onPress} hitSlop={8} style={({ pressed }) => ({ alignSelf: 'flex-start', minHeight: 36, justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
          <Text style={{ color: colors.agentText, fontSize: font.callout, fontWeight: '600' }}>{action.label} ›</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export interface EvidenceItem {
  key: string;
  label: string;
  value?: string;
  /** 跟在数后面的灰字：日期、区间、单位。 */
  note?: string;
  /** 数的颜色。只给有含义的：出区间用黄。 */
  tone?: string;
  /** 缺的数：虚线框，灰字，说清楚缺了。 */
  missing?: boolean;
  onPress?: () => void;
}

/** 「它看到的数」：一排小标签，能点的进趋势或详情。 */
export function Evidence({ items, title = '它看到的数' }: { items: EvidenceItem[]; title?: string }) {
  if (!items.length) return null;
  return (
    <View style={{ gap: space.sm }}>
      <Text style={{ color: colors.sub, fontSize: font.footnote }}>{title}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {items.map((item) => <EvidenceChip key={item.key} item={item} />)}
      </View>
    </View>
  );
}

function EvidenceChip({ item }: { item: EvidenceItem }) {
  const body = (
    <Text style={{ color: item.missing ? colors.sub : colors.text, fontSize: font.subhead }}>
      {item.label}
      {item.value ? <Text style={{ fontWeight: '700', color: item.tone ?? colors.text }}> {item.value}</Text> : null}
      {item.note ? <Text style={{ color: colors.sub }}> · {item.note}</Text> : null}
    </Text>
  );
  const box = {
    minHeight: 36,
    justifyContent: 'center' as const,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: item.missing ? ('dashed' as const) : ('solid' as const),
    borderColor: item.missing ? colors.borderStrong : colors.border,
    backgroundColor: item.missing ? 'transparent' : colors.cardAlt,
  };
  if (!item.onPress) return <View style={box}>{body}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.label}${item.value ? ` ${item.value}` : ''}${item.note ? `，${item.note}` : ''}，查看`}
      onPress={item.onPress}
      hitSlop={6}
      style={({ pressed }) => [box, { opacity: pressed ? 0.7 : 1 }]}
    >
      {body}
    </Pressable>
  );
}

/** 把握：三格，亮几格；后面一句缺什么、补上什么就能更确定。 */
export function ConfidenceRow({ level, tip, onDark }: { level: Confidence; tip?: string; onDark?: boolean }) {
  const lit = CONFIDENCE_BARS[level];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.md }}>
      <View
        accessible
        accessibilityLabel={`${CONFIDENCE_LABEL[level]}，三格亮 ${lit} 格`}
        style={{ flexDirection: 'row', gap: 3, paddingTop: 7 }}
      >
        {[0, 1, 2].map((i) => (
          <View key={i} style={{ width: 18, height: 6, borderRadius: 3, backgroundColor: i < lit ? colors.agent : onDark ? 'rgba(255,255,255,0.25)' : colors.border }} />
        ))}
      </View>
      <Text style={{ flex: 1, color: onDark ? '#FFFFFF' : colors.textSoft, fontSize: font.subhead, lineHeight: 20 }}>
        {CONFIDENCE_LABEL[level]}
        {tip ? `：${tip}` : '。'}
      </Text>
    </View>
  );
}

/**
 * 「问一句」：三页同一颗，浮在右下角，不进底栏（PRD §17）。
 * 这一版只打开面板列出它看到的数，由手机本地拼，不请求模型；问答下一版接上。
 */
export function AskButton({ page, items }: { page: string; items: EvidenceItem[] }) {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="问一句，先看它看到的数"
        onPress={() => setOpen(true)}
        style={({ pressed }) => ({
          position: 'absolute',
          right: space.lg,
          bottom: space.lg,
          minHeight: touch,
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.sm,
          paddingHorizontal: space.lg + 2,
          borderRadius: touch / 2,
          borderWidth: 1.5,
          borderColor: colors.agent,
          backgroundColor: colors.cardAlt,
          opacity: pressed ? 0.8 : 1,
        })}
      >
        <AgentMark size={18} dot={null} />
        <Text style={{ color: colors.text, fontSize: font.callout, fontWeight: '700' }}>问一句</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable accessibilityLabel="关掉" onPress={() => setOpen(false)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }} />
        <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: insets.bottom + space.lg, maxHeight: '75%', gap: space.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <AgentMark />
            <Text style={{ flex: 1, color: colors.text, fontSize: font.title, fontWeight: '700' }}>问一句 · {page}</Text>
            <Pressable accessibilityRole="button" onPress={() => setOpen(false)} style={{ minWidth: touch, minHeight: touch, alignItems: 'flex-end', justifyContent: 'center' }}>
              <Text style={{ color: colors.sub, fontSize: font.body }}>关掉</Text>
            </Pressable>
          </View>
          <Text style={{ color: colors.textSoft, fontSize: font.body, lineHeight: 21 }}>我回答时只看这些数，下面就是它们。</Text>
          <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 0 }}>
            {items.map((item, i) => (
              <View key={item.key} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.md, paddingVertical: space.md, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.border }}>
                <Text style={{ color: colors.sub, fontSize: font.body }}>{item.label}</Text>
                <Text style={{ flexShrink: 1, textAlign: 'right', color: item.missing ? colors.sub : item.tone ?? colors.text, fontSize: font.body, fontWeight: item.missing ? '400' : '600' }}>
                  {item.value ?? (item.missing ? '没有' : '')}
                  {item.note ? <Text style={{ color: colors.sub, fontWeight: '400' }}>{item.value || item.missing ? '  ' : ''}{item.note}</Text> : null}
                </Text>
              </View>
            ))}
          </ScrollView>
          <Text style={{ color: colors.sub, fontSize: font.footnote, lineHeight: 18 }}>
            下一版接上问答：「为什么是这个建议」「我想今天换个练法」。现在先看数。
          </Text>
        </View>
      </Modal>
    </>
  );
}
