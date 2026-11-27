import { useState, type ReactNode } from 'react';
import { Linking, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Line } from 'react-native-svg';
import { TOPICS, type Facts, type TopicId } from '@/lib/knowledge';
import { ChevronIcon } from './icons';
import { colors, font, space, touch } from './theme';

/**
 * 知识层的界面（2026-11-27）：一条一行，点开看全文。
 * 「你的」一段在最前（它说的，用 Agent 的小字色标题），其余是固定说明。
 */
export function TopicRow({ id, facts, open: initiallyOpen, first }: { id: TopicId; facts: Facts; open?: boolean; first?: boolean }) {
  const [open, setOpen] = useState(!!initiallyOpen);
  const t = TOPICS[id];
  const yours = t.yours(facts);
  return (
    <View style={{ borderTopWidth: first ? 0 : 1, borderTopColor: colors.border }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${t.title}，${open ? '收起' : '展开说明'}`}
        onPress={() => setOpen((v) => !v)}
        style={({ pressed }) => ({ minHeight: touch, flexDirection: 'row', alignItems: 'center', gap: space.sm, opacity: pressed ? 0.7 : 1 })}
      >
        <Text style={{ flex: 1, color: colors.text, fontSize: font.callout, fontWeight: '600' }}>{t.title}</Text>
        <View style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }}>
          <ChevronIcon color={colors.sub} size={16} />
        </View>
      </Pressable>
      {open ? (
        <View style={{ gap: space.md, paddingBottom: space.lg }}>
          {yours ? <Section label="你的" labelColor={colors.agentText} body={yours} strong /> : null}
          <Section label="是什么" body={t.what} />
          <Section label="对跑步意味着什么" body={t.forRunning} />
          <Section label="什么会让它变" body={t.changes} />
          {t.doctor ? <Section label="什么时候该找医生" body={t.doctor} /> : null}
          <View style={{ gap: 2 }}>
            <Text style={{ color: colors.sub, fontSize: font.footnote }}>来源</Text>
            {t.sources.map((s) =>
              s.url ? (
                <Pressable key={s.label} accessibilityRole="link" onPress={() => { void Linking.openURL(s.url!); }} hitSlop={6}>
                  <Text style={{ color: colors.blue, fontSize: font.footnote, lineHeight: 18 }}>{s.label} ›</Text>
                </Pressable>
              ) : (
                <Text key={s.label} style={{ color: colors.sub, fontSize: font.footnote, lineHeight: 18 }}>{s.label}</Text>
              ),
            )}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function Section({ label, body, labelColor, strong }: { label: string; body: string; labelColor?: string; strong?: boolean }) {
  return (
    <View style={{ gap: 2 }}>
      <Text style={{ color: labelColor ?? colors.sub, fontSize: font.footnote, fontWeight: labelColor ? '600' : '400' }}>{label}</Text>
      <Text style={{ color: strong ? colors.text : colors.textSoft, fontSize: font.body, lineHeight: 21 }}>{body}</Text>
    </View>
  );
}

/** 一组条目。 */
export function TopicList({ ids, facts, openFirst }: { ids: readonly TopicId[]; facts: Facts; openFirst?: boolean }) {
  return (
    <View>
      {ids.map((id, i) => <TopicRow key={id} id={id} facts={facts} open={openFirst && i === 0} first={i === 0} />)}
    </View>
  );
}

/** 底部弹出的半屏面板，「问一句」和 ⓘ 共用。 */
export function Sheet({ visible, onClose, title, mark, children }: { visible: boolean; onClose: () => void; title: string; mark?: ReactNode; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable accessibilityLabel="关掉" onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }} />
      <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: insets.bottom + space.lg, maxHeight: '80%', gap: space.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          {mark}
          <Text style={{ flex: 1, color: colors.text, fontSize: font.title, fontWeight: '700' }}>{title}</Text>
          <Pressable accessibilityRole="button" onPress={onClose} style={{ minWidth: touch, minHeight: touch, alignItems: 'flex-end', justifyContent: 'center' }}>
            <Text style={{ color: colors.sub, fontSize: font.body }}>关掉</Text>
          </Pressable>
        </View>
        <ScrollView style={{ flexGrow: 0 }}>{children}</ScrollView>
      </View>
    </Modal>
  );
}

/** ⓘ：仪表卡片角上的说明入口，点开只列这张卡相关的条目，第一条展开。 */
/** label 有值时是一行「文字 ⓘ」，靠右，放在卡片底部；没有时只有图标。 */
export function InfoButton({ ids, facts, title, style, label }: { ids: readonly TopicId[]; facts: Facts; title: string; style?: object; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}的说明`}
        onPress={() => setOpen(true)}
        hitSlop={8}
        style={({ pressed }) => [label ? { alignSelf: 'flex-end', minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: space.xs, opacity: pressed ? 0.6 : 1 } : { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 }, style]}
      >
        {label ? <Text style={{ color: colors.sub, fontSize: font.footnote }}>{label}</Text> : null}
        <Svg width={18} height={18} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no">
          <Circle cx={12} cy={12} r={9.5} fill="none" stroke={colors.sub} strokeWidth={1.8} />
          <Line x1={12} y1={11} x2={12} y2={17} stroke={colors.sub} strokeWidth={2} strokeLinecap="round" />
          <Circle cx={12} cy={7.5} r={1.3} fill={colors.sub} />
        </Svg>
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)} title={title}>
        <TopicList ids={ids} facts={facts} openFirst />
      </Sheet>
    </>
  );
}
