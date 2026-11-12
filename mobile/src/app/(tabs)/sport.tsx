import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { AdviceCard } from '@/components/AdviceCard';
import { SettleCard } from '@/components/SettleCard';
import { ChevronIcon } from '@/components/icons';
import { colors, font, space, touch } from '@/components/theme';
import { Card, Chip, Empty, FadeIn, LoadingBlock, MetricTile, Muted, Row, Screen, SectionTitle } from '@/components/ui';
import { RETURN_KIND_LABEL, RETURN_KIND_ORDER } from '@/lib/advice';
import { activityTitle, SPORT_LABEL, sportSuffix } from '@/lib/labels';
import { fmtDuration, fmtKm, fmtPace, zhMonthDay } from '@/lib/metrics';
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

export default function SportTab() {
  const { data, today, loading } = useData();
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

  if (loading && !data.activities.length && !data.ability.length) return <Screen><LoadingBlock /></Screen>;

  return (
    <Screen>
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
      {showSettlement ? null : (
        <AdviceCard
          advice={advice}
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

      <SectionTitle>运动记录</SectionTitle>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
        <Chip label="全部" active={filter === 'all'} onPress={() => setFilter('all')} />
        {types.map((t) => (
          <Chip key={t} label={SPORT_LABEL[t]} active={filter === t} onPress={() => setFilter(t)} />
        ))}
      </ScrollView>
      {list.length ? list.map((a) => <ActivityRow key={a.id} a={a} />) : <Empty text="暂无运动记录。" />}

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
        <Empty text="暂无运动能力数据。" />
      )}
    </Screen>
  );
}
