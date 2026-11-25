import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { FEEL_ENDS, FEELS, type Feel } from '@/lib/ledger';
import { colors, font, radius, space, touch } from './theme';

/**
 * 一排 1–5。选中的铺正文色、深色字（和 Chip 同一条规矩，橙色留给 Agent）。
 * 再点一次已选的那格就清掉。
 */
export function FeelPicker({ value, onPick }: { value?: Feel; onPick: (v: Feel | null) => void }) {
  return (
    <View style={{ gap: space.xs }}>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        {FEELS.map((v) => {
          const on = value === v;
          return (
            <Pressable
              key={v}
              accessibilityRole="button"
              accessibilityLabel={`早上感觉 ${v} 分${v === 1 ? `，${FEEL_ENDS[0]}` : v === 5 ? `，${FEEL_ENDS[1]}` : ''}`}
              accessibilityState={{ selected: on }}
              onPress={() => onPick(on ? null : v)}
              style={({ pressed }) => ({
                flex: 1,
                minHeight: touch,
                borderRadius: radius,
                borderWidth: 1,
                borderColor: on ? colors.text : colors.border,
                backgroundColor: on ? colors.text : 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text style={{ color: on ? colors.bg : colors.text, fontSize: font.lead, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{v}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ color: colors.sub, fontSize: font.footnote }}>{FEEL_ENDS[0]}</Text>
        <Text style={{ color: colors.sub, fontSize: font.footnote }}>{FEEL_ENDS[1]}</Text>
      </View>
    </View>
  );
}

/**
 * 睡眠页上的「早上感觉」：没记时是一行问题加 1–5；记过之后收成一行「早上感觉 4 / 5 · 改」，
 * 右边是「看记录 ›」进每日记录页。一键：点一格就存，不用确认。
 */
export function MorningFeel({ value, onPick }: { value?: Feel; onPick: (v: Feel | null) => void }) {
  const [editing, setEditing] = useState(false);
  const open = value == null || editing;
  return (
    <View style={{ gap: space.sm, paddingTop: space.sm, borderTopWidth: 1, borderTopColor: colors.border }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: touch }}>
        {open ? (
          <Text style={{ color: colors.text, fontSize: font.callout, fontWeight: '600' }}>今天早上感觉怎么样？</Text>
        ) : (
          <Pressable accessibilityRole="button" accessibilityLabel={`早上感觉 ${value} 分，改一下`} onPress={() => setEditing(true)} style={{ minHeight: touch, justifyContent: 'center' }}>
            <Text style={{ color: colors.text, fontSize: font.callout }}>
              早上感觉 <Text style={{ fontWeight: '700' }}>{value}</Text>
              <Text style={{ color: colors.sub }}> / 5 · 改</Text>
            </Text>
          </Pressable>
        )}
        <Pressable accessibilityRole="link" onPress={() => router.push('/ledger')} style={{ minHeight: touch, justifyContent: 'center', paddingLeft: space.md }}>
          <Text style={{ color: colors.sub, fontSize: font.subhead }}>看记录 ›</Text>
        </Pressable>
      </View>
      {open ? (
        <FeelPicker
          value={value}
          onPick={(v) => {
            onPick(v);
            if (v != null) setEditing(false);
          }}
        />
      ) : null}
    </View>
  );
}
