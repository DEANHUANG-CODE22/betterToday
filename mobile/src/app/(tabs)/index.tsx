import { router, useFocusEffect } from 'expo-router';
import { useCallback, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { AgentVoice, AskButton, type EvidenceItem } from '@/components/agent';
import { MorningFeel } from '@/components/feel';
import { ArcGauge } from '@/components/gauges';
import { InfoButton } from '@/components/knowledge';
import { colors, font, space } from '@/components/theme';
import { Card, LoadingBlock, Muted, Screen } from '@/components/ui';
import { addDays, detectAnomalies, fmtHM, fmtHMShort } from '@/lib/metrics';
import { PAGE_TOPICS, type Facts } from '@/lib/knowledge';
import { scheduleMorning } from '@/lib/notify';
import { useData } from '@/lib/store';
import { sleepVoice } from '@/lib/agent';
import { centeredScale, frac, hrvScale, SCALE } from '@/lib/gauge';
import { judgmentTone, seriesBaseline } from '@/lib/trend';
import { useTodayAdvice } from '@/lib/useTodayAdvice';
import type { SleepNight } from '@/lib/types';

const RECOVERY_LEVEL: Record<string, string> = { fresh: '充沛', normal: '正常', good: '良好', tired: '疲劳', fatigued: '疲劳', exhausted: '透支', poor: '较差', optimal: '很好' };
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
  const { data, today, loading, feelings, setFeel, beforeMorning } = useData();
  const { morningBody } = useTodayAdvice({ persist: false });
  useFocusEffect(useCallback(() => {
    void scheduleMorning(morningBody.current, true);
    return () => { void scheduleMorning(morningBody.current, false); };
  }, [morningBody]));

  if (loading && !data.sleep.length) return <Screen refreshable><LoadingBlock /></Screen>;

  const nights = data.sleep.filter((s) => s.date <= today);
  const sleepNight = latest(nights, (s) => s.totalMin > 0);
  const hrvNight = latest(nights, (s) => s.hrv != null);
  const recoveryNight = latest(nights, (s) => s.recovery != null || !!s.recoveryLevel);
  const recoveryTone = judgmentTone(recoveryNight?.recoveryLevel);
  const recoveryLevel = zh(recoveryNight?.recoveryLevel, RECOVERY_LEVEL);
  const voice = sleepVoice(sleepNight, today, recoveryNight ? { level: recoveryLevel, fullRecoveryH: recoveryNight.fullRecoveryH } : undefined);
  const hrvOutside = hrvNight?.hrv != null && hrvNight.hrvLow != null && hrvNight.hrvHigh != null
    && (Math.round(hrvNight.hrv) < hrvNight.hrvLow || Math.round(hrvNight.hrv) > hrvNight.hrvHigh);

  // 它看到的数：每一项各走各的日期，和之前三个环的规矩一样，不合成「昨夜」。
  const items: EvidenceItem[] = [
    sleepNight
      ? { key: 'sleep', label: '睡眠', value: fmtHMShort(sleepNight.totalMin), note: dayLabel(sleepNight.date), onPress: () => openTrend('sleep', sleepNight.date) }
      : { key: 'sleep', label: '睡眠', note: '没有记录', missing: true },
    hrvNight?.hrv != null
      ? {
        key: 'hrv',
        label: 'HRV',
        value: String(Math.round(hrvNight.hrv)),
        tone: hrvOutside ? colors.fair : undefined,
        note: hrvNight.hrvLow != null && hrvNight.hrvHigh != null ? `正常范围 ${hrvNight.hrvLow}–${hrvNight.hrvHigh}` : dayLabel(hrvNight.date),
        onPress: () => openTrend('hrv', hrvNight.date),
      }
      : { key: 'hrv', label: 'HRV', note: '没有', missing: true },
    ...(hrvNight?.hrvBaseline != null ? [{ key: 'base', label: 'HRV 平时', value: String(hrvNight.hrvBaseline), note: '手表基线' }] : []),
    ...(sleepNight?.sleepScore != null ? [{ key: 'score', label: '睡眠评分', value: String(sleepNight.sleepScore) }] : []),
    ...(feelings[today] != null ? [{ key: 'feel', label: '今天早上感觉', value: `${feelings[today]} / 5`, note: '你自己记的' }] : []),
    ...(recoveryNight?.fullRecoveryH != null ? [{ key: 'full', label: '预计完全恢复', value: recoveryNight.fullRecoveryH === 0 ? '已恢复' : `${recoveryNight.fullRecoveryH} 小时` }] : []),
    recoveryNight
      ? {
        key: 'recovery',
        label: '恢复分',
        value: recoveryNight.recovery != null ? String(Math.round(recoveryNight.recovery)) : zh(recoveryNight.recoveryLevel, RECOVERY_LEVEL),
        tone: recoveryTone ? TONE[recoveryTone] : undefined,
        note: dayLabel(recoveryNight.date),
        onPress: () => openTrend('recovery', recoveryNight.date),
      }
      : { key: 'recovery', label: '恢复分', note: '手表没给', missing: true },
  ];

  // 仪表：睡眠的短刻线是你的 28 日基线（和趋势页同一个算法）；HRV 弧上那段是手表给的正常范围，两头写数，刻线是手表基线。
  const sleepBase = sleepNight
    ? seriesBaseline(nights.filter((s) => s.totalMin > 0).map((s) => ({ date: s.date, value: s.totalMin / 60 })), sleepNight.date).avg28
    : undefined;
  const hrvRange = hrvNight?.hrv != null && hrvNight.hrvLow != null && hrvNight.hrvHigh != null
    ? hrvScale(hrvNight.hrvLow, hrvNight.hrvHigh, hrvNight.hrv, hrvNight.hrvBaseline)
    : undefined;
  // 「平时」：手表基线优先；手表没给就用你自己的 28 日 HRV 基线（和趋势页同一个算法）。
  const hrvBase = hrvNight?.hrv != null
    ? hrvNight.hrvBaseline ?? seriesBaseline(nights.filter((s) => s.hrv != null).map((s) => ({ date: s.date, value: s.hrv })), hrvNight.date).avg28
    : undefined;
  // 没有手表范围时，也要画出点：以「平时」为中心上下各 40% 做量程，刻线标平时。
  const hrvGaugeScale = hrvRange ?? (hrvNight?.hrv != null && hrvBase != null ? centeredScale(hrvBase, 0.4, hrvNight.hrv) : undefined);
  // 某块表的数不是睡眠那一晚的：中心小字写它自己的日期，不然会被当成昨夜的数（2026-11-25 走查）。
  const otherNight = (date?: string) => (date && sleepNight && date !== sleepNight.date ? dayLabel(date) : undefined);

  // 知识条目「你的」一段要的数，全部来自上面已经算好的事实，不另算。
  const feelVals = Array.from({ length: 14 }, (_, i) => feelings[addDays(today, -i)]).filter((v): v is NonNullable<typeof v> => v != null);
  const facts: Facts = {
    today,
    sleep: sleepNight ? { date: sleepNight.date, totalMin: sleepNight.totalMin, avg28Min: sleepBase != null ? sleepBase * 60 : undefined, deepMin: sleepNight.deepMin, lightMin: sleepNight.lightMin, remMin: sleepNight.remMin, awakeMin: sleepNight.awakeMin } : undefined,
    hrv: hrvNight?.hrv != null ? { date: hrvNight.date, value: hrvNight.hrv, base: hrvBase, low: hrvNight.hrvLow, high: hrvNight.hrvHigh } : undefined,
    recovery: recoveryNight ? { date: recoveryNight.date, score: recoveryNight.recovery, level: recoveryLevel, fullH: recoveryNight.fullRecoveryH } : undefined,
    deviations: detectAnomalies(data.daily, data.sleep, today).map((a) => a.message),
    feel: { today: feelings[today], avg: feelVals.length ? feelVals.reduce((a, b) => a + b, 0) / feelVals.length : undefined, n: feelVals.length },
  };

  return (
    <Screen refreshable floating={<AskButton page="睡眠与恢复" items={items} topics={PAGE_TOPICS.sleep} facts={facts} />}>
      <AgentVoice
        by={sleepNight ? `看了你 ${dayLabel(sleepNight.date)}的数据` : '还没有数据'}
        title={voice.title}
        body={voice.body || undefined}
        action={{ label: '看今天练什么', onPress: () => router.navigate('/sport') }}
      />
      <Card style={{ paddingHorizontal: space.xs, paddingVertical: space.md, gap: 0 }}>
        <View style={{ flexDirection: 'row' }}>
        <ArcGauge
          missing={!sleepNight}
          fraction={sleepNight ? frac(sleepNight.totalMin / 60, ...SCALE.sleepH) : undefined}
          color={colors.sleep.light}
          tick={sleepBase != null ? frac(sleepBase, ...SCALE.sleepH) : undefined}
          center={sleepNight ? <Stack main={<HM min={sleepNight.totalMin} />} sub={sleepNight.sleepScore != null ? `${sleepNight.sleepScore} 分` : undefined} /> : <Missing />}
          label="睡眠"
          onPress={sleepNight ? () => openTrend('sleep', sleepNight.date) : undefined}
          accessibilityLabel={sleepNight ? `睡眠 ${fmtHM(sleepNight.totalMin)}，${dayLabel(sleepNight.date)}${sleepBase != null ? `，平时 ${fmtHM(Math.round(sleepBase * 60))}` : ''}，查看趋势` : '没有睡眠记录'}
        />
        <ArcGauge
          missing={hrvNight?.hrv == null}
          dot={hrvGaugeScale && hrvNight?.hrv != null ? { at: frac(hrvNight.hrv, ...hrvGaugeScale), color: hrvOutside ? colors.fair : colors.text } : undefined}
          color={colors.text}
          band={hrvRange && hrvNight ? [frac(hrvNight.hrvLow!, ...hrvRange), frac(hrvNight.hrvHigh!, ...hrvRange)] : undefined}
          bandLabels={hrvRange && hrvNight ? [String(hrvNight.hrvLow), String(hrvNight.hrvHigh)] : undefined}
          tick={hrvGaugeScale && hrvBase != null ? frac(hrvBase, ...hrvGaugeScale) : undefined}
          center={hrvNight?.hrv != null
            ? <Stack main={<Text style={{ color: hrvOutside ? colors.fair : colors.text, fontSize: font.lead, fontWeight: '700' }}>{Math.round(hrvNight.hrv)}</Text>} sub={otherNight(hrvNight.date) ?? (hrvBase != null ? `平时 ${Math.round(hrvBase)}` : undefined)} />
            : <Missing />}
          label="夜间 HRV"
          onPress={hrvNight ? () => openTrend('hrv', hrvNight.date) : undefined}
          accessibilityLabel={hrvNight?.hrv != null
            ? `夜间 HRV ${Math.round(hrvNight.hrv)} 毫秒，${dayLabel(hrvNight.date)}${hrvBase != null ? `，平时 ${Math.round(hrvBase)}` : ''}${hrvNight.hrvLow != null && hrvNight.hrvHigh != null ? `，正常范围 ${hrvNight.hrvLow} 到 ${hrvNight.hrvHigh}${hrvOutside ? '，在范围外' : ''}` : ''}，查看趋势`
            : '没有夜间 HRV'}
        />
        <ArcGauge
          missing={recoveryNight?.recovery == null}
          fraction={recoveryNight?.recovery != null ? frac(recoveryNight.recovery, ...SCALE.recovery) : undefined}
          // 手表没给档位：弧用中性灰，不用正文色（浅色下是一整段很重的黑弧）。
          color={recoveryTone ? TONE[recoveryTone] : colors.sub}
          center={recoveryNight?.recovery != null
            ? <Stack main={<Text style={{ color: colors.text, fontSize: font.lead, fontWeight: '700' }}>{Math.round(recoveryNight.recovery)}</Text>} sub={otherNight(recoveryNight.date) ?? recoveryLevel} />
            : <Missing />}
          label="恢复"
          onPress={recoveryNight ? () => openTrend('recovery', recoveryNight.date) : undefined}
          accessibilityLabel={recoveryNight?.recovery != null ? `手表给出的恢复分 ${Math.round(recoveryNight.recovery)}${recoveryLevel ? `，${recoveryLevel}` : ''}，查看` : '手表没给恢复分'}
        />
        </View>
        <InfoButton ids={['sleep', 'hrv', 'recovery']} facts={facts} title="这三块表是什么" label="这三块表是什么" style={{ marginRight: space.sm }} />
      </Card>
      {/* 还没到早上时不问早上感觉（今天还是昨天）。 */}
      {beforeMorning ? null : <MorningFeel value={feelings[today]} onPick={(v) => { void setFeel(today, v); }} />}
      {sleepNight ? (
        <Card style={{ gap: space.md }}>
          {sleepNight.bedtime || sleepNight.wakeTime ? <Muted>{hhmm(sleepNight.bedtime)} 入睡 · {hhmm(sleepNight.wakeTime)} 起床</Muted> : null}
          <StageBar night={sleepNight} />
          {sleepNight.awakeCount != null || sleepNight.napsMin || sleepNight.sleepHrAvg != null ? (
            <Muted>
              {[
                sleepNight.awakeCount != null ? `醒过 ${sleepNight.awakeCount} 次` : '',
                sleepNight.napsMin ? `小睡 ${fmtHMShort(sleepNight.napsMin)}` : '',
                sleepNight.sleepHrAvg != null ? `睡眠心率 ${Math.round(sleepNight.sleepHrAvg)}（${sleepNight.sleepHrMin ?? '--'}–${sleepNight.sleepHrMax ?? '--'}）` : '',
              ].filter(Boolean).join(' · ')}
            </Muted>
          ) : null}
        </Card>
      ) : null}
    </Screen>
  );
}

/** 各期占比条：总分钟的比例，不是逐段时间轴（接口没有）。 */
function StageBar({ night }: { night: SleepNight }) {
  const stages = [
    { label: '深睡', min: night.deepMin, color: colors.sleep.deep },
    { label: '浅睡', min: night.lightMin, color: colors.sleep.light },
    { label: 'REM', min: night.remMin, color: colors.sleep.rem },
    { label: '清醒', min: night.awakeMin, color: colors.sleep.awake },
  ];
  const shown = stages.filter((s) => s.min > 0);
  if (!shown.length) return null;
  return (
    <View style={{ gap: space.sm }}>
      <View accessible accessibilityLabel={`各期：${stages.map((s) => `${s.label} ${fmtHM(s.min)}`).join('，')}`} style={{ flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', gap: 2 }}>
        {shown.map((s) => <View key={s.label} style={{ flex: s.min, backgroundColor: s.color }} />)}
      </View>
      <View style={{ flexDirection: 'row' }}>
        {stages.map((s) => (
          <View key={s.label} style={{ flex: 1 }}>
            <Text style={{ color: colors.sub, fontSize: font.footnote }}>{s.label}</Text>
            <Text style={{ color: colors.text, fontSize: font.body, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{fmtHMShort(s.min)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** 表中心的时长：数字大、单位小，和「6 时 21 分」同一套写法。 */
function HM({ min }: { min: number }) {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return (
    // 一行放下：手机系统字体偏宽时（衬线字体）会把分钟挤到第二行被裁掉，所以缩字不换行。
    // 宽度收在弧的内圈里（约 60），不碰基线刻线（0.1.45）。
    <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={{ color: colors.text, fontVariant: ['tabular-nums'], maxWidth: 56 }}>
      <Text style={{ fontSize: font.lead, fontWeight: '700' }}>{h}</Text>
      <Text style={{ fontSize: font.subhead, color: colors.sub }}>时</Text>
      <Text style={{ fontSize: font.lead, fontWeight: '700' }}>{m}</Text>
    </Text>
  );
}

function Missing() {
  return <Text style={{ color: colors.sub, fontSize: font.headline, fontWeight: '700' }}>没有</Text>;
}

/** 表中心：大数一行，下面一行小字（睡眠评分、HRV 平时、手表的恢复档位）。 */
function Stack({ main, sub }: { main: ReactNode; sub?: string }) {
  return (
    <View style={{ alignItems: 'center' }}>
      {main}
      {sub ? <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={{ color: colors.sub, fontSize: font.footnote, maxWidth: 56 }}>{sub}</Text> : null}
    </View>
  );
}
