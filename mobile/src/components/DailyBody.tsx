import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { BarChart, LineChart } from '@/components/charts';
import { colors, font } from '@/components/theme';
import { Card, Chip, Empty, LoadingBlock, MetricTile, Muted, Row, SectionTitle, TrendBadge } from '@/components/ui';
import { addDays, baseline, detectAnomalies, mean, pct } from '@/lib/metrics';
import type { DailyHealth } from '@/lib/types';
import { useData } from '@/lib/store';

type Key = 'steps' | 'activeKcal' | 'restingHr' | 'stress' | 'spo2';
const METRICS: { key: Key; label: string; unit: string; good: 'up' | 'down' }[] = [
  { key: 'steps', label: '步数', unit: '步', good: 'up' },
  { key: 'activeKcal', label: '活动消耗', unit: 'kcal', good: 'up' },
  { key: 'restingHr', label: '静息心率', unit: 'bpm', good: 'down' },
  { key: 'stress', label: '压力', unit: '分', good: 'down' },
  { key: 'spo2', label: '血氧', unit: '%', good: 'up' },
];

export function DailyBody({ date }: { date?: string } = {}) {
  const { data, today: latest, loading } = useData();
  const today = date ?? latest;
  const [range, setRange] = useState<7 | 30>(7);
  const anomalies = useMemo(() => detectAnomalies(data.daily, data.sleep, today), [data.daily, data.sleep, today]);
  const todayRow = data.daily.find((d) => d.date === today) ?? data.daily.at(-1);
  const available = METRICS.filter((m) => data.daily.some((d) => d[m.key] != null));
  const dates = useMemo(() => Array.from({ length: range }, (_, i) => addDays(today, i - range + 1)), [today, range]);
  const byDate = useMemo(() => new Map(data.daily.map((d) => [d.date, d])), [data.daily]);
  const col = (k: Key) => dates.map((d) => byDate.get(d)?.[k]);

  if (loading && !data.daily.length) return <LoadingBlock />;
  if (!data.daily.length) return <Empty text="暂无日常健康数据。COROS 开放接口若未提供此类数据，这一页会保持为空。" />;

  const summary = (k: Key) => baseline(data.daily.map((d: DailyHealth) => ({ date: d.date, value: d[k] })), todayRow!.date, 0.1);
  const offToday = available.filter((m) => summary(m.key).trend !== 'normal');
  const tone = anomalies.length ? colors.poor : offToday.length ? colors.fair : colors.good;
  const title = anomalies.length ? `发现 ${anomalies.length} 项持续异常` : offToday.length ? '今天有指标偏离基线' : '身体指标都在个人基线内';

  return (
    <View style={{ gap: 12 }}>
      <Card style={{ borderColor: tone, borderWidth: 1 }}>
        <Text style={{ color: tone, fontSize: font.headline, fontWeight: '700' }}>{title}</Text>
        {anomalies.length ? anomalies.map((a) => <Muted key={a.metric}>· {a.message}</Muted>) : (
          <Muted>{offToday.length ? '这些偏离还没有连续 3 天。' : '静息心率、压力、HRV、睡眠均未出现连续 3 天的偏离。'}</Muted>
        )}
      </Card>
      <SectionTitle>今日概览</SectionTitle>
      {[0, 2, 4].map((start) => (
        <Row key={start}>
          {available.slice(start, start + 2).map((m) => {
            const b = summary(m.key);
            return (
              <MetricTile
                key={m.key}
                label={m.label}
                value={b.value != null ? Math.round(b.value).toLocaleString() : '--'}
                unit={m.unit}
                footer={<TrendBadge trend={b.trend} good={m.good} text={b.trend === 'normal' ? '在基线内' : `较28日 ${pct(b.deltaPct)}`} />}
              />
            );
          })}
          {available.slice(start, start + 2).length === 1 ? <View style={{ flex: 1 }} /> : null}
        </Row>
      ))}
      <SectionTitle right={<Row><Chip label="周" active={range === 7} onPress={() => setRange(7)} /><Chip label="月" active={range === 30} onPress={() => setRange(30)} /></Row>}>
        趋势
      </SectionTitle>
      {available.some((m) => m.key === 'steps') && (
        <Card>
          <Muted>步数 · 日均 {Math.round(mean(col('steps').filter((v): v is number => v != null)) ?? 0).toLocaleString()}</Muted>
          <BarChart accessibilityLabel="步数" labels={[dates[0].slice(5), dates.at(-1)!.slice(5)]} values={col('steps').map((v) => v ?? 0)} color={colors.blue} />
        </Card>
      )}
      {available.some((m) => m.key === 'restingHr') && (
        <Card>
          <Muted>静息心率 (bpm)</Muted>
          <LineChart accessibilityLabel="静息心率" series={[{ values: col('restingHr'), color: colors.poor }]} labels={[dates[0].slice(5), dates.at(-1)!.slice(5)]} />
        </Card>
      )}
      {available.some((m) => m.key === 'stress') && (
        <Card>
          <Muted>压力</Muted>
          <LineChart accessibilityLabel="压力" series={[{ values: col('stress'), color: colors.purple }]} labels={[dates[0].slice(5), dates.at(-1)!.slice(5)]} />
        </Card>
      )}
    </View>
  );
}
