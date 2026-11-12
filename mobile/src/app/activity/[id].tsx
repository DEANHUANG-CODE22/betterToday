import { Stack, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { LineChart, ZoneBars } from '@/components/charts';
import { colors, font, space } from '@/components/theme';
import { Card, Empty, LoadingBlock, MetricTile, Muted, Row, Screen, SectionTitle } from '@/components/ui';
import { isHardSession } from '@/lib/advice';
import { activityTitle, sportSuffix } from '@/lib/labels';
import { fmtDateTime, fmtDuration, fmtKm, fmtPace } from '@/lib/metrics';
import { useData } from '@/lib/store';

/** 步频纵轴至少拉开这么多，避免几步的起伏铺满整张图。 */
const CADENCE_AXIS_SPAN = 30;
const PERFORMANCE: Record<string, string> = { excellent: '很好', great: '很好', good: '良好', average: '一般', 'below average': '低于平均', poor: '偏差' };
const performanceZh = (raw: string) => PERFORMANCE[raw.trim().toLowerCase()] ?? raw.trim();

export default function ActivityDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, loading } = useData();
  const a = data.activities.find((x) => x.id === id);
  if (loading && !a) return <Screen><LoadingBlock /></Screen>;
  if (!a) return <Screen><Empty text="找不到这条运动记录。" /></Screen>;

  const isRun = a.sport === 'run' || a.sport === 'trail';
  const pace = a.distanceM > 0 ? a.durationS / (a.distanceM / 1000) : undefined;
  const samples = a.samples ?? [];
  const xLabels: [string, string] = ['0:00', fmtDuration(a.durationS)];

  return (
    <Screen>
      <Stack.Screen options={{ title: activityTitle(a.name) }} />
      <Card>
        <Muted>
          {fmtDateTime(a.startTime)}{sportSuffix(a.name, a.sport)}
          {isHardSession(a) ? ' · 高强度' : ''}
        </Muted>
        <Row>
          {a.distanceM > 0 && <MetricTile plain label="距离" value={fmtKm(a.distanceM)} unit="km" />}
          <MetricTile plain label="时长" value={fmtDuration(a.durationS)} />
          {isRun && <MetricTile plain label="平均配速" value={fmtPace(pace)} unit="/km" />}
        </Row>
        <Row>
          <MetricTile plain label="平均心率" value={a.avgHr ? String(a.avgHr) : '--'} unit="bpm" />
          <MetricTile plain label="最大心率" value={a.maxHr ? String(a.maxHr) : '--'} unit="bpm" />
          <MetricTile
            plain
            label={a.elevGainM != null && a.elevLossM == null ? '爬升' : '爬升 / 下降'}
            value={a.elevGainM != null ? (a.elevLossM != null ? `${a.elevGainM} / ${a.elevLossM}` : String(a.elevGainM)) : '--'}
            unit={a.elevGainM != null ? 'm' : undefined}
          />
        </Row>
      </Card>

      <SectionTitle>训练负荷与效果</SectionTitle>
      <Row>
        <MetricTile plain label="训练负荷" value={String(a.trainingLoad)} />
        <MetricTile plain label="有氧效果" value={a.aerobicTE?.toFixed(1) ?? '--'} />
        <MetricTile plain label="无氧效果" value={a.anaerobicTE?.toFixed(1) ?? '--'} />
      </Row>
      {(a.movingPaceSecPerKm != null || a.adjustedPaceSecPerKm != null || (!isRun && a.avgPaceSecPerKm != null)) && (
        <Row>
          {!isRun && a.avgPaceSecPerKm != null && <MetricTile plain label="平均配速" value={fmtPace(a.avgPaceSecPerKm)} unit="/km" />}
          {a.movingPaceSecPerKm != null && <MetricTile plain label="移动配速" value={fmtPace(a.movingPaceSecPerKm)} unit="/km" />}
          {a.adjustedPaceSecPerKm != null && <MetricTile plain label="等强配速" value={fmtPace(a.adjustedPaceSecPerKm)} unit="/km" />}
        </Row>
      )}
      {(a.bestKmPaceSecPerKm != null || a.avgStrideM != null || a.avgPower != null || a.calories != null) && (
        <Row>
          {a.bestKmPaceSecPerKm != null && <MetricTile plain label="最快一公里" value={fmtPace(a.bestKmPaceSecPerKm)} unit="/km" />}
          {a.avgStrideM != null && <MetricTile plain label="平均步幅" value={a.avgStrideM.toFixed(2)} unit="m" />}
          {a.avgPower != null && <MetricTile plain label="平均功率" value={String(a.avgPower)} unit="W" />}
          {a.calories != null && <MetricTile plain label="消耗" value={String(a.calories)} unit="kcal" />}
        </Row>
      )}
      {a.performance ? <Muted>手表评价 {performanceZh(a.performance)}</Muted> : null}

      {samples.length > 1 && (
        <>
          <SectionTitle>曲线</SectionTitle>
          {samples.some((s) => s.hr) && (
            <Card>
              <Muted>心率 (bpm)</Muted>
              <LineChart accessibilityLabel="心率" series={[{ values: samples.map((s) => s.hr), color: colors.poor }]} labels={xLabels} />
            </Card>
          )}
          {isRun && samples.some((s) => s.paceSecPerKm) && (
            <Card>
              <Muted>配速（/km，越上越快）</Muted>
              <LineChart accessibilityLabel="配速，越上越快" series={[{ values: samples.map((s) => s.paceSecPerKm), color: colors.blue }]} labels={xLabels} invert format={fmtPace} />
            </Card>
          )}
          {samples.some((s) => s.cadence) && (
            <Card>
              <Muted>步频 (spm)</Muted>
              <LineChart accessibilityLabel="步频" minSpan={CADENCE_AXIS_SPAN} series={[{ values: samples.map((s) => s.cadence), color: colors.purple }]} labels={xLabels} height={90} />
            </Card>
          )}
          {samples.some((s) => s.power) && (
            <Card>
              <Muted>功率 (W)</Muted>
              <LineChart accessibilityLabel="功率" series={[{ values: samples.map((s) => s.power), color: colors.fair }]} labels={xLabels} height={90} />
            </Card>
          )}
        </>
      )}

      {a.hrZonesS && (
        <>
          <SectionTitle>心率区间</SectionTitle>
          <Card>
            <ZoneBars zonesS={a.hrZonesS} />
          </Card>
        </>
      )}

      {a.laps?.length ? (
        <>
          <SectionTitle>分圈</SectionTitle>
          <Card>
            <View style={styles.lapRow}>
              {['圈', '公里', '用时', '配速', '心率', '步频'].map((h) => (
                <Text key={h} style={[styles.lapCell, styles.lapHead]}>{h}</Text>
              ))}
            </View>
            {a.laps.map((l) => (
              <View key={l.index} style={styles.lapRow}>
                <Text style={styles.lapCell}>{l.index}</Text>
                <Text style={styles.lapCell}>{fmtKm(l.distanceM)}</Text>
                <Text style={styles.lapCell}>{fmtDuration(l.durationS)}</Text>
                <Text style={styles.lapCell}>{fmtPace(l.durationS / (l.distanceM / 1000))}</Text>
                <Text style={styles.lapCell}>{l.avgHr ?? '--'}</Text>
                <Text style={styles.lapCell}>{l.avgCadence ?? '--'}</Text>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      {!samples.length && <Muted>这条没有曲线。</Muted>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  lapRow: { flexDirection: 'row', paddingVertical: space.sm },
  lapCell: { flex: 1, color: colors.text, fontSize: font.subhead, fontVariant: ['tabular-nums'] },
  lapHead: { color: colors.sub, fontWeight: '600' },
});
