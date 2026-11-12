import { useEffect, useRef, type ComponentRef, type ReactNode, type RefObject } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useData } from '@/lib/store';
import { fmtDateTime, zhMonthDay, type Trend } from '@/lib/metrics';
import { colors, font, radius, space, touch } from './theme';

export type Scroller = ComponentRef<typeof ScrollView>;

const DEFAULT_MOCK = '当前显示的是模拟数据。';

export function Screen({ children, mockNote, scrollRef }: { children: ReactNode; mockNote?: string | null; scrollRef?: RefObject<Scroller | null> }) {
  const { source, error, dismissError, data, today, lastSync } = useData();
  const insets = useSafeAreaInsets();
  const note = mockNote === null ? null : (mockNote ?? DEFAULT_MOCK);
  // 最新一天早于今天：环下的小字日期不够显眼，在页顶说一次数据停在哪天。
  // 只说停在哪，不猜原因（没同步、没戴表都可能）。演练模式的日期是造的，不提示。
  const latest = [...data.sleep.map((s) => s.date), ...data.daily.map((d) => d.date)].sort().at(-1);
  const stale = source !== 'scenario' && latest != null && latest < today
    ? `数据停在 ${zhMonthDay(new Date(`${latest}T00:00:00`))}${lastSync ? `，上次同步 ${fmtDateTime(lastSync)}` : ''}。点右上角刷新。`
    : null;
  return (
    <ScrollView
      ref={scrollRef}
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: insets.bottom + touch + space.xl * 2 }}
    >
      {source === 'scenario' ? (
        <Text style={[styles.banner, { color: colors.fair, fontWeight: '700' }]}>
          演练模式：当前数据是造出来的，不是你的记录。回设置页可退出。
        </Text>
      ) : null}
      {error ? (
        <Pressable accessibilityRole="button" accessibilityLabel="关掉这条提示" onPress={dismissError} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: touch }}>
          <Text style={{ color: colors.poor, fontSize: font.body, lineHeight: 22, flex: 1 }}>{error}</Text>
          <Text style={{ color: colors.poor, fontSize: font.footnote }}>关掉</Text>
        </Pressable>
      ) : null}
      {source === 'mock' && note ? (
        <Text style={{ color: colors.text, fontSize: font.body, fontWeight: '600', lineHeight: 22 }}>{note}</Text>
      ) : null}
      {stale ? (
        <Text style={{ color: colors.text, fontSize: font.body, lineHeight: 22 }}>{stale}</Text>
      ) : null}
      {children}
    </ScrollView>
  );
}

export function LoadingBlock() {
  const bars = [space.xl * 4, space.xl * 5, space.xl * 3];
  return (
    <View accessibilityLabel="正在加载" accessibilityRole="progressbar" style={{ gap: space.md }}>
      {bars.map((height, i) => (
        <View key={i} style={[styles.card, { height, backgroundColor: colors.cardAlt }]} />
      ))}
    </View>
  );
}

export function Card({ children, style, onPress, plain, accessibilityLabel }: { children: ReactNode; style?: ViewStyle; onPress?: () => void; plain?: boolean; accessibilityLabel?: string }) {
  const body = <View style={[plain ? styles.rule : styles.card, style]}>{children}</View>;
  return onPress ? (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      {body}
    </Pressable>
  ) : body;
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.section}>{children}</Text>
      {right}
    </View>
  );
}

export function Muted({ children, style }: { children: ReactNode; style?: object }) {
  return <Text style={[{ color: colors.sub, fontSize: font.subhead, lineHeight: 19 }, style]}>{children}</Text>;
}

export function Big({ children, color = colors.text }: { children: ReactNode; color?: string }) {
  return <Text style={{ color, fontSize: font.display, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{children}</Text>;
}

/** good 表示“这个方向对身体是好事”，用来决定箭头颜色（例如静息心率下降是好事）。neutral 只报方向，不上色。 */
export function TrendBadge({ trend, good, text, neutral }: { trend: Trend; good?: 'up' | 'down'; text?: string; neutral?: boolean }) {
  const arrow = trend === 'up' ? '↑' : trend === 'down' ? '↓' : '·';
  const color = neutral || trend === 'normal' ? colors.sub : trend === good ? colors.good : colors.poor;
  return <Text style={{ color, fontSize: font.subhead, fontWeight: '600' }}>{`${arrow} ${text ?? (trend === 'normal' ? '正常' : '')}`}</Text>;
}

export function MetricTile({ label, value, unit, footer, plain }: { label: string; value: string; unit?: string; footer?: ReactNode; plain?: boolean }) {
  return (
    <View style={plain ? styles.plainTile : styles.tile}>
      <Muted>{label}</Muted>
      <Text style={styles.tileValue}>
        {value}
        {unit ? <Text style={styles.tileUnit}> {unit}</Text> : null}
      </Text>
      {footer}
    </View>
  );
}

export function Row({ children, gap = space.sm }: { children: ReactNode; gap?: number }) {
  return <View style={{ flexDirection: 'row', gap }}>{children}</View>;
}

export function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress?: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      style={({ pressed }) => [styles.chip, active && { backgroundColor: colors.accent, borderColor: colors.accent }, pressed && { opacity: 0.7 }]}
    >
      <Text style={{ color: active ? colors.bg : colors.sub, fontSize: font.subhead, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

/** 决策卡和结算卡互换时淡入。第一次出现不动画；系统开了「减少动态效果」就直接切。 */
export function FadeIn({ children, watch }: { children: ReactNode; watch: string }) {
  const opacity = useRef(new Animated.Value(1)).current;
  const seen = useRef<string | null>(null);
  useEffect(() => {
    if (seen.current === null) {
      seen.current = watch;
      return;
    }
    if (seen.current === watch) return;
    seen.current = watch;
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (!alive) return;
      if (reduce) {
        opacity.setValue(1);
        return;
      }
      opacity.setValue(0);
      Animated.timing(opacity, { toValue: 1, duration: 150, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    });
    return () => { alive = false; };
  }, [watch, opacity]);
  return <Animated.View style={{ opacity }}>{children}</Animated.View>;
}

export function Empty({ text }: { text: string }) {
  return (
    <View style={styles.rule}>
      <Muted>{text}</Muted>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius, padding: space.lg, gap: space.sm, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  rule: { paddingVertical: space.md, gap: space.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  section: { color: colors.text, fontSize: font.title, fontWeight: '700' },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: space.sm },
  tile: { flex: 1, backgroundColor: colors.card, borderRadius: radius, padding: space.md, gap: 2, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  plainTile: { flex: 1, gap: 2 },
  tileValue: { color: colors.text, fontSize: font.metric, fontWeight: '700', fontVariant: ['tabular-nums'] },
  tileUnit: { color: colors.sub, fontSize: font.footnote, fontWeight: '500' },
  chip: { minHeight: touch, paddingHorizontal: space.md, justifyContent: 'center', borderRadius: 999, borderWidth: 1, borderColor: colors.border },
  banner: { color: colors.sub, fontSize: font.footnote, lineHeight: 18 },
});
