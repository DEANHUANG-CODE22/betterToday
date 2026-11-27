import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { AdviceBody, AdviceHero, adviceItems } from '@/components/AdviceCard';
import { AskButton, type EvidenceItem } from '@/components/agent';
import { SettleCard } from '@/components/SettleCard';
import { SemiGauge } from '@/components/gauges';
import { InfoButton } from '@/components/knowledge';
import { ChevronIcon } from '@/components/icons';
import { colors, font, space, touch } from '@/components/theme';
import { Card, Chip, Empty, FadeIn, LoadingBlock, MetricTile, Muted, Row, Screen, SectionTitle } from '@/components/ui';
import { CONFIDENCE_LABEL, confidenceTip } from '@/lib/agent';
import { isHardSession, RETURN_KIND_LABEL, RETURN_KIND_ORDER } from '@/lib/advice';
import { daysBetween, frac, RULE, SCALE } from '@/lib/gauge';
import { PAGE_TOPICS, type Facts } from '@/lib/knowledge';
import { activityTitle, SPORT_LABEL, sportSuffix } from '@/lib/labels';
import { fmtDuration, fmtKm, fmtPace, toISODate, zhMonthDay } from '@/lib/metrics';
import { useData } from '@/lib/store';
import { useTodayAdvice } from '@/lib/useTodayAdvice';
import { monthGrid, sessionsByDate, weekDates } from '@/lib/volume';
import type { Activity, SportType } from '@/lib/types';

function moveLabel(a: Activity) {
  if (!(a.distanceM > 0) || !(a.durationS > 0)) return null;
  if (a.sport === 'run' || a.sport === 'trail') {
    return `${fmtPace(a.durationS / (a.distanceM / 1000))}/km`;
  }
  const kmh = (a.distanceM / 1000) / (a.durationS / 3600);
  return `${kmh.toFixed(1)} km/h`;
}

const WEEKDAY = ['一', '二', '三', '四', '五', '六', '日'];

function WeekBars({ distances }: { distances: number[] }) {
  const max = Math.max(0, ...distances);
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={`本周每天 ${distances.map((m) => (m / 1000).toFixed(1)).join('、')} 公里`}>
      <View style={{ height: 72, flexDirection: 'row', alignItems: 'flex-end', gap: 4 }}>
        {distances.map((meters, i) => (
          <View key={i} style={{ flex: 1, justifyContent: 'flex-end', height: '100%' }}>
            {max > 0 && meters > 0 ? (
              <View style={{ height: Math.max(4, (meters / max) * 72), borderRadius: 2, backgroundColor: colors.blue }} />
            ) : null}
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 4, marginTop: space.xs }}>
        {WEEKDAY.map((label) => (
          <Text key={label} style={{ flex: 1, textAlign: 'center', color: colors.sub, fontSize: font.footnote }}>{label}</Text>
        ))}
      </View>
    </View>
  );
}

/**
 * 列表左侧的时长。不用「18:00」「2:28:20」：前者像下午六点，两种冒号写法也混在一列里。
 * 精确到秒在单次详情里看。
 */
function DurationAnchor({ seconds }: { seconds: number }) {
  const total = Math.max(0, Math.round(seconds / 60));
  const h = Math.floor(total / 60);
  const m = total % 60;
  const num = { color: colors.text, fontSize: font.lead, fontWeight: '700', fontVariant: ['tabular-nums'] } as const;
  const unit = { color: colors.sub, fontSize: font.footnote, fontWeight: '500' } as const;
  return (
    <Text accessibilityLabel={h ? `${h} 小时 ${m} 分钟` : `${m} 分钟`}>
      {h ? (
        <>
          <Text style={num}>{h}</Text>
          <Text style={unit}> 时 </Text>
        </>
      ) : null}
      <Text style={num}>{m}</Text>
      <Text style={unit}> 分</Text>
    </Text>
  );
}

function durationText(seconds: number) {
  const total = Math.max(0, Math.round(seconds / 60));
  const h = Math.floor(total / 60);
  return h ? `${h} 时 ${total % 60} 分` : `${total} 分`;
}

/**
 * 列表里的一条记录：不成面，用顶上细线分开。回看时先找哪天、练了什么，
 * 所以名字和日期在第一行，时长退到第二行的第一项。页顶当天那条仍用 ActivityRow。
 */
function ActivityListRow({ a, first }: { a: Activity; first: boolean }) {
  const d = new Date(a.startTime);
  const quiet = [
    durationText(a.durationS),
    a.distanceM > 0 ? `${fmtKm(a.distanceM)} km` : '',
    moveLabel(a) ?? '',
    a.avgHr ? `${a.avgHr} bpm` : '',
    `负荷 ${a.trainingLoad}`,
  ].filter(Boolean).join(' · ');
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/activity/[id]', params: { id: a.id } })}
      style={({ pressed }) => ({
        minHeight: touch,
        paddingVertical: space.md,
        gap: 2,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: colors.border,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Text numberOfLines={1} style={{ color: colors.text, fontSize: font.callout, fontWeight: '700', flex: 1 }}>{activityTitle(a.name)}</Text>
        <Muted>{zhMonthDay(d)}{sportSuffix(a.name, a.sport)}</Muted>
        <ChevronIcon color={colors.sub} size={16} />
      </View>
      <Text style={{ color: colors.sub, fontSize: font.footnote, fontVariant: ['tabular-nums'] }}>{quiet}</Text>
    </Pressable>
  );
}

function ActivityRow({ a }: { a: Activity }) {
  const d = new Date(a.startTime);
  const quiet = [
    a.distanceM > 0 ? `${fmtKm(a.distanceM)} km` : '',
    moveLabel(a) ?? '',
    a.avgHr ? `${a.avgHr} bpm` : '',
    `负荷 ${a.trainingLoad}`,
  ].filter(Boolean).join(' · ');
  return (
    <Card onPress={() => router.push({ pathname: '/activity/[id]', params: { id: a.id } })} style={{ paddingVertical: space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <View style={{ minWidth: 76, minHeight: touch, alignItems: 'flex-start', justifyContent: 'center' }}>
          <DurationAnchor seconds={a.durationS} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.sm }}>
            <Text numberOfLines={1} style={{ color: colors.text, fontSize: font.callout, fontWeight: '700', flex: 1 }}>{activityTitle(a.name)}</Text>
            <Muted>{zhMonthDay(d)}{sportSuffix(a.name, a.sport)}</Muted>
          </View>
          <Text style={{ color: colors.sub, fontSize: font.footnote }}>{quiet}</Text>
        </View>
      </View>
    </Card>
  );
}

/** 离最近一次强度课几天（和 advice.ts 同一个判定 isHardSession）。没有过强度课给空。 */
function sinceHard(activities: Activity[], today: string): number | undefined {
  const last = activities
    .filter((a) => isHardSession(a))
    .map((a) => toISODate(new Date(a.startTime)))
    .filter((d) => d <= today)
    .sort()
    .at(-1);
  return last ? daysBetween(last, today) : undefined;
}

const fmt1 = (v: number) => (Math.round(v * 10) / 10).toFixed(1);
const KIND_WORD = { rest: '休息', recovery: '回归期', aerobic: '有氧', intensity: '强度', unknown: '不确定' } as const;

/**
 * 训练仪表：建议用到的三个数，外圈刻线就是 advice.ts 自己的门槛（RULE）。
 * 只有这一页的表画红黄警戒段，因为这一页本来就下判断。
 */
function TrainingGauges({ tsb, acwr, sinceHard: days, facts }: { tsb?: number; acwr?: number; sinceHard?: number; facts: Facts }) {
  const [t0, t1] = SCALE.tsb;
  const [r0, r1] = SCALE.acwr;
  const [d0, d1] = SCALE.daysSinceHard;
  return (
    <Card style={{ paddingHorizontal: space.xs, gap: space.xs }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: space.sm }}>
        <Text style={{ flex: 1, color: colors.sub, fontSize: font.footnote }}>训练仪表 · 刻线是停跑和不上强度的线</Text>
        <InfoButton ids={['tsb', 'acwr', 'hard']} facts={facts} title="训练仪表是什么" />
      </View>
      <View style={{ flexDirection: 'row' }}>
        <SemiGauge
          fraction={tsb != null ? frac(tsb, t0, t1) : undefined}
          valueText={tsb != null ? String(Math.round(tsb)) : '没有'}
          zones={[
            { from: 0, to: frac(RULE.tsbStop, t0, t1), color: colors.poor },
            { from: frac(RULE.tsbStop, t0, t1), to: frac(RULE.tsbNoIntensity, t0, t1), color: colors.fair },
          ]}
          marks={[frac(RULE.tsbStop, t0, t1), frac(RULE.tsbNoIntensity, t0, t1)]}
          label="状态值"
          caption={`${RULE.tsbStop} 以下别跑\n${RULE.tsbNoIntensity} 以下不上强度`}
          accessibilityLabel={`状态值 ${tsb != null ? Math.round(tsb) : '没有'}。低于 ${RULE.tsbStop} 今天别跑，低于 ${RULE.tsbNoIntensity} 不上强度`}
        />
        <SemiGauge
          fraction={acwr != null ? frac(acwr, r0, r1) : undefined}
          valueText={acwr != null ? fmt1(acwr) : '没有'}
          zones={[{ from: frac(RULE.acwrStop, r0, r1), to: 1, color: colors.poor }]}
          marks={[frac(RULE.acwrStop, r0, r1)]}
          label="负荷比"
          caption={`短期 / 长期\n超过 ${RULE.acwrStop} 别跑`}
          accessibilityLabel={`负荷比 ${acwr != null ? fmt1(acwr) : '没有'}，超过 ${RULE.acwrStop} 今天别再跑`}
        />
        <SemiGauge
          fraction={days != null ? frac(days, d0, d1) : undefined}
          valueText={days != null ? (days > d1 ? `${d1}+ 天` : `${days} 天`) : '没有'}
          marks={[frac(RULE.minDaysBetweenHard, d0, d1)]}
          label="离上次强度"
          caption={`满 ${RULE.minDaysBetweenHard} 天\n才可再上`}
          accessibilityLabel={days != null ? `离上次强度 ${days} 天，满 ${RULE.minDaysBetweenHard} 天才可能再上` : '还没有强度课记录'}
        />
      </View>
    </Card>
  );
}

export default function SportTab() {
  const { data, today, loading, beforeMorning } = useData();
  const {
    advice, settlement, showSettlement, todayActs, todayLog, yesterday, hitRate,
    prompt, actOnAdvice, answerReturnKind,
  } = useTodayAdvice({ persist: false });
  const [filter, setFilter] = useState<SportType | 'all'>('all');
  const latest = data.ability.at(-1);
  const byDate = useMemo(() => sessionsByDate(data.activities), [data.activities]);
  const days = useMemo(() => weekDates(today), [today]);
  const weekKm = days.map((date) => byDate.get(date)?.distanceM ?? 0);
  const weekTotal = weekKm.reduce((sum, meters) => sum + meters, 0);
  const month = useMemo(() => monthGrid(today, byDate), [byDate, today]);
  const types = useMemo(() => [...new Set(data.activities.map((a) => a.sport))], [data.activities]);
  const shown = new Set(todayActs.map((a) => a.id));
  const list = data.activities.filter((a) => !shown.has(a.id) && (filter === 'all' || a.sport === filter)).slice(0, 60);

  const tip = confidenceTip(data.sleep, today, advice.confidence);
  const hardGap = sinceHard(data.activities, today);
  const tonight = [...data.sleep].reverse().find((n) => n.date <= today && n.recovery != null);
  const facts: Facts = {
    today,
    plan: { word: KIND_WORD[advice.kind], duration: advice.duration, zones: advice.zones },
    confidence: { level: advice.confidence, tip },
    acwr: advice.inputs.acwr,
    tsb: advice.inputs.tsb,
    hard: { n7: advice.inputs.hardSessions7d, sinceDays: hardGap },
    recovery: tonight ? { date: tonight.date, score: tonight.recovery } : undefined,
  };
  const askItems: EvidenceItem[] = showSettlement
    ? [
      { key: 'settle', label: '今天的结算', value: settlement ? '已出' : '没有' },
      { key: 'week', label: '本周', value: `${(weekTotal / 1000).toFixed(1)} 公里` },
      { key: 'month', label: month.label, value: `${month.total} 次` },
    ]
    : [
      { key: 'dose', label: '今天', value: `${advice.duration}，${advice.zones}` },
      { key: 'conf', label: '把握', value: CONFIDENCE_LABEL[advice.confidence], note: tip },
      ...adviceItems(advice, yesterday),
      { key: 'week', label: '本周', value: `${(weekTotal / 1000).toFixed(1)} 公里` },
    ];

  if (loading && !data.activities.length && !data.ability.length) return <Screen refreshable><LoadingBlock /></Screen>;

  return (
    <Screen
      refreshable
      hero={showSettlement ? undefined : <AdviceHero advice={advice} today={today} beforeMorning={beforeMorning} />}
      floating={<AskButton page="运动" items={askItems} topics={PAGE_TOPICS.sport} facts={facts} />}
    >
      {todayActs.map((a) => <ActivityRow key={a.id} a={a} />)}
      {showSettlement ? (
        <FadeIn watch="settle">
          <SettleCard
            settlement={settlement}
            onUndo={todayActs.length === 0 ? () => { void actOnAdvice(today, undefined); } : undefined}
          />
        </FadeIn>
      ) : null}
      {prompt.ask && (
        <Card>
          <Text style={{ color: colors.text, fontSize: font.headline, fontWeight: '700' }}>
            已经 {prompt.gapDays} 天没训练了
          </Text>
          <Muted style={{ marginTop: space.xs, marginBottom: space.sm }}>
            这段时间是怎么断的？只问这一次，用来安排回来的节奏。
          </Muted>
          {RETURN_KIND_ORDER.map((kind) => (
            <Pressable
              key={kind}
              accessibilityRole="button"
              onPress={() => { if (prompt.since) void answerReturnKind(kind, prompt.since); }}
              style={({ pressed }) => ({
                minHeight: touch,
                justifyContent: 'center',
                borderTopWidth: 1,
                borderTopColor: colors.border,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Text style={{ color: colors.text, fontSize: font.body }}>{RETURN_KIND_LABEL[kind]}</Text>
            </Pressable>
          ))}
          <Pressable
            accessibilityRole="button"
            onPress={() => { if (prompt.since) void answerReturnKind('major', prompt.since); }}
            style={{ minHeight: touch, justifyContent: 'center', borderTopWidth: 1, borderTopColor: colors.border }}
          >
            <Muted>说不准，先按 3–4 周算</Muted>
          </Pressable>
        </Card>
      )}
      <TrainingGauges
        tsb={advice.inputs.tsb}
        acwr={advice.inputs.acwr}
        sinceHard={hardGap}
        facts={facts}
      />
      {showSettlement ? null : (
        <AdviceBody
          advice={advice}
          tip={tip}
          yesterday={yesterday}
          hitRate={hitRate}
          action={todayLog?.userAction}
          actionNote={todayLog?.note}
          onAction={(action, note) => { void actOnAdvice(today, action, note); }}
        />
      )}

      <Row>
        <View style={{ flex: 1 }}>
        <Card style={{ flex: 1, justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <Muted style={{ fontSize: font.footnote }}>本周</Muted>
            <Text style={{ color: colors.text, fontSize: font.metric, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
              {(weekTotal / 1000).toFixed(1)}
              <Text style={{ color: colors.sub, fontSize: font.footnote, fontWeight: '500' }}> 公里</Text>
            </Text>
          </View>
          <WeekBars distances={weekKm} />
        </Card>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${month.label} ${month.total} 次，查看今年`}
          onPress={() => router.push('/year')}
          style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.7 : 1 })}
        >
        <Card style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
              <Muted style={{ fontSize: font.footnote }}>{month.label}</Muted>
              <ChevronIcon color={colors.sub} size={14} />
            </View>
            <Text style={{ color: colors.text, fontSize: font.metric, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
              {month.total}
              <Text style={{ color: colors.sub, fontSize: font.footnote, fontWeight: '500' }}> 次</Text>
            </Text>
          </View>
          <View
            accessible
            accessibilityRole="image"
            accessibilityLabel={`${month.label} ${month.total} 次，今天 ${Number(today.slice(8, 10))} 日`}
            style={{ gap: 3 }}
          >
            {/* 星期表头：没有它读不出哪格是哪天，月初落在周日时右上角那一格像渲染出错。 */}
            <View style={{ flexDirection: 'row', gap: 3 }}>
              {WEEKDAY.map((label) => (
                <Text key={label} style={{ flex: 1, textAlign: 'center', color: colors.sub, fontSize: font.footnote }}>{label}</Text>
              ))}
            </View>
            {Array.from({ length: month.cells.length / 7 }, (_, row) => (
              <View key={row} style={{ flexDirection: 'row', gap: 3 }}>
                {month.cells.slice(row * 7, row * 7 + 7).map((cell, i) => (
                  <View
                    key={cell.date ?? `pad-${row}-${i}`}
                    style={{
                      flex: 1,
                      aspectRatio: 1,
                      borderRadius: 3,
                      backgroundColor: !cell.date ? 'transparent' : cell.count > 0 ? colors.blue : colors.cardAlt,
                      // 今天描一圈正文色的边，不用橙色：橙色只给当前 Tab 和选中的东西。
                      borderWidth: cell.date === today ? 1.5 : 0,
                      borderColor: colors.text,
                    }}
                  />
                ))}
              </View>
            ))}
          </View>
        </Card>
        </Pressable>
      </Row>

      <Pressable accessibilityRole="link" onPress={() => router.push('/ledger')} style={({ pressed }) => ({ minHeight: touch, justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
        <Muted>每日记录：建议、照做、早上感觉、次日 HRV ›</Muted>
      </Pressable>
      <SectionTitle>运动记录</SectionTitle>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
        <Chip label="全部" active={filter === 'all'} onPress={() => setFilter('all')} />
        {types.map((t) => (
          <Chip key={t} label={SPORT_LABEL[t]} active={filter === t} onPress={() => setFilter(t)} />
        ))}
      </ScrollView>
      {list.length ? <View>{list.map((a, i) => <ActivityListRow key={a.id} a={a} first={i === 0} />)}</View> : <Empty text="还没有运动记录。" />}

      <SectionTitle>运动能力</SectionTitle>
      {latest ? (
        <Card accessibilityLabel="运动能力" onPress={() => router.push('/ability')}>
          <Row>
            <MetricTile plain label="最大摄氧量" value={latest.vo2max?.toFixed(1) ?? '--'} />
            <MetricTile plain label="阈值配速" value={fmtPace(latest.thresholdPaceSecPerKm)} unit="/km" />
            <MetricTile plain label="全马预测" value={latest.racePredictionsS?.full ? fmtDuration(latest.racePredictionsS.full).slice(0, -3) : '--'} />
            <View style={{ width: touch, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: colors.sub, fontSize: font.title }} accessibilityElementsHidden importantForAccessibility="no">›</Text>
            </View>
          </Row>
        </Card>
      ) : (
        <Empty text="还没有运动能力数据。" />
      )}
    </Screen>
  );
}
