import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { ARC, arcPath, polar, SEMI, stressBand, zoneOf } from '@/lib/gauge';
import { colors, font, space } from './theme';

/**
 * E 版仪表（2026-11-19）。规矩：
 * - 刻度只来自你自己的历史、手表的区间、规则的门槛。
 * - 睡眠、日常两页只用测量色（蓝、白、睡眠蓝），出区间用黄；红黄警戒段只在运动页，它们就是规则门槛。
 * - 橙色不进仪表，留给 Agent。缺的数轨道调暗，写「没有」。有数就至少画一小段（超出量程也看得见）。
 */

type Press = { onPress?: () => void; accessibilityLabel: string };

function Pressed({ onPress, accessibilityLabel, children }: Press & { children: ReactNode }) {
  if (!onPress) {
    return <View accessible accessibilityLabel={accessibilityLabel} style={{ flex: 1, alignItems: 'center', gap: 2 }}>{children}</View>;
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => ({ flex: 1, alignItems: 'center', gap: 2, opacity: pressed ? 0.7 : 1 })}
    >
      {children}
    </Pressable>
  );
}

/**
 * 270° 弧形表。fraction 为空时只画虚线轨道。
 * band：在弧上标一段区间（手表的 HRV 区间），bandLabels 把两头的数写在弧外；tick：一根短刻线（基线）；dot：只标一个点、不画填充。
 */
export function ArcGauge({
  fraction,
  color,
  band,
  tick,
  dot,
  bandLabels,
  center,
  label,
  caption,
  missing,
  ...press
}: Press & {
  /** 没有这个数：轨道画成虚线。 */
  missing?: boolean;
  fraction?: number;
  color: string;
  band?: [number, number];
  bandLabels?: [string, string];
  tick?: number;
  dot?: { at: number; color: string };
  center: ReactNode;
  label: string;
  caption?: string;
}) {
  const size = 100;
  const c = size / 2;
  // 留出弧外写区间两头数字的地方。
  const r = 35;
  const at = (f: number) => ARC.start + ARC.sweep * f;
  return (
    <Pressed {...press}>
      <View style={{ width: size, height: size - 8 }}>
        <Svg width={size} height={size} accessibilityElementsHidden importantForAccessibility="no">
          {/* 缺数：轨道整条调暗，不用虚线（圆头虚线在小尺寸上像一串珠子）。 */}
          <Path d={arcPath(c, c, r, ARC.start, ARC.start + ARC.sweep)} stroke={colors.border} strokeOpacity={missing ? 0.5 : 1} strokeWidth={9} strokeLinecap="round" fill="none" />
          {band ? <Path d={arcPath(c, c, r, at(band[0]), at(band[1]))} stroke={colors.blue} strokeOpacity={0.45} strokeWidth={9} fill="none" /> : null}
          {fraction != null && fraction > 0 ? <Path d={arcPath(c, c, r, ARC.start, at(fraction))} stroke={color} strokeWidth={9} strokeLinecap="round" fill="none" /> : null}
          {tick != null ? (() => {
            // 从弧的内沿往外画，不伸进中心压住数字（0.1.45）。
            const [x1, y1] = polar(c, c, r - 5, at(tick));
            const [x2, y2] = polar(c, c, r + 10, at(tick));
            return <Line x1={x1} y1={y1} x2={x2} y2={y2} stroke={colors.text} strokeWidth={2} />;
          })() : null}
          {band && bandLabels ? band.map((f, i) => {
            const [x, y] = polar(c, c, r + 12, at(f));
            return <SvgText key={i} x={x} y={y + 4} fontSize={10} fill={colors.sub} textAnchor="middle">{bandLabels[i]}</SvgText>;
          }) : null}
          {dot ? (() => {
            const [x, y] = polar(c, c, r, at(dot.at));
            return <Circle cx={x} cy={y} r={7} fill={dot.color} stroke={colors.card} strokeWidth={3} />;
          })() : null}
        </Svg>
        <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 8, alignItems: 'center', justifyContent: 'center' }}>{center}</View>
      </View>
      <Text style={{ color: colors.sub, fontSize: font.subhead }}>{label}{press.onPress ? ' ›' : ''}</Text>
      {caption ? <Text style={{ color: colors.sub, fontSize: font.footnote, textAlign: 'center' }}>{caption}</Text> : null}
    </Pressed>
  );
}

/**
 * 半圆表。zones：规则的警戒段，直接涂在轨道上（淡）；值落进哪一段，填充就用那一段的颜色，否则测量蓝。
 * marks：规则门槛的刻线。
 */
export function SemiGauge({
  fraction,
  valueText,
  zones,
  marks,
  label,
  caption,
  ...press
}: Press & {
  fraction?: number;
  valueText: string;
  zones?: { from: number; to: number; color: string }[];
  marks?: number[];
  label: string;
  caption?: string;
}) {
  const w = 110;
  const cx = w / 2;
  const cy = 58;
  const r = 40;
  const at = (f: number) => SEMI.start + SEMI.sweep * f;
  const missing = fraction == null;
  const shown = fraction == null ? undefined : Math.max(fraction, 0.03);
  return (
    <Pressed {...press}>
      <Svg width={w} height={66} accessibilityElementsHidden importantForAccessibility="no">
        <Path d={arcPath(cx, cy, r, SEMI.start, SEMI.start + SEMI.sweep)} stroke={colors.border} strokeOpacity={missing ? 0.5 : 1} strokeWidth={9} strokeLinecap="round" fill="none" />
        {!missing ? zones?.map((z) => <Path key={`${z.from}-${z.to}`} d={arcPath(cx, cy, r, at(z.from), at(z.to))} stroke={z.color} strokeOpacity={0.35} strokeWidth={9} fill="none" />) : null}
        {/* 外圈再描一道实色细带：填充从左起会盖住轨道上的警戒段（状态值），外圈这道始终看得见。 */}
        {zones?.map((z) => <Path key={`o-${z.from}-${z.to}`} d={arcPath(cx, cy, r + 8, at(z.from), at(z.to))} stroke={z.color} strokeWidth={3} fill="none" />)}
        {/* 有数就至少画一小段：值低于量程下限（状态值 −42 对 −40）时 frac 夹成 0，以前整块表没填充，最危险的数反而看不见（2026-11-25 走查）。 */}
        {shown != null ? <Path d={arcPath(cx, cy, r, SEMI.start, at(shown))} stroke={zoneOf(shown, zones)?.color ?? colors.blue} strokeWidth={9} strokeLinecap="round" fill="none" /> : null}
        {marks?.map((m) => {
          const [x1, y1] = polar(cx, cy, r - 8, at(m));
          const [x2, y2] = polar(cx, cy, r + 10, at(m));
          return <Line key={m} x1={x1} y1={y1} x2={x2} y2={y2} stroke={colors.text} strokeWidth={1.5} />;
        })}
        <SvgText x={cx} y={cy + 4} fontSize={missing ? 15 : 20} fontWeight="700" fill={missing ? colors.sub : colors.text} textAnchor="middle">{valueText}</SvgText>
      </Svg>
      <Text style={{ color: colors.text, fontSize: font.subhead }}>{label}{press.onPress ? ' ›' : ''}</Text>
      {caption ? <Text style={{ color: colors.sub, fontSize: font.footnote, textAlign: 'center' }}>{caption}</Text> : null}
    </Pressed>
  );
}

/**
 * 24 小时压力表盘：每小时一根，从内圈往外长，长度 = 那一小时的平均压力（0–100），
 * 颜色按四段（0–25、26–50、51–75、76–100，`colors.stress`）。没采到的小时只留短灰点。
 */
/** 表盘下面的四段图例，只写数，不写「放松 / 高」这类评价。 */
export function StressLegend() {
  const labels = ['0–25', '26–50', '51–75', '76–100'];
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: space.md }}>
      {labels.map((label, i) => (
        <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
          <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: colors.stress[i] }} />
          <Text style={{ color: colors.sub, fontSize: font.footnote }}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

export function StressDial({ hours, center }: { hours: (number | undefined)[]; center: ReactNode }) {
  const size = 220;
  const c = size / 2;
  const r0 = 58;
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} accessibilityElementsHidden importantForAccessibility="no">
        <Circle cx={c} cy={c} r={r0 - 6} stroke={colors.border} strokeWidth={1} fill="none" />
        {[0, 6, 12, 18].map((h) => {
          const [x, y] = polar(c, c, r0 - 18, h * 15 - 90);
          return <SvgText key={h} x={x} y={y + 4} fontSize={10} fill={colors.sub} textAnchor="middle">{h}</SvgText>;
        })}
        {hours.map((v, h) => {
          const deg = h * 15 - 90 + 7.5;
          const len = v == null ? 3 : Math.max(3, (v / 100) * 46);
          const [x1, y1] = polar(c, c, r0, deg);
          const [x2, y2] = polar(c, c, r0 + len, deg);
          return <Line key={h} x1={x1} y1={y1} x2={x2} y2={y2} stroke={v == null ? colors.borderStrong : colors.stress[stressBand(v)]} strokeWidth={7} strokeLinecap="round" />;
        })}
      </Svg>
      <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>{center}</View>
    </View>
  );
}

/** 横向刻度条：一条轨道，可选一段区间（基线 ±5%）、一根刻线（28 日平均），值是一个点或一段填充。 */
export function MeterBar({
  value,
  band,
  tick,
  fill,
  ends,
  note,
}: {
  value?: number;
  band?: [number, number];
  tick?: number;
  /** true：从 0 填到值（步数）；false：只画一个点（静息心率）。 */
  fill?: boolean;
  ends: [string, string];
  note?: string;
}) {
  const w = 300;
  const x = (f: number) => Math.max(6, Math.min(w - 6, f * w));
  return (
    <View style={{ gap: space.xs }}>
      <Svg width="100%" height={16} viewBox={`0 0 ${w} 16`} preserveAspectRatio="none" accessibilityElementsHidden importantForAccessibility="no">
        <Rect x={0} y={6} width={w} height={4} rx={2} fill={colors.border} />
        {band ? <Rect x={x(band[0])} y={4} width={Math.max(2, x(band[1]) - x(band[0]))} height={8} rx={2} fill={colors.blue} fillOpacity={0.35} /> : null}
        {fill && value != null ? <Rect x={0} y={6} width={x(value)} height={4} rx={2} fill={colors.text} /> : null}
        {tick != null ? <Line x1={x(tick)} y1={1} x2={x(tick)} y2={15} stroke={colors.sub} strokeWidth={2} /> : null}
        {!fill && value != null ? <Circle cx={x(value)} cy={8} r={6} fill={colors.text} stroke={colors.card} strokeWidth={2} /> : null}
      </Svg>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ color: colors.sub, fontSize: font.caption }}>{ends[0]}</Text>
        {note ? <Text style={{ color: colors.sub, fontSize: font.caption }}>{note}</Text> : null}
        <Text style={{ color: colors.sub, fontSize: font.caption }}>{ends[1]}</Text>
      </View>
    </View>
  );
}
