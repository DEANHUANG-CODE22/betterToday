import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { Text, View } from 'react-native';
import { HrvRing, Ring } from '@/components/Ring';
import { colors, font, space } from '@/components/theme';
import { Card, LoadingBlock, Muted, Screen } from '@/components/ui';
import { fmtHM, fmtHMShort } from '@/lib/metrics';
import { scheduleMorning } from '@/lib/notify';
import { useData } from '@/lib/store';
import { judgmentTone } from '@/lib/trend';
import { useTodayAdvice } from '@/lib/useTodayAdvice';
import type { SleepNight } from '@/lib/types';

const RECOVERY_LEVEL: Record<string, string> = { fresh: '充沛', normal: '正常', good: '良好', tired: '疲劳', fatigued: '疲劳', exhausted: '透支', poor: '偏差', optimal: '很好' };
const TONE = { good: colors.good, fair: colors.fair, poor: colors.poor };
const zh = (raw: string | undefined, table: Record<string, string>) => (raw ? table[raw.trim().toLowerCase()] ?? raw.trim() : undefined);
const dayLabel = (d: string) => `${Number(d.slice(5, 7))} 月 ${Number(d.slice(8, 10))} 日`;
const hhmm = (iso: string) => (iso ? new Date(iso).toTimeString().slice(0, 5) : '--:--');

function latest(nights: SleepNight[], pred: (s: SleepNight) => boolean) {
  for (let i = nights.length - 1; i >= 0; i -= 1) {
    if (pred(nights[i])) return nights[i];
  }
  return undefined;
}

function openTrend(metric: 'sleep' | 'hrv' | 'recovery', date: string) {
  router.push({ pathname: '/trend/[metric]', params: { metric, date } });
}

export default function SleepScreen() {
  const { data, today, loading } = useData();
  const { morningBody } = useTodayAdvice({ persist: false });
  useFocusEffect(useCallback(() => {
    void scheduleMorning(morningBody.current, true);
    return () => { void scheduleMorning(morningBody.current, false); };
  }, [morningBody]));

  if (loading && !data.sleep.length) return <Screen><LoadingBlock /></Screen>;

  const nights = data.sleep.filter((s) => s.date <= today);
  const sleepNight = latest(nights, (s) => s.totalMin > 0);
  const hrvNight = latest(nights, (s) => s.hrv != null);
  const recoveryNight = latest(nights, (s) => s.recovery != null || !!s.recoveryLevel);
  const recoveryTone = judgmentTone(recoveryNight?.recoveryLevel);
  const hrvRange = hrvNight?.hrv != null && hrvNight.hrvLow != null && hrvNight.hrvHigh != null;

  return (
    <Screen>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          <Ring
            label="睡眠时长"
            value={sleepNight ? fmtHMShort(sleepNight.totalMin) : '没有'}
            progress={sleepNight?.sleepScore != null ? sleepNight.sleepScore / 100 : 0}
            color={colors.sleep.light}
            when={sleepNight ? dayLabel(sleepNight.date) : undefined}
            onPress={sleepNight ? () => openTrend('sleep', sleepNight.date) : undefined}
            accessibilityLabel={sleepNight ? `睡眠时长 ${fmtHM(sleepNight.totalMin)}，${dayLabel(sleepNight.date)}，查看趋势` : '没有睡眠记录'}
          />
          {hrvRange && hrvNight ? (
            <HrvRing
              label="夜间 HRV"
              value={hrvNight.hrv!}
              low={hrvNight.hrvLow!}
              high={hrvNight.hrvHigh!}
              when={dayLabel(hrvNight.date)}
              onPress={() => openTrend('hrv', hrvNight.date)}
              accessibilityLabel={`夜间 HRV ${Math.round(hrvNight.hrv!)} 毫秒，正常区间 ${hrvNight.hrvLow} 到 ${hrvNight.hrvHigh}，${dayLabel(hrvNight.date)}，查看趋势`}
            />
          ) : (
            <Ring
              label="夜间 HRV"
              value={hrvNight?.hrv != null ? String(Math.round(hrvNight.hrv)) : '没有'}
              progress={0}
              color={colors.text}
              when={hrvNight ? dayLabel(hrvNight.date) : undefined}
              onPress={hrvNight ? () => openTrend('hrv', hrvNight.date) : undefined}
              accessibilityLabel={hrvNight?.hrv != null ? `夜间 HRV ${Math.round(hrvNight.hrv)} 毫秒，${dayLabel(hrvNight.date)}，查看趋势` : '没有夜间 HRV'}
            />
          )}
          <Ring
            label="恢复"
            value={recoveryNight?.recovery != null ? String(Math.round(recoveryNight.recovery)) : '没有'}
            progress={recoveryTone ? (recoveryNight?.recovery != null ? recoveryNight.recovery / 100 : 1) : 0}
            color={recoveryTone ? TONE[recoveryTone] : colors.text}
            when={recoveryNight ? dayLabel(recoveryNight.date) : undefined}
            onPress={recoveryNight ? () => openTrend('recovery', recoveryNight.date) : undefined}
            accessibilityLabel={recoveryNight ? `恢复 ${recoveryNight.recovery != null ? Math.round(recoveryNight.recovery) : '没有分数'}，${dayLabel(recoveryNight.date)}` : '没有恢复分'}
          />
        </View>
      </Card>
      {sleepNight ? (
        <Card plain>
          {sleepNight.bedtime || sleepNight.wakeTime ? <Muted>{hhmm(sleepNight.bedtime)}–{hhmm(sleepNight.wakeTime)}</Muted> : null}
          {sleepNight.sleepScore != null ? <Text style={{ color: colors.text, fontSize: font.body }}>评分 {sleepNight.sleepScore}</Text> : null}
          <Muted>深睡 {fmtHMShort(sleepNight.deepMin)} · 浅睡 {fmtHMShort(sleepNight.lightMin)} · REM {fmtHMShort(sleepNight.remMin)}</Muted>
          <Muted>清醒 {fmtHMShort(sleepNight.awakeMin)}{sleepNight.awakeCount != null ? ` · 醒过 ${sleepNight.awakeCount} 次` : ''}</Muted>
          {sleepNight.napsMin ? <Muted>小睡 {fmtHMShort(sleepNight.napsMin)}</Muted> : null}
          {sleepNight.sleepHrAvg != null ? <Muted>睡眠心率 {Math.round(sleepNight.sleepHrAvg)}（{sleepNight.sleepHrMin ?? '--'}–{sleepNight.sleepHrMax ?? '--'}）</Muted> : null}
        </Card>
      ) : null}
      {hrvNight && ((hrvNight.hrvLow != null && hrvNight.hrvHigh != null) || hrvNight.hrvBaseline != null) ? (
        <Card plain>
          <Muted>夜间 HRV</Muted>
          {hrvNight.hrvLow != null && hrvNight.hrvHigh != null ? <Muted>正常区间 {hrvNight.hrvLow}–{hrvNight.hrvHigh} ms</Muted> : null}
          {hrvNight.hrvBaseline != null ? <Muted>手表基线 {hrvNight.hrvBaseline} ms</Muted> : null}
        </Card>
      ) : null}
      {recoveryNight && (recoveryNight.recoveryLevel || recoveryNight.fullRecoveryH != null) ? (
        <Card plain>
          <Muted>手表给出的恢复分</Muted>
          {zh(recoveryNight.recoveryLevel, RECOVERY_LEVEL) ? <Muted>{zh(recoveryNight.recoveryLevel, RECOVERY_LEVEL)}</Muted> : null}
          {recoveryNight.fullRecoveryH != null ? <Muted>{recoveryNight.fullRecoveryH === 0 ? '预计已经恢复' : `预计完全恢复 ${recoveryNight.fullRecoveryH} 小时`}</Muted> : null}
        </Card>
      ) : null}
    </Screen>
  );
}
