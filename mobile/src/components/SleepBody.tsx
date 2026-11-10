import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { LineChart, StackedBar } from '@/components/charts';
import { colors, font, space } from '@/components/theme';
import { Big, Card, Chip, Empty, LoadingBlock, MetricTile, Muted, Row, SectionTitle, TrendBadge } from '@/components/ui';
import { addDays, assessRecovery, detectAnomalies, fmtHM, pct, type Baseline } from '@/lib/metrics';
import { useData } from '@/lib/store';

const hhmm = (iso: string) => (iso ? new Date(iso).toTimeString().slice(0, 5) : '--:--');
const dayLabel = (d: string) => `${Number(d.slice(5, 7))}月${Number(d.slice(8, 10))}日`;
const hasNight = (s: { totalMin: number; hrv?: number }) => s.totalMin > 0 || s.hrv != null;

function baselineFooter(b: Baseline, good: 'up' | 'down', digits = 0, bpm = false) {
  const sameRound = b.value != null && b.avg28 != null ? Math.abs(Math.round(b.value - b.avg28)) : undefined;
  // 当天没有值的时候，不能说「在基线内」——那是在描述一个不存在的数。
  const text = b.value == null ? '无数据' : b.trend === 'normal' ? '在基线内' : bpm && sameRound != null ? `${sameRound} bpm` : pct(b.deltaPct);
  const unit = bpm ? ' bpm' : '';
  return (
    <View style={{ gap: 2 }}>
      <TrendBadge trend={b.trend} good={good} text={text} />
      <Muted style={{ fontSize: font.caption }}>
        7日 {b.avg7 != null ? b.avg7.toFixed(digits) : '--'}{unit} · 28日 {b.avg28 != null ? b.avg28.toFixed(digits) : '--'}{unit}
      </Muted>
    </View>
  );
}

export function SleepBody({ date }: { date?: string } = {}) {
  const { data, today: latest, loading } = useData();
  const today = date ?? latest;
  const [range, setRange] = useState<14 | 30>(14);
  // 和首页同一条回退：今天还没有这一晚，就用最近一条，并写明是哪天。
  // 翻到过去某一天时不借用别的日子，避免把 11 月 3 日的睡眠显示成 11 月 1 日。
  const exact = data.sleep.find((s) => s.date === today && hasNight(s));
  const night = exact ?? (today === latest ? [...data.sleep].filter((s) => s.date < today && hasNight(s)).at(-1) : undefined);
  const stale = !!night && night.date !== today;
  const rec = useMemo(() => assessRecovery(data.sleep, night?.date ?? today), [data.sleep, night?.date, today]);
  const anomalies = useMemo(() => detectAnomalies(data.daily, data.sleep, today), [data.daily, data.sleep, today]);
  const trend = useMemo(() => {
    const dates = Array.from({ length: range }, (_, i) => addDays(today, i - range + 1));
    const map = new Map(data.sleep.map((s) => [s.date, s]));
    return {
      sleepH: dates.map((d) => (map.get(d) ? map.get(d)!.totalMin / 60 : undefined)),
      hrv: dates.map((d) => map.get(d)?.hrv),
      rhr: dates.map((d) => map.get(d)?.restingHr),
      labels: [dates[0].slice(5), dates.at(-1)!.slice(5)] as [string, string],
    };
  }, [data.sleep, today, range]);

  if (loading && !data.sleep.length) return <LoadingBlock />;
  if (!data.sleep.length) return <Empty text="暂无睡眠数据。点右上角刷新再同步一次。" />;
  const score = night?.recovery;

  const sleepBlock = night ? (
    <>
      <SectionTitle right={<Muted>{hhmm(night.bedtime)} → {hhmm(night.wakeTime)}</Muted>}>
        {stale ? `${dayLabel(night.date)}的睡眠` : '昨夜睡眠'}
      </SectionTitle>
      <Card>
        <Big>{fmtHM(night.totalMin)}</Big>
        <StackedBar
          format={(v) => fmtHM(v)}
          segments={[
            { label: '深睡', value: night.deepMin, color: colors.sleep.deep },
            { label: '浅睡', value: night.lightMin, color: colors.sleep.light },
            { label: 'REM', value: night.remMin, color: colors.sleep.rem },
            { label: '清醒', value: night.awakeMin, color: colors.sleep.awake },
          ]}
        />
      </Card>
    </>
  ) : (
    <Muted>{today === latest ? '今天还没有睡眠数据' : '这一天没有睡眠记录'}</Muted>
  );
  const scoreBlock = score != null ? (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flex: 1, gap: space.xs }}>
          <Muted>{stale && night ? `${dayLabel(night.date)}的恢复` : '这一晚的恢复'}</Muted>
          <Text style={{ color: colors.text, fontSize: font.body, lineHeight: 22 }}>手表给出的恢复分</Text>
        </View>
        <Big>{String(Math.round(score))}</Big>
      </View>
    </Card>
  ) : (
    <Muted>{night ? `${stale ? dayLabel(night.date) : '这一晚'}没有恢复分` : null}</Muted>
  );

  return (
    <View style={{ gap: 12 }}>
      {score != null ? scoreBlock : null}
      {sleepBlock}
      {score == null && night ? scoreBlock : null}
      {anomalies.map((a) => (
        <Muted key={a.metric}>{a.message}</Muted>
      ))}
      <SectionTitle>{stale && night ? `${dayLabel(night.date)} · 对比个人基线` : '恢复指标（对比个人基线）'}</SectionTitle>
      <Row>
        <MetricTile label="夜间 HRV" value={rec.hrv.value?.toFixed(0) ?? '--'} unit="ms" footer={baselineFooter(rec.hrv, 'up')} />
        <MetricTile label="静息心率" value={rec.restingHr.value?.toFixed(0) ?? '--'} unit="bpm" footer={baselineFooter(rec.restingHr, 'down', 1, true)} />
      </Row>
      <SectionTitle right={<Row><Chip label="14天" active={range === 14} onPress={() => setRange(14)} /><Chip label="30天" active={range === 30} onPress={() => setRange(30)} /></Row>}>
        趋势
      </SectionTitle>
      <Card>
        <Muted>睡眠时长（小时）</Muted>
        <LineChart accessibilityLabel={`睡眠时长，${trend.labels[0]} 到 ${trend.labels[1]}`} series={[{ values: trend.sleepH, color: colors.sleep.light }]} labels={trend.labels} format={(v) => v.toFixed(1)} />
      </Card>
      <Card>
        <Muted>HRV 与静息心率</Muted>
        <LineChart accessibilityLabel={`HRV，${trend.labels[0]} 到 ${trend.labels[1]}`} series={[{ values: trend.hrv, color: colors.good, label: 'HRV (ms)' }]} labels={trend.labels} />
        <LineChart accessibilityLabel="静息心率" series={[{ values: trend.rhr, color: colors.poor, label: '静息心率 (bpm)' }]} height={80} />
      </Card>
    </View>
  );
}
