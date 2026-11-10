import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { LineChart, StackedBar } from '@/components/charts';
import { colors, font, space } from '@/components/theme';
import { Big, Card, Chip, Empty, LoadingBlock, Muted, Row, Screen } from '@/components/ui';
import { fmtHM } from '@/lib/metrics';
import { useData } from '@/lib/store';
import {
  aligned,
  baselineSentence,
  enoughToChart,
  isTrendMetric,
  judgmentTone,
  seriesBaseline,
  sleepScoreTone,
  windowDates,
  type TrendMetric,
} from '@/lib/trend';
import type { DailyHealth, Dataset, ISODate, SleepNight } from '@/lib/types';

const TONE = { good: colors.good, fair: colors.fair, poor: colors.poor };
const RECOVERY_LEVEL: Record<string, string> = { fresh: '充沛', normal: '正常', good: '良好', tired: '疲劳', fatigued: '疲劳', exhausted: '透支', poor: '偏差', optimal: '很好' };
const BARS = new Set<TrendMetric>(['steps', 'floors', 'exerciseMin', 'activeKcal']);
const zh = (raw: string | undefined, table: Record<string, string>) => (raw ? table[raw.trim().toLowerCase()] ?? raw.trim() : undefined);
const dayLabel = (d: string) => `${Number(d.slice(5, 7))} 月 ${Number(d.slice(8, 10))} 日`;
const hhmm = (iso: string) => (iso ? new Date(iso).toTimeString().slice(0, 5) : '--:--');

const SPEC: Record<TrendMetric, { title: string; unit: string; digits: number; ranges: (7 | 30 | 90)[]; riseIsWarm?: boolean }> = {
  sleep: { title: '睡眠时长', unit: '小时', digits: 1, ranges: [7, 30, 90] },
  hrv: { title: '夜间 HRV', unit: 'ms', digits: 0, ranges: [7, 30] },
  recovery: { title: '恢复', unit: '', digits: 0, ranges: [] },
  steps: { title: '步数', unit: '步', digits: 0, ranges: [7, 30] },
  restingHr: { title: '静息心率', unit: 'bpm', digits: 0, ranges: [7, 30], riseIsWarm: true },
  stress: { title: '压力', unit: '', digits: 0, ranges: [7, 30] },
  activeKcal: { title: '活动消耗', unit: 'kcal', digits: 0, ranges: [7, 30] },
  exerciseMin: { title: '运动分钟', unit: '分钟', digits: 0, ranges: [7, 30] },
  floors: { title: '楼层', unit: '层', digits: 0, ranges: [7, 30] },
  avgHr: { title: '日均心率', unit: 'bpm', digits: 0, ranges: [7, 30] },
};

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function pointsOf(metric: TrendMetric, data: Dataset): { date: ISODate; value?: number }[] {
  if (metric === 'sleep') return data.sleep.filter((s) => s.totalMin > 0).map((s) => ({ date: s.date, value: s.totalMin / 60 }));
  if (metric === 'hrv') return data.sleep.filter((s) => s.hrv != null).map((s) => ({ date: s.date, value: s.hrv }));
  if (metric === 'restingHr') {
    const map = new Map<string, number>();
    for (const night of data.sleep) if (night.restingHr != null) map.set(night.date, night.restingHr);
    for (const day of data.daily) if (day.restingHr != null) map.set(day.date, day.restingHr);
    return [...map].map(([date, value]) => ({ date, value }));
  }
  const key = metric as keyof DailyHealth;
  return data.daily.filter((d) => typeof d[key] === 'number').map((d) => ({ date: d.date, value: d[key] as number }));
}

export default function TrendScreen() {
  const params = useLocalSearchParams<{ metric: string; date?: string }>();
  const metric = one(params.metric) ?? '';
  const { data, today, loading } = useData();
  const anchor = one(params.date) || today;
  const spec = isTrendMetric(metric) ? SPEC[metric] : undefined;
  const [range, setRange] = useState<7 | 30 | 90>(7);

  const model = useMemo(() => {
    if (!spec || !isTrendMetric(metric) || metric === 'recovery') return undefined;
    const dates = windowDates(anchor, range);
    const points = pointsOf(metric, data).filter((p) => p.date <= anchor);
    const values = aligned(dates, points);
    const base = seriesBaseline(points, anchor, spec.riseIsWarm ? 0.05 : 0.1);
    return { dates, values, base, points };
  }, [anchor, data, metric, range, spec]);

  if (!spec || !isTrendMetric(metric)) {
    return <Screen><Empty text="没有这个指标。" /></Screen>;
  }
  if (loading && !data.sleep.length && !data.daily.length) return <Screen><LoadingBlock /></Screen>;

  return (
    <Screen>
      <Stack.Screen options={{ title: spec.title }} />
      {metric === 'recovery' ? <RecoveryBody data={data} anchor={anchor} /> : model ? (
        <SeriesBody metric={metric} spec={spec} anchor={anchor} data={data} model={model} range={range} onRange={setRange} />
      ) : null}
    </Screen>
  );
}

function SeriesBody({
  metric, spec, anchor, data, model, range, onRange,
}: {
  metric: TrendMetric;
  spec: (typeof SPEC)[TrendMetric];
  anchor: string;
  data: Dataset;
  model: { dates: ISODate[]; values: (number | undefined)[]; points: { date: ISODate; value?: number }[]; base: ReturnType<typeof seriesBaseline> };
  range: 7 | 30 | 90;
  onRange: (n: 7 | 30 | 90) => void;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const index = picked != null && picked < model.dates.length ? picked : model.dates.length - 1;
  const day = model.dates[index] ?? anchor;
  const value = model.values[index];
  const base = seriesBaseline(model.points, day, spec.riseIsWarm ? 0.05 : 0.1);
  const shown = value == null ? '没有' : metric === 'sleep' ? fmtHM(value * 60) : BARS.has(metric) ? Math.round(value).toLocaleString() : value.toFixed(spec.digits);
  const sentence = baselineSentence(base, spec.unit, spec.digits);
  const lineColor = spec.riseIsWarm && model.base.trend === 'up' ? colors.fair : metric === 'sleep' ? colors.sleep.light : colors.text;
  const night = data.sleep.find((s) => s.date === day);
  const resting = metric === 'hrv' ? pointsOf('restingHr', data).find((p) => p.date === day)?.value : undefined;
  const marks = metric === 'sleep'
    ? model.dates.map((date) => {
      const score = data.sleep.find((s) => s.date === date)?.sleepScore;
      const tone = sleepScoreTone(score);
      return tone ? TONE[tone] : undefined;
    })
    : undefined;
  const band = metric === 'hrv'
    ? {
      low: model.dates.map((date) => data.sleep.find((s) => s.date === date)?.hrvLow),
      high: model.dates.map((date) => data.sleep.find((s) => s.date === date)?.hrvHigh),
    }
    : undefined;
  const showChart = enoughToChart(model.values);
  const baselineLine = base.avg28;
  return (
    <>
      <Card>
        <Muted>{dayLabel(day)}</Muted>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.sm }}>
          <Big color={value == null ? colors.sub : colors.text}>{shown}</Big>
          {value != null && spec.unit && metric !== 'sleep' ? <Text style={{ color: colors.sub, fontSize: font.body }}>{spec.unit}</Text> : null}
        </View>
        {sentence ? <Muted>{sentence}</Muted> : null}
      </Card>
      <Row>
        {spec.ranges.map((n) => (
          <Chip key={n} label={n === 90 ? '90 天' : `${n} 天`} active={range === n} onPress={() => { setPicked(null); onRange(n); }} />
        ))}
      </Row>
      {showChart ? (
        <Card>
          <LineChart
            height={220}
            accessibilityLabel={`${spec.title}，${model.dates[0]} 到 ${model.dates.at(-1)}`}
            labels={[dayLabel(model.dates[0]), dayLabel(model.dates.at(-1)!)]}
            format={(v) => (spec.digits > 0 ? v.toFixed(spec.digits) : Math.round(v).toLocaleString())}
            band={band}
            marks={marks}
            bars={BARS.has(metric)}
            minSpan={metric === 'sleep' ? 4 : undefined}
            domain={metric === 'stress' ? [0, 100] : undefined}
            selected={index}
            onSelect={setPicked}
            series={[
              { values: model.values, color: lineColor, label: spec.title },
              ...(baselineLine != null ? [{ values: model.values.map(() => baselineLine), color: colors.sub, label: '28 日基线', dashed: true }] : []),
            ]}
          />
          {metric === 'sleep' && marks?.some(Boolean) ? <Muted>绿点 85 分及以上，黄点 70–84，红点 70 分以下。</Muted> : null}
          {metric === 'hrv' && band && band.low.some((v) => v != null) ? <Muted>色带是手表给的正常区间。</Muted> : null}
        </Card>
      ) : (
        <Muted>天数还不够，凑满 4 天才画趋势。</Muted>
      )}
      {metric === 'sleep' && night ? <SleepLines night={night} /> : null}
      {metric === 'hrv' ? <HrvLines night={night} resting={resting} /> : null}
    </>
  );
}

function SleepLines({ night }: { night: SleepNight }) {
  const stages = [
    { value: night.deepMin, color: colors.sleep.deep, label: '深睡' },
    { value: night.lightMin, color: colors.sleep.light, label: '浅睡' },
    { value: night.remMin, color: colors.sleep.rem, label: 'REM' },
    { value: night.awakeMin, color: colors.sleep.awake, label: '清醒' },
  ].filter((s) => s.value > 0);
  const window = night.bedtime || night.wakeTime ? `${hhmm(night.bedtime)}–${hhmm(night.wakeTime)}` : '';
  if (!stages.length && !window && night.awakeCount == null && !night.napsMin && night.sleepScore == null && night.sleepHrAvg == null) return null;
  return (
    <Card plain>
      <Muted>当晚各期占比</Muted>
      {stages.length ? <StackedBar segments={stages} format={fmtHM} accessibilityLabel="当晚睡眠分期比例" /> : null}
      {window ? <Muted>{window}</Muted> : null}
      {night.awakeCount != null ? <Muted>醒过 {night.awakeCount} 次</Muted> : null}
      {night.napsMin ? <Muted>小睡 {fmtHM(night.napsMin)}</Muted> : null}
      {night.sleepScore != null ? <Muted>评分 {night.sleepScore}</Muted> : null}
      {night.sleepHrAvg != null ? <Muted>睡眠心率 {Math.round(night.sleepHrAvg)}（{night.sleepHrMin ?? '--'}–{night.sleepHrMax ?? '--'}）</Muted> : null}
    </Card>
  );
}

function HrvLines({ night, resting }: { night?: SleepNight; resting?: number }) {
  const range = night?.hrvLow != null && night?.hrvHigh != null;
  if (!range && night?.hrvBaseline == null && resting == null) return null;
  return (
    <Card plain>
      {range ? <Muted>正常区间 {night?.hrvLow}–{night?.hrvHigh} ms</Muted> : null}
      {night?.hrvBaseline != null ? <Muted>手表基线 {night.hrvBaseline} ms</Muted> : null}
      {resting != null ? <Muted>同一天静息心率 {Math.round(resting)} bpm</Muted> : null}
    </Card>
  );
}

function RecoveryBody({ data, anchor }: { data: Dataset; anchor: string }) {
  const night = [...data.sleep].reverse().find((s) => s.date <= anchor && (s.recovery != null || s.recoveryLevel));
  const same = night ? data.sleep.find((s) => s.date === night.date) : undefined;
  if (!night) return <Empty text="没有恢复分。" />;
  return (
    <Card>
      <Muted>{dayLabel(night.date)} · 手表给出的恢复分</Muted>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.sm }}>
        <Big color={night.recovery == null ? colors.sub : colors.text}>{night.recovery != null ? String(Math.round(night.recovery)) : '没有'}</Big>
        {night.recoveryLevel ? <Text style={{ color: colors.sub, fontSize: font.body }}>{zh(night.recoveryLevel, RECOVERY_LEVEL)}</Text> : null}
      </View>
      {night.fullRecoveryH != null ? <Muted>{night.fullRecoveryH === 0 ? '预计已经恢复' : `预计完全恢复 ${night.fullRecoveryH} 小时`}</Muted> : null}
      <Muted>恢复分只有这一天的记录，画不出趋势。</Muted>
      {same && same.totalMin > 0 ? <Muted>当晚睡眠 {fmtHM(same.totalMin)}</Muted> : null}
      {same?.hrv != null ? <Muted>夜间 HRV {Math.round(same.hrv)} ms</Muted> : null}
      {same?.restingHr != null ? <Muted>静息心率 {Math.round(same.restingHr)} bpm</Muted> : null}
    </Card>
  );
}
