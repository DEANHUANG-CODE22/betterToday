import { Pressable, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { hrvRingMark } from '@/lib/hrvGauge';
import { ChevronIcon } from './icons';
import { colors, font, space, touch } from './theme';

/** 「6 时 21 分」：数字用环里的字号，单位降到 footnote，环里才放得下。没有数字（「没有」）原样。 */
function RingValue({ value }: { value: string }) {
  if (!/\d/.test(value)) return <>{value}</>;
  return (
    <>
      {value.split(/(\d+(?:\.\d+)?)/).filter(Boolean).map((part, i) =>
        /^\d/.test(part)
          ? <Text key={i}>{part}</Text>
          : <Text key={i} style={{ color: colors.sub, fontSize: font.footnote, fontWeight: '500' }}>{part}</Text>,
      )}
    </>
  );
}

/** 一个指标一个环。progress 缺省或为 0 时只留轨道。 */
export function Ring({
  label,
  value,
  progress,
  color,
  when,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  value: string;
  progress?: number;
  color: string;
  when?: string;
  onPress?: () => void;
  accessibilityLabel: string;
}) {
  const size = 96;
  const stroke = 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = progress == null ? 0 : Math.max(0, Math.min(1, progress));
  const body = (
    <View style={{ alignItems: 'center', gap: space.xs, flex: 1, minHeight: touch }}>
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={size} height={size}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.border} strokeWidth={stroke} fill="none" />
          {p > 0 ? (
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              stroke={color}
              strokeWidth={stroke}
              fill="none"
              strokeDasharray={`${c * p} ${c}`}
              strokeLinecap="round"
              rotation={-90}
              origin={`${size / 2}, ${size / 2}`}
            />
          ) : null}
        </Svg>
        <Text style={{ position: 'absolute', color: value === '没有' ? colors.sub : colors.text, fontSize: font.lead, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
          <RingValue value={value} />
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
        <Text style={{ color: colors.sub, fontSize: font.footnote }}>{label}</Text>
        {onPress ? <ChevronIcon color={colors.sub} size={14} /> : null}
      </View>
      {when ? <Text style={{ color: colors.sub, fontSize: font.footnote }}>{when}</Text> : null}
    </View>
  );
  if (!onPress) return <View style={{ flex: 1 }} accessibilityLabel={accessibilityLabel}>{body}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.7 : 1 })}
    >
      {body}
    </Pressable>
  );
}

/** 尺子不用满圈，底端留一道缝，避免过低和过高落到同一个点。 */
const GAUGE_GAP = 0.16;

function gaugeAngle(t: number) {
  const sweep = (1 - GAUGE_GAP) * Math.PI * 2;
  const start = Math.PI / 2 + (GAUGE_GAP * Math.PI * 2) / 2;
  return start + t * sweep;
}

function gaugeArc(cx: number, cy: number, r: number, t0: number, t1: number) {
  const a0 = gaugeAngle(t0);
  const a1 = gaugeAngle(t1);
  const x0 = cx + r * Math.cos(a0);
  const y0 = cy + r * Math.sin(a0);
  const x1 = cx + r * Math.cos(a1);
  const y1 = cy + r * Math.sin(a1);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
}

/** 夜间 HRV。色带是手表给的正常区间，点是当晚的值。环上不写高低，也不写在不在区间里。 */
export function HrvRing({
  label,
  value,
  low,
  high,
  when,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  value: number;
  low: number;
  high: number;
  when?: string;
  onPress?: () => void;
  accessibilityLabel: string;
}) {
  const size = 96;
  const stroke = 8;
  const r = (size - stroke) / 2;
  const mark = hrvRingMark(value, low, high);
  const outside = mark?.outside ?? false;
  const ink = outside ? colors.fair : colors.text;
  const cx = size / 2;
  const cy = size / 2;
  const dot = mark ? { x: cx + r * Math.cos(gaugeAngle(mark.dot)), y: cy + r * Math.sin(gaugeAngle(mark.dot)) } : undefined;
  const body = (
    <View style={{ alignItems: 'center', gap: space.xs, flex: 1, minHeight: touch }}>
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={size} height={size}>
          <Circle cx={cx} cy={cy} r={r} stroke={colors.border} strokeWidth={stroke} fill="none" />
          {mark && mark.bandEnd > mark.bandStart ? (
            <Path d={gaugeArc(cx, cy, r, mark.bandStart, mark.bandEnd)} stroke={colors.blue} strokeWidth={stroke} fill="none" strokeLinecap="round" />
          ) : null}
          {dot ? <Circle cx={dot.x} cy={dot.y} r={7} fill={ink} stroke={colors.card} strokeWidth={2.5} /> : null}
        </Svg>
        <Text style={{ position: 'absolute', color: ink, fontSize: font.lead, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
          {String(Math.round(value))}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
        <Text style={{ color: colors.sub, fontSize: font.footnote }}>{label}</Text>
        {onPress ? <ChevronIcon color={colors.sub} size={14} /> : null}
      </View>
      {when ? <Text style={{ color: colors.sub, fontSize: font.footnote }}>{when}</Text> : null}
    </View>
  );
  if (!onPress) return <View style={{ flex: 1 }} accessibilityLabel={accessibilityLabel}>{body}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.7 : 1 })}
    >
      {body}
    </Pressable>
  );
}
