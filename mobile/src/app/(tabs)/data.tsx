import { router } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { AgentVoice, AskButton, type EvidenceItem } from '@/components/agent';
import { LineChart } from '@/components/charts';
import { MeterBar, StressDial, StressLegend } from '@/components/gauges';
import { InfoButton } from '@/components/knowledge';
import { ChevronIcon } from '@/components/icons';
import { colors, font, space, touch } from '@/components/theme';
import { Card, LoadingBlock, Muted, Screen, useStaleDay } from '@/components/ui';
import { filledSlots, heartSlots, slotClock } from '@/lib/daySeries';
import { dailyVoice } from '@/lib/agent';
import { centeredScale, frac, hourlyStress } from '@/lib/gauge';
import { PAGE_TOPICS, type Facts } from '@/lib/knowledge';
import { addDays, baseline, detectAnomalies } from '@/lib/metrics';
import { useData } from '@/lib/store';
import type { DailyHealth } from '@/lib/types';

const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
const fmtDate = (d: string) => `${Number(d.slice(5, 7))} 月 ${Number(d.slice(8, 10))} 日`;
const weekday = (d: string) => `周${WEEK[new Date(`${d}T00:00:00`).getDay()]}`;

const ROWS: { key: keyof DailyHealth; name: string; unit?: string; metric?: string }[] = [
  { key: 'steps', name: '步数', unit: '步', metric: 'steps' },
  { key: 'restingHr', name: '静息心率', unit: 'bpm', metric: 'restingHr' },
  { key: 'stress', name: '压力', metric: 'stress' },
  { key: 'activeKcal', name: '活动消耗', unit: 'kcal', metric: 'activeKcal' },
  { key: 'exerciseMin', name: '运动分钟', unit: '分钟', metric: 'exerciseMin' },
  { key: 'floors', name: '楼层', unit: '层', metric: 'floors' },
  { key: 'avgHr', name: '日均心率', unit: 'bpm', metric: 'avgHr' },
  { key: 'spo2', name: '血氧', unit: '%' },
  { key: 'respiration', name: '呼吸', unit: '次/分' },
];

/** 这一天有没有能放上这一页的数。 */
const hasDailyData = (row: DailyHealth) =>
  ROWS.some((field) => typeof row[field.key] === 'number') || !!row.stressSeries?.length;

export default function DailyHealthScreen() {
  // 日常健康按日历日：步数、压力从零点开始算，不跟「醒来才翻天」走。
  const { data, calendarToday: today, loading } = useData();
  const staleDay = useStaleDay();
  // 默认打开最近有数据的那天（不晚于今天）。早上今天往往还没数，打开只剩一句「没有」。
  // 用户翻过之后按用户翻到的那天；数据刷新不把人拉走。
  const latest = useMemo(
    () => data.daily.filter((d) => d.date <= today && hasDailyData(d)).map((d) => d.date).sort().at(-1) ?? today,
    [data.daily, today],
  );
  const [picked, setPicked] = useState<string>();
  const date = picked ?? latest;
  const setDate = (next: string) => setPicked(next);
  const atLatest = date === latest;
  const [limitNote, setLimitNote] = useState<string>();
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isToday = date === today;
  const row = data.daily.find((d) => d.date === date);
  const flash = (text: string) => {
    if (noteTimer.current) clearTimeout(noteTimer.current);
    setLimitNote(text);
    noteTimer.current = setTimeout(() => setLimitNote(undefined), 1600);
  };

  const hr = baseline(data.daily.map((d) => ({ date: d.date, value: d.restingHr })), date, 0.05);
  const items = dailyItems(row, date, hr);
  const voice = dailyVoice(row, isToday ? '今天' : '这天', { avg28: hr.avg28 ?? undefined, trend: hr.trend ?? undefined });

  const hoursSeries = row?.stressSeries?.length ? hourlyStress(row.stressSeries, -new Date().getTimezoneOffset()) : undefined;
  const facts: Facts = {
    today,
    restingHr: typeof row?.restingHr === 'number' ? { value: row.restingHr, avg28: hr.avg28 ?? undefined } : undefined,
    stress: { date, avg: typeof row?.stress === 'number' ? row.stress : undefined, missingHours: hoursSeries ? hoursSeries.filter((v) => v == null).length : undefined },
    deviations: detectAnomalies(data.daily, data.sleep, date).map((a) => a.message),
  };

  if (loading && !data.daily.length) return <Screen refreshable><LoadingBlock /></Screen>;

  return (
    <Screen refreshable floating={<AskButton page="日常健康" items={items} topics={PAGE_TOPICS.daily} facts={facts} />}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="前一天"
          onPress={() => {
            if (noteTimer.current) clearTimeout(noteTimer.current);
            setLimitNote(undefined);
            setDate(addDays(date, -1));
          }}
          style={{ width: touch, height: touch, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ color: colors.sub, fontSize: font.title }}>‹</Text>
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={{ color: colors.text, fontSize: font.headline, fontWeight: '700' }}>
            {isToday ? '今天' : fmtDate(date)}
          </Text>
          <Text style={{ color: limitNote ? colors.text : colors.sub, fontSize: font.footnote, minHeight: 18 }}>
            {limitNote ?? (isToday ? fmtDate(today) : atLatest && !staleDay ? `${weekday(date)} · 今天还没有数据` : weekday(date))}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="后一天"
          accessibilityState={{ disabled: isToday }}
          onPress={() => {
            if (isToday) {
              flash('已经是今天');
              return;
            }
            if (noteTimer.current) clearTimeout(noteTimer.current);
            setLimitNote(undefined);
            setDate(addDays(date, 1));
          }}
          style={{ width: touch, height: touch, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ color: colors.sub, fontSize: font.title, opacity: isToday ? 0.35 : 1 }}>›</Text>
        </Pressable>
      </View>
      {!atLatest && (
        <Pressable accessibilityRole="button" accessibilityLabel={latest === today ? '回到今天' : '回到最近有数据的一天'} onPress={() => { if (noteTimer.current) clearTimeout(noteTimer.current); setLimitNote(undefined); setPicked(undefined); }} style={{ alignSelf: 'center', minHeight: touch, justifyContent: 'center', paddingHorizontal: space.md }}>
          <Muted>{latest === today ? '回到今天' : '回到最近一天'}</Muted>
        </Pressable>
      )}
      {/* 日期已经在上面的翻页头里，这里不再重复（0.1.45）。 */}
      <AgentVoice by={date === today ? '看了你今天的数据' : '看了你这一天的数据'} title={voice.title} body={voice.body || undefined} />
      <DailyGauges row={row} date={date} hr={hr} steps={baseline(data.daily.map((d) => ({ date: d.date, value: d.steps })), date, 0.1)} items={items} facts={facts} />
      <DailyFields row={row} />
    </Screen>
  );
}

/** 它看到的数：有数的项一枚标签，点进趋势。步数、静息心率、压力这三项缺了也列出来，说清楚缺。 */
function dailyItems(row: DailyHealth | undefined, date: string, hr: ReturnType<typeof baseline>): EvidenceItem[] {
  const open = (metric?: string) => (metric ? () => router.push({ pathname: '/trend/[metric]', params: { metric, date } }) : undefined);
  return ROWS.flatMap((field): EvidenceItem[] => {
    const raw = row?.[field.key];
    if (typeof raw !== 'number') {
      return ROWS.indexOf(field) < 3 ? [{ key: field.key, label: field.name, note: '没有', missing: true }] : [];
    }
    const num = field.key === 'steps' ? Math.round(raw).toLocaleString() : String(Math.round(raw));
    // 单位跟着数走（「8,678 步」），灰字只放补充：基线、尺子、只有一次。
    const value = field.unit ? `${num} ${field.unit}` : num;
    let note: string | undefined;
    let tone: string | undefined;
    if (field.key === 'stress') note = '日均 · 0–100';
    if (field.key === 'restingHr' && hr.avg28 != null) {
      note = `平时 ${Math.round(hr.avg28)}`;
      if (hr.trend === 'up') tone = colors.fair;
    }
    if (!field.metric) note = '只有一次';
    return [{ key: field.key, label: field.name, value, note, tone, onPress: open(field.metric) }];
  });
}

/** 日间心率有数时画当天过程图（压力已经在表盘里）。 */
function DailyFields({ row }: { row?: DailyHealth }) {
  const offsetMin = -new Date().getTimezoneOffset();
  const heartLine = row?.stressSeries?.length ? heartSlots(row.stressSeries, offsetMin) : undefined;
  const showHeart = heartLine != null && filledSlots(heartLine) >= 2;
  if (!showHeart) return null;
  return (
    <>
      {showHeart && row ? (
        <DayProcess
          name="日间心率"
          metric="avgHr"
          date={row.date}
          series={heartLine!}
          summary={typeof row.avgHr === 'number' ? Math.round(row.avgHr) : undefined}
          unit="bpm"
          color={colors.blue}
          minSpan={20}
          caption="每 5 分钟，随压力一起采样"
        />
      ) : null}
    </>
  );
}

/** 仪表画了的项，下面的标签里不再列一遍。 */
const GAUGED = new Set<string>(['stress', 'restingHr', 'steps']);

/**
 * 日常健康的仪表：24 小时压力表盘（每小时均值），静息心率和步数两条刻度条。
 * 刻度只来自你自己：静息心率的带是 28 日基线 ±5%（和规则判断偏离同一口径），步数的线是 28 日平均。不设步数目标。
 */
function DailyGauges({ row, date, hr, steps, items, facts }: { row?: DailyHealth; date: string; hr: ReturnType<typeof baseline>; steps: ReturnType<typeof baseline>; items: EvidenceItem[]; facts: Facts }) {
  const offsetMin = -new Date().getTimezoneOffset();
  const hours = row?.stressSeries?.length ? hourlyStress(row.stressSeries, offsetMin) : undefined;
  const showDial = !!hours && hours.filter((v) => v != null).length >= 2;
  const rhr = typeof row?.restingHr === 'number' ? row.restingHr : undefined;
  const stepsVal = typeof row?.steps === 'number' ? row.steps : undefined;
  const open = (metric: string) => () => router.push({ pathname: '/trend/[metric]', params: { metric, date } });
  // 没画成表的项（活动消耗、运动分钟、血氧……，以及缺了的三项）排成同一张卡里的行，不再单列「另外看到的」。
  const rest = items.filter((item) => !GAUGED.has(item.key) || item.missing || (item.key === 'stress' && !showDial));
  const present = rest.filter((item) => !item.missing);
  const missing = rest.filter((item) => item.missing);
  if (!showDial && rhr == null && stepsVal == null && !rest.length) return null;
  const rhrScale = hr.avg28 != null ? centeredScale(hr.avg28, 0.2, rhr) : undefined;
  const stepsMax = Math.max(1000, Math.ceil(Math.max((steps.avg28 ?? 0) * 1.75, (stepsVal ?? 0) * 1.1) / 1000) * 1000);
  return (
    <>
      {showDial ? (
        <Card onPress={open('stress')} accessibilityLabel={`压力 24 小时表盘，日均 ${typeof row?.stress === 'number' ? Math.round(row.stress) : '没有'}，查看趋势`} style={{ alignItems: 'center' }}>
          <View style={{ alignSelf: 'stretch', flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ color: colors.sub, fontSize: font.subhead }}>压力 · 24 小时 ›</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
              <Text style={{ color: colors.sub, fontSize: font.footnote }}>每小时一根 · 0–100</Text>
              <InfoButton ids={['stress']} facts={facts} title="压力是什么" />
            </View>
          </View>
          <StressDial
            hours={hours!}
            center={
              <View style={{ alignItems: 'center' }}>
                <Text style={{ color: colors.text, fontSize: font.figure, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{typeof row?.stress === 'number' ? Math.round(row.stress) : '—'}</Text>
                <Text style={{ color: colors.sub, fontSize: font.footnote }}>日均</Text>
              </View>
            }
          />
          <StressLegend />
          <Text style={{ color: colors.sub, fontSize: font.footnote }}>短灰点 = 那一小时没采到</Text>
        </Card>
      ) : null}
      {rhr != null || stepsVal != null || rest.length ? (
        <Card style={{ paddingVertical: space.xs, gap: 0 }}>
          {rhr != null ? (
            <Pressable accessibilityRole="button" accessibilityLabel={`静息心率 ${Math.round(rhr)}${hr.avg28 != null ? `，平时 ${Math.round(hr.avg28)}` : ''}，查看趋势`} onPress={open('restingHr')} style={({ pressed }) => ({ paddingVertical: space.md, gap: space.sm, opacity: pressed ? 0.7 : 1 })}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <Text style={{ color: colors.sub, fontSize: font.body }}>静息心率 ›</Text>
                <Text style={{ color: hr.trend === 'up' ? colors.fair : colors.text, fontSize: font.lead, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
                  {Math.round(rhr)}<Text style={{ color: colors.sub, fontSize: font.footnote, fontWeight: '500' }}> bpm{hr.avg28 != null ? ` · 平时 ${Math.round(hr.avg28)}` : ''}</Text>
                </Text>
              </View>
              {rhrScale && hr.avg28 != null ? (
                <MeterBar
                  value={frac(rhr, ...rhrScale)}
                  band={[frac(hr.avg28 * 0.95, ...rhrScale), frac(hr.avg28 * 1.05, ...rhrScale)]}
                  tick={frac(hr.avg28, ...rhrScale)}
                  ends={[String(rhrScale[0]), String(rhrScale[1])]}
                  note="带 = 平时 ±5%"
                />
              ) : null}
            </Pressable>
          ) : null}
          {stepsVal != null ? (
            <Pressable accessibilityRole="button" accessibilityLabel={`步数 ${Math.round(stepsVal)}${steps.avg28 != null ? `，平时 ${Math.round(steps.avg28)}` : ''}，查看趋势`} onPress={open('steps')} style={({ pressed }) => ({ paddingVertical: space.md, gap: space.sm, borderTopWidth: rhr != null ? 1 : 0, borderTopColor: colors.border, opacity: pressed ? 0.7 : 1 })}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <Text style={{ color: colors.sub, fontSize: font.body }}>步数 ›</Text>
                <Text style={{ color: colors.text, fontSize: font.lead, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
                  {Math.round(stepsVal).toLocaleString()}<Text style={{ color: colors.sub, fontSize: font.footnote, fontWeight: '500' }}> 步</Text>
                </Text>
              </View>
              <MeterBar
                fill
                value={frac(stepsVal, 0, stepsMax)}
                tick={steps.avg28 != null ? frac(steps.avg28, 0, stepsMax) : undefined}
                ends={['0', stepsMax.toLocaleString()]}
                note={steps.avg28 != null ? '线 = 平时（前 28 天平均）' : undefined}
              />
            </Pressable>
          ) : null}
          {present.map((item, i) => <MetricRow key={item.key} item={item} top={i > 0 || rhr != null || stepsVal != null} />)}
          {/* 没数的项收成一行（2026-11-27，学 betterNow），不一项一行写「没有」。 */}
          {missing.length ? (
            <Text style={{ color: colors.sub, fontSize: font.body, paddingVertical: space.sm, borderTopWidth: present.length || rhr != null || stepsVal != null ? 1 : 0, borderTopColor: colors.border }}>
              还没有：{missing.map((m) => m.label).join('、')}
            </Text>
          ) : null}
          <InfoButton ids={['restingHr', 'baseline', 'deviation']} facts={facts} title="这几项是什么" label="这几项是什么" />
        </Card>
      ) : null}
    </>
  );
}

/** 刻度卡里的一行：左名字，右数和灰字，能点的带箭头；缺的写「没有」。 */
function MetricRow({ item, top }: { item: EvidenceItem; top: boolean }) {
  const body = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
      <Text style={{ color: colors.sub, fontSize: font.body, flex: 1 }}>{item.label}{item.onPress ? ' ›' : ''}</Text>
      <Text style={{ color: item.missing ? colors.sub : item.tone ?? colors.text, fontSize: item.missing ? font.body : font.lead, fontWeight: item.missing ? '400' : '700', fontVariant: ['tabular-nums'] }}>
        {item.missing ? '没有' : item.value}
        {item.note && !item.missing ? <Text style={{ color: colors.sub, fontSize: font.footnote, fontWeight: '500' }}> · {item.note}</Text> : null}
      </Text>
    </View>
  );
  const style = { minHeight: touch, justifyContent: 'center' as const, paddingVertical: space.sm, borderTopWidth: top ? 1 : 0, borderTopColor: colors.border };
  if (!item.onPress) return <View style={style} accessible accessibilityLabel={`${item.label} ${item.missing ? '没有' : item.value ?? ''}${item.note ? `，${item.note}` : ''}`}>{body}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${item.label} ${item.value ?? ''}${item.note ? `，${item.note}` : ''}，查看趋势`} onPress={item.onPress} style={({ pressed }) => [style, { opacity: pressed ? 0.7 : 1 }]}>
      {body}
    </Pressable>
  );
}

function DayProcess({
  name,
  metric,
  date,
  series,
  summary,
  unit,
  color,
  domain,
  minSpan,
  caption,
}: {
  name: string;
  metric: string;
  date: string;
  series: (number | undefined)[];
  summary?: number;
  unit?: string;
  color: string;
  domain?: [number, number];
  minSpan?: number;
  caption: string;
}) {
  const [selected, setSelected] = useState<number | undefined>();
  const point = selected != null ? series[selected] : undefined;
  const fallback = summary ?? meanOf(series);
  const headline = point != null ? Math.round(point) : selected != null ? undefined : fallback;
  // 没按住时大数字是这一天的日均，写明，免得和曲线末端那一刻对不上。
  const detail = selected == null ? `日均 · ${caption}` : point != null ? slotClock(selected) : `${slotClock(selected)} 没有采样`;
  return (
    <Card style={{ gap: space.sm }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${name}，查看多日趋势`}
        onPress={() => router.push({ pathname: '/trend/[metric]', params: { metric, date } })}
        style={({ pressed }) => ({ minHeight: touch, justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.sub, fontSize: font.body }}>{name}</Text>
            <Text style={{ color: colors.sub, fontSize: font.footnote }}>{detail}</Text>
          </View>
          <Text style={{ color: colors.text, fontSize: font.display, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
            {headline != null ? headline : '—'}
            {unit && headline != null ? <Text style={{ color: colors.sub, fontSize: font.footnote, fontWeight: '500' }}> {unit}</Text> : null}
          </Text>
          <ChevronIcon color={colors.sub} size={18} />
        </View>
      </Pressable>
      <LineChart
        series={[{ values: series, color }]}
        height={140}
        domain={domain}
        minSpan={minSpan}
        labels={['00:00', '24:00']}
        selected={selected}
        onSelect={setSelected}
        selectHint="按住可查看这一刻"
        accessibilityLabel={`${name}，当天每 5 分钟`}
      />
    </Card>
  );
}

function meanOf(values: (number | undefined)[]): number | undefined {
  const nums = values.filter((value): value is number => value != null);
  if (!nums.length) return undefined;
  return Math.round(nums.reduce((sum, value) => sum + value, 0) / nums.length);
}
