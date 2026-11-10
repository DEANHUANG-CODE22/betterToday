import { useState } from 'react';
import { ScrollView, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { colors, font, space } from './theme';

function useWidth(): [number, (e: LayoutChangeEvent) => void] {
  const [w, setW] = useState(0);
  return [w, (e) => setW(e.nativeEvent.layout.width)];
}

export interface Series {
  values: (number | undefined)[];
  color: string;
  label?: string;
  dashed?: boolean;
}

function bandRuns(low: (number | undefined)[], high: (number | undefined)[]): number[][] {
  const runs: number[][] = [];
  let run: number[] = [];
  const flush = () => {
    if (run.length >= 2) runs.push(run);
    run = [];
  };
  for (let i = 0; i < Math.max(low.length, high.length); i += 1) {
    if (low[i] == null || high[i] == null) flush();
    else run.push(i);
  }
  flush();
  return runs;
}

function axisLeft(samples: string[]) {
  const longest = samples.reduce((n, s) => Math.max(n, s.length), 0);
  return Math.max(font.micro * 4, longest * (font.micro - 1));
}

/** 多序列折线图。invert 用于配速这类“越小越好”的指标，让好的方向朝上。minSpan 避免数据几乎不动时纵轴被放大。 */
export function LineChart({
  series,
  height = 120,
  labels,
  invert,
  format = (v) => String(Math.round(v)),
  minSpan,
  domain,
  accessibilityLabel,
  selectHint,
  band,
  marks,
  bars,
  selected,
  onSelect,
}: {
  series: Series[];
  height?: number;
  labels?: [string, string];
  invert?: boolean;
  format?: (v: number) => string;
  minSpan?: number;
  /** 固定纵轴。压力用 0–100，避免安静的一天被拉满整张图。 */
  domain?: [number, number];
  accessibilityLabel?: string;
  selectHint?: string;
  /** 与第一条序列等长。两端都有值的日子涂成一条区间。 */
  band?: { low: (number | undefined)[]; high: (number | undefined)[] };
  /** 与第一条序列等长。有颜色的日子在折线上加一个点。 */
  marks?: (string | undefined)[];
  /** 第一条序列画成柱，从 0 起。后面的序列仍是线，用来放基线。 */
  bars?: boolean;
  selected?: number;
  onSelect?: (index: number) => void;
}) {
  const [w, onLayout] = useWidth();
  const all = [
    ...series.flatMap((s) => s.values),
    ...(band?.low ?? []),
    ...(band?.high ?? []),
    ...(bars ? [0] : []),
  ].filter((v): v is number => v != null);
  let min = domain ? domain[0] : all.length ? Math.min(...all) : 0;
  let max = domain ? domain[1] : all.length ? Math.max(...all) : 1;
  if (bars && min > 0) min = 0;
  if (!domain && max === min) max = min + 1;
  if (!domain && minSpan && max - min < minSpan) {
    const mid = (max + min) / 2;
    min = mid - minSpan / 2;
    max = mid + minSpan / 2;
  }
  const pad = domain ? 0 : (max - min) * 0.1 || 1;
  const lo = bars ? min : min - pad;
  const hi = max + pad;
  const ticks = bars ? [max, 0] : [hi - pad, lo + pad];
  const left = axisLeft(ticks.map(format));
  const y = (v: number) => {
    const r = (v - lo) / (hi - lo || 1);
    return 6 + (invert ? r : 1 - r) * (height - 12);
  };
  const described = accessibilityLabel ?? series.map((s) => s.label).filter(Boolean).join('，');
  const count = series[0]?.values.length ?? 0;
  const plotW = Math.max(1, w - left - 4);
  const xOf = (i: number) => {
    if (bars && count > 0) return left + ((i + 0.5) * plotW) / count;
    return left + (count <= 1 ? 0 : (i / (count - 1)) * plotW);
  };
  const pick = (x: number) => {
    if (!onSelect || count < 1 || w <= 0) return;
    if (bars) {
      onSelect(Math.max(0, Math.min(count - 1, Math.floor(((x - left) / plotW) * count))));
      return;
    }
    const t = count <= 1 ? 0 : (x - left) / plotW;
    onSelect(Math.max(0, Math.min(count - 1, Math.round(t * (count - 1)))));
  };
  return (
    <View
      onLayout={onLayout}
      accessible
      accessibilityRole={onSelect ? 'adjustable' : 'image'}
      accessibilityLabel={described || '折线图'}
      accessibilityHint={onSelect ? (selectHint ?? '按住可查看某一天') : undefined}
      onStartShouldSetResponder={() => !!onSelect}
      onMoveShouldSetResponder={() => !!onSelect}
      onResponderTerminationRequest={() => false}
      onResponderGrant={(e) => pick(e.nativeEvent.locationX)}
      onResponderMove={(e) => pick(e.nativeEvent.locationX)}
    >
      {w > 0 && (
        <Svg width={w} height={height}>
          {ticks.map((v, i) => (
            <SvgText key={i} x={0} y={y(v) + 4} fill={colors.sub} fontSize={font.micro}>
              {format(v)}
            </SvgText>
          ))}
          {ticks.map((v, i) => (
            <Line key={`grid-${i}`} x1={left} x2={w} y1={y(v)} y2={y(v)} stroke={colors.border} strokeDasharray="3 4" />
          ))}
          {band ? bandRuns(band.low, band.high).map((run, ri) => {
            const n = series[0]?.values.length ?? band.low.length;
            const x = (i: number) => left + (n <= 1 ? 0 : (i / (n - 1)) * (w - left - 4));
            let d = `M${x(run[0]).toFixed(1)},${y(band.high[run[0]]!).toFixed(1)}`;
            for (const i of run.slice(1)) d += `L${x(i).toFixed(1)},${y(band.high[i]!).toFixed(1)}`;
            for (const i of [...run].reverse()) d += `L${x(i).toFixed(1)},${y(band.low[i]!).toFixed(1)}`;
            d += 'Z';
            return <Path key={`band-${ri}`} d={d} fill={colors.blue} fillOpacity={0.18} stroke="none" />;
          }) : null}
          {selected != null && count > 0 ? (
            <Line x1={xOf(selected)} x2={xOf(selected)} y1={6} y2={height - 6} stroke={colors.sub} strokeDasharray="2 3" />
          ) : null}
          {series.map((s, si) => {
            const x = xOf;
            if (bars && si === 0) {
              const slot = count > 0 ? plotW / count : 8;
              const bw = Math.max(1, slot - 2);
              return s.values.map((v, i) => {
                if (v == null) return null;
                const top = y(v);
                const h = Math.max(0, y(0) - top);
                return (
                  <Rect
                    key={`bar-${i}`}
                    x={x(i) - bw / 2}
                    y={top}
                    width={bw}
                    height={h}
                    rx={2}
                    fill={s.color}
                    opacity={selected == null || selected === i ? 1 : 0.4}
                  />
                );
              });
            }
            let d = '';
            let pen = false;
            s.values.forEach((v, i) => {
              if (v == null) return void (pen = false);
              d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
              pen = true;
            });
            const dots = si === 0 && marks
              ? s.values.map((v, i) => (v != null && marks[i] ? { i, v, color: marks[i]! } : null)).filter((dot): dot is { i: number; v: number; color: string } => dot != null)
              : [];
            let handleAt = -1;
            if (si === 0 && onSelect) {
              if (selected != null && s.values[selected] != null) handleAt = selected;
              else if (selected == null) {
                for (let i = s.values.length - 1; i >= 0; i -= 1) {
                  if (s.values[i] != null) {
                    handleAt = i;
                    break;
                  }
                }
              }
            }
            const cursor = handleAt >= 0
              ? [
                  <Circle key="cursor-ring" cx={x(handleAt)} cy={y(s.values[handleAt]!)} r={7} fill={colors.card} stroke={s.color} strokeWidth={2} />,
                  <Circle key="cursor-dot" cx={x(handleAt)} cy={y(s.values[handleAt]!)} r={3} fill={s.color} />,
                ]
              : [];
            return [
              <Path key={`line-${si}`} d={d} stroke={s.color} strokeWidth={2} fill="none" strokeDasharray={s.dashed ? '4 4' : undefined} />,
              ...dots.map((dot) => (
                <Circle key={`dot-${si}-${dot.i}`} cx={x(dot.i)} cy={y(dot.v)} r={3.5} fill={dot.color} />
              )),
              ...cursor,
            ];
          })}
        </Svg>
      )}
      {labels && (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingLeft: left }}>
          <Text style={{ color: colors.sub, fontSize: font.micro }}>{labels[0]}</Text>
          <Text style={{ color: colors.sub, fontSize: font.micro }}>{labels[1]}</Text>
        </View>
      )}
      {series.some((s) => s.label) && (
        <View style={{ flexDirection: 'row', gap: space.md, marginTop: space.sm, flexWrap: 'wrap' }}>
          {series.filter((s) => s.label).map((s, i) => (
            <View key={s.label} style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
              {bars && i === 0 && !s.dashed ? (
                <View style={{ width: 8, height: 12, borderRadius: 2, backgroundColor: s.color }} />
              ) : s.dashed ? (
                <Svg width={16} height={8}>
                  <Line x1={0} y1={4} x2={16} y2={4} stroke={s.color} strokeWidth={2} strokeDasharray="3 2" />
                </Svg>
              ) : (
                <View style={{ width: 16, height: 3, backgroundColor: s.color, borderRadius: 2 }} />
              )}
              <Text style={{ color: colors.sub, fontSize: font.caption }}>{s.label}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

export function BarChart({
  values,
  height = 80,
  color = colors.blue,
  highlightLast = true,
  labels,
  accessibilityLabel,
}: {
  values: number[];
  height?: number;
  color?: string;
  highlightLast?: boolean;
  labels?: [string, string];
  accessibilityLabel?: string;
}) {
  const [w, onLayout] = useWidth();
  const max = Math.max(1, ...values);
  const contentW = w > 0 ? Math.max(w, values.length * space.md) : 0;
  const bw = values.length ? contentW / values.length : 0;
  const plot = contentW > 0 && (
    <View style={{ width: contentW }}>
      <Svg width={contentW} height={height}>
        {values.map((v, i) => {
          const h = (v / max) * (height - 4);
          return (
            <Rect key={i} x={i * bw + 1} y={height - h} width={Math.max(1, bw - 2)} height={h} rx={2}
              fill={color} opacity={highlightLast && i === values.length - 1 ? 1 : 0.55} />
          );
        })}
      </Svg>
      {labels && (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ color: colors.sub, fontSize: font.micro }}>{labels[0]}</Text>
          <Text style={{ color: colors.sub, fontSize: font.micro }}>{labels[1]}</Text>
        </View>
      )}
    </View>
  );
  return (
    <View onLayout={onLayout} accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel ?? '柱状图'}>
      {contentW > w ? (
        <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator={false}>
          {plot}
        </ScrollView>
      ) : plot}
    </View>
  );
}

export interface Segment {
  value: number;
  color: string;
  label: string;
}

/** 横向堆叠条，用于睡眠结构和心率区间。 */
export function StackedBar({
  segments,
  height = 14,
  legend = true,
  format,
  accessibilityLabel,
}: {
  segments: Segment[];
  height?: number;
  legend?: boolean;
  format?: (v: number) => string;
  accessibilityLabel?: string;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const described = accessibilityLabel ?? segments.map((s) => `${s.label} ${format ? format(s.value) : `${Math.round((s.value / total) * 100)}%`}`).join('，');
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={described} style={{ gap: space.sm }}>
      <View style={{ flexDirection: 'row', height, borderRadius: height / 2, overflow: 'hidden', backgroundColor: colors.cardAlt }}>
        {segments.map((s) => (
          <View key={s.label} style={{ flex: s.value / total, backgroundColor: s.color }} />
        ))}
      </View>
      {legend && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {segments.map((s) => (
            <View key={s.label} style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
              <View style={{ width: space.sm, height: space.sm, borderRadius: space.xs, backgroundColor: s.color }} />
              <Text style={{ color: colors.sub, fontSize: font.footnote }}>
                {s.label} {format ? format(s.value) : `${Math.round((s.value / total) * 100)}%`}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

export function ZoneBars({ zonesS }: { zonesS: number[] }) {
  const total = zonesS.reduce((s, x) => s + x, 0) || 1;
  const described = zonesS.map((s, i) => `Z${i + 1} ${Math.round(s / 60)} 分`).join('，');
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={`心率区间，${described}`} style={{ gap: space.sm }}>
      {zonesS.map((s, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <Text style={{ color: colors.sub, width: space.xl, fontSize: font.footnote }}>Z{i + 1}</Text>
          <View style={{ flex: 1, height: font.micro, backgroundColor: colors.cardAlt, borderRadius: space.xs, overflow: 'hidden' }}>
            <View style={{ width: `${(s / total) * 100}%`, height: '100%', backgroundColor: colors.zones[i] }} />
          </View>
          <Text style={{ color: colors.text, width: 72, fontSize: font.footnote, textAlign: 'right', fontVariant: ['tabular-nums'] }}>
            {Math.round(s / 60)} 分 · {Math.round((s / total) * 100)}%
          </Text>
        </View>
      ))}
    </View>
  );
}
