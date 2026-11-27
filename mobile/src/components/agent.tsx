import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { CONFIDENCE_BARS, CONFIDENCE_LABEL } from '@/lib/agent';
import type { Confidence } from '@/lib/advice';
import type { Facts, TopicId } from '@/lib/knowledge';
import { Sheet, TopicList } from './knowledge';
import { BAR_GAP, BAR_H, glassStyle, useTabChrome } from './tabChrome';
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

/** 「我看到的数」：一排小标签，能点的进趋势或详情。 */
export function Evidence({ items, title = '我看到的数' }: { items: EvidenceItem[]; title?: string }) {
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
 * 打开是面板：先列这一页它看到的数（手机本地拼），再列「这些数是什么」的知识条目（2026-11-27）。
 * 不请求模型；问答以后接上，也只能引用这两部分。
 */
export function AskButton({ page, items, topics, facts }: { page: string; items: EvidenceItem[]; topics?: readonly TopicId[]; facts?: Facts }) {
  const [open, setOpen] = useState(false);
  const chrome = useTabChrome();
  const insets = useSafeAreaInsets();
  // 固定在底栏上方：缩起后也不往下落，免得落在原来「运动」的位置被误点（0.1.45）。不在 Tab 里就贴底。
  const bottom = chrome ? insets.bottom + BAR_GAP + BAR_H + space.md : space.lg;
  return (
    <>
      <View style={{ position: 'absolute', right: space.lg, bottom }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="问一句，先看我看到的数和说明"
          onPress={() => setOpen(true)}
          style={({ pressed }) => [glassStyle(touch / 2), {
            minHeight: touch,
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.sm,
            paddingHorizontal: space.lg + 2,
            borderWidth: 1.5,
            borderColor: colors.agent,
            opacity: pressed ? 0.8 : 1,
          }]}
        >
          <AgentMark size={18} gap={colors.card} />
          <Text style={{ color: colors.text, fontSize: font.callout, fontWeight: '700' }}>问一句</Text>
        </Pressable>
      </View>
      <Sheet visible={open} onClose={() => setOpen(false)} title={`问一句 · ${page}`} mark={<AgentMark />}>
        <View style={{ gap: space.md }}>
          <Text style={{ color: colors.textSoft, fontSize: font.body, lineHeight: 21 }}>我回答时只看这些数和下面的说明。</Text>
          <View>
            <Text style={{ color: colors.sub, fontSize: font.footnote }}>我看到的数</Text>
            {items.map((item, i) => (
              <View key={item.key} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.md, paddingVertical: space.md, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.border }}>
                <Text style={{ color: colors.sub, fontSize: font.body }}>{item.label}</Text>
                <Text style={{ flexShrink: 1, textAlign: 'right', color: item.missing ? colors.sub : item.tone ?? colors.text, fontSize: font.body, fontWeight: item.missing ? '400' : '600' }}>
                  {item.value ?? (item.missing ? '没有' : '')}
                  {item.note ? <Text style={{ color: colors.sub, fontWeight: '400' }}>{item.value || item.missing ? '  ' : ''}{item.note}</Text> : null}
                </Text>
              </View>
            ))}
          </View>
          {topics?.length && facts ? (
            <View>
              <Text style={{ color: colors.sub, fontSize: font.footnote }}>这些数是什么</Text>
              <TopicList ids={topics} facts={facts} />
            </View>
          ) : null}
          <Text style={{ color: colors.sub, fontSize: font.footnote, lineHeight: 18 }}>
            以后可以直接问我「为什么是这个建议」「今天想换个练法」，现在先看这些。
          </Text>
        </View>
      </Sheet>
    </>
  );
}
