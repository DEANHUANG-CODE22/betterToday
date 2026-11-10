import { useMemo } from 'react';
import { View } from 'react-native';
import { BarChart, LineChart } from '@/components/charts';
import { colors } from '@/components/theme';
import { Card, Empty, LoadingBlock, MetricTile, Muted, Row, Screen, SectionTitle } from '@/components/ui';
import { acwr, addDays, baseline, fmtDuration, fmtPace, fitnessSeries } from '@/lib/metrics';
import { useData } from '@/lib/store';

export default function AbilityScreen() {
  const { data, today, loading } = useData();
  const fit = useMemo(() => fitnessSeries(data.activities, addDays(today, -89), today, data.loads), [data.activities, data.loads, today]);
  const ratio = useMemo(() => acwr(data.activities, today, data.loads), [data.activities, data.loads, today]);
  const last = fit.at(-1);
  const ctlBase = useMemo(() => (last ? baseline(fit.map((f) => ({ date: f.date, value: f.ctl })), last.date) : undefined), [fit, last]);
  const latest = data.ability.at(-1);
  const first = data.ability[0];
  const labels: [string, string] = [fit[0]?.date.slice(5) ?? '', today.slice(5)];
  const delta = (a?: number, b?: number, digits = 1) => (a != null && b != null ? `${a - b >= 0 ? '+' : ''}${(a - b).toFixed(digits)}` : '');

  if (loading && !data.activities.length && !data.ability.length) return <Screen><LoadingBlock /></Screen>;

  return (
    <Screen>
      <SectionTitle>体能 / 疲劳 / 状态</SectionTitle>
      <Row>
        <MetricTile plain label="体能 CTL" value={last ? last.ctl.toFixed(0) : '--'} />
        <MetricTile plain label="疲劳 ATL" value={last ? last.atl.toFixed(0) : '--'} />
      </Row>
      <Row>
        <MetricTile plain label="状态 TSB" value={last ? last.tsb.toFixed(0) : '--'} />
        <MetricTile plain label="ACWR" value={ratio?.toFixed(2) ?? '--'} />
      </Row>
      <Card>
        <LineChart
          accessibilityLabel="体能和疲劳"
          labels={labels}
          series={[
            { values: fit.map((f) => f.ctl), color: colors.blue, label: '体能 CTL' },
            { values: fit.map((f) => f.atl), color: colors.poor, label: '疲劳 ATL' },
          ]}
          height={160}
        />
        <LineChart
          accessibilityLabel="状态 TSB"
          labels={labels}
          series={[{ values: fit.map((f) => f.tsb), color: colors.good, label: '状态 TSB', dashed: true }]}
          height={100}
        />
        {fit.some((point) => point.load > 0) && (
          <>
            <Muted>每日训练负荷</Muted>
            <BarChart accessibilityLabel="每日训练负荷" labels={labels} values={fit.map((f) => f.load)} height={60} highlightLast={false} />
          </>
        )}
        {last && ctlBase?.avg28 != null ? (
          <Muted>{Number(last.date.slice(5, 7))}月{Number(last.date.slice(8))}日的体能 {last.ctl.toFixed(0)}，你的 28 日基线是 {ctlBase.avg28.toFixed(0)}。</Muted>
        ) : null}
      </Card>

      {latest ? (
        <>
          <SectionTitle>能力指标</SectionTitle>
          <Row>
            <MetricTile plain label="最大摄氧量" value={latest.vo2max?.toFixed(1) ?? '--'} footer={<Muted>{delta(latest.vo2max, first?.vo2max)} 较 {first?.date.slice(5)}</Muted>} />
            <MetricTile plain label="跑力" value={latest.runningFitness != null ? String(latest.runningFitness) : '--'} />
            <MetricTile plain label="马拉松水平" value={latest.marathonLevel != null ? `${latest.marathonLevel}%` : '--'} footer={<Muted>{delta(latest.marathonLevel, first?.marathonLevel, 0)}</Muted>} />
          </Row>
          <Row>
            <MetricTile plain label="乳酸阈心率" value={latest.lthr ? String(latest.lthr) : '--'} unit="bpm" />
            <MetricTile plain label="阈值配速" value={fmtPace(latest.thresholdPaceSecPerKm)} unit="/km" />
          </Row>
          <Card>
            <Muted>最大摄氧量趋势</Muted>
            <LineChart accessibilityLabel="最大摄氧量" series={[{ values: data.ability.map((a) => a.vo2max), color: colors.blue }]} labels={[first.date.slice(5), latest.date.slice(5)]} format={(v) => v.toFixed(1)} />
          </Card>

          {latest.racePredictionsS && (
            <>
              <SectionTitle>成绩预测</SectionTitle>
              <Card>
                {(
                  [
                    ['5 公里', '5k', 5],
                    ['10 公里', '10k', 10],
                    ['半程马拉松', 'half', 21.0975],
                    ['全程马拉松', 'full', 42.195],
                  ] as const
                ).map(([label, key, km]) => {
                  const s = latest.racePredictionsS?.[key];
                  return (
                    <View key={key} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
                      <Muted>{label}</Muted>
                      <Muted style={{ color: colors.text }}>
                        {s ? `${fmtDuration(s)}  ·  ${fmtPace(s / km)}/km` : '--'}
                      </Muted>
                    </View>
                  );
                })}
              </Card>
              <Card>
                <Muted>全马预测趋势（越上越快）</Muted>
                <LineChart
                  accessibilityLabel="全马预测，越上越快"
                  series={[{ values: data.ability.map((a) => a.racePredictionsS?.full), color: colors.good }]}
                  labels={[first.date.slice(5), latest.date.slice(5)]}
                  invert
                  format={(v) => fmtDuration(v).slice(0, -3)}
                />
              </Card>
            </>
          )}
        </>
      ) : (
        <Empty text="暂无运动能力数据。" />
      )}
    </Screen>
  );
}
