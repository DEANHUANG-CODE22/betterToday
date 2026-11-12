import { router } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { LineChart } from '@/components/charts';
import { ChevronIcon } from '@/components/icons';
import { colors, font, space, touch } from '@/components/theme';
import { Card, LoadingBlock, Muted, Screen } from '@/components/ui';
import { filledSlots, heartSlots, slotClock, stressSlots } from '@/lib/daySeries';
import { addDays, baseline } from '@/lib/metrics';
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
  const { data, today, loading } = useData();
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

  if (loading && !data.daily.length) return <Screen><LoadingBlock /></Screen>;

  return (
    <Screen>
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
            {limitNote ?? (isToday ? fmtDate(today) : atLatest ? `${weekday(date)} · 今天还没有数据` : weekday(date))}
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
      <DailyFields row={row} date={date} dateLabel={fmtDate(date)} daily={data.daily} />
    </Screen>
  );
}

function DailyFields({ row, date, dateLabel, daily }: { row?: DailyHealth; date: string; dateLabel: string; daily: DailyHealth[] }) {
  const offsetMin = -new Date().getTimezoneOffset();
  const stressLine = row?.stressSeries?.length ? stressSlots(row.stressSeries, offsetMin) : undefined;
  const heartLine = row?.stressSeries?.length ? heartSlots(row.stressSeries, offsetMin) : undefined;
  const showStress = stressLine != null && filledSlots(stressLine) >= 2;
  const showHeart = heartLine != null && filledSlots(heartLine) >= 2;
  const present = ROWS.flatMap((field) => {
    if (field.key === 'stress' && showStress) return [];
    if (field.key === 'avgHr' && showHeart) return [];
    const raw = row?.[field.key];
    if (typeof raw !== 'number') return [];
    return [{ ...field, raw }];
  });
  const absent = ROWS.slice(0, 3).filter((field) => typeof row?.[field.key] !== 'number').map((field) => field.name);
  const hr = baseline(daily.map((d) => ({ date: d.date, value: d.restingHr })), date, 0.05);
  if (!present.length && !showStress && !showHeart) return <Muted>{dateLabel}没有步数、静息心率和压力。</Muted>;
  return (
    <>
      {showStress && row?.stressSeries ? (
        <DayProcess
          name="压力"
          metric="stress"
          date={date}
          series={stressLine!}
          summary={typeof row.stress === 'number' ? Math.round(row.stress) : undefined}
          color={colors.text}
          domain={[0, 100]}
          caption="每 5 分钟"
        />
      ) : null}
      {showHeart && row?.stressSeries ? (
        <DayProcess
          name="日间心率"
          metric="avgHr"
          date={date}
          series={heartLine!}
          summary={typeof row.avgHr === 'number' ? Math.round(row.avgHr) : undefined}
          unit="bpm"
          color={colors.blue}
          minSpan={20}
          caption="每 5 分钟，随压力一起采样"
        />
      ) : null}
      {present.length ? (
      <Card style={{ paddingVertical: space.xs, gap: 0 }}>
        {present.map((field, index) => {
          const hint = field.key === 'stress'
            ? { text: '0–100', color: colors.sub }
            : field.key === 'restingHr' && hr.value != null && hr.avg28 != null
            ? hr.trend === 'up'
              ? { text: `高于 28 日基线 ${Math.round(hr.avg28)}`, color: colors.fair }
              : hr.trend === 'down'
                ? { text: `低于 28 日基线 ${Math.round(hr.avg28)}`, color: colors.good }
                : { text: `贴近 28 日基线 ${Math.round(hr.avg28)}`, color: colors.sub }
            : undefined;
          const value = field.key === 'steps' ? Math.round(field.raw).toLocaleString() : String(Math.round(field.raw));
          return (
            <Pressable
              key={field.key}
              accessibilityRole={field.metric ? 'button' : 'text'}
              accessibilityLabel={`${field.name} ${value}${field.unit ? ` ${field.unit}` : ''}${field.metric ? '，查看趋势' : ''}`}
              disabled={!field.metric}
              onPress={field.metric ? () => router.push({ pathname: '/trend/[metric]', params: { metric: field.metric!, date } }) : undefined}
              style={({ pressed }) => ({
                minHeight: touch,
                justifyContent: 'center',
                paddingVertical: space.sm,
                borderTopWidth: index === 0 ? 0 : 1,
                borderTopColor: colors.border,
                opacity: pressed && field.metric ? 0.7 : 1,
              })}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                <Text style={{ color: colors.sub, fontSize: font.body, flex: 1 }}>{field.name}</Text>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ color: field.metric ? colors.text : colors.sub, fontSize: font.lead, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
                    {value}
                    {field.unit ? <Text style={{ color: colors.sub, fontSize: font.footnote, fontWeight: '500' }}> {field.unit}</Text> : null}
                  </Text>
                  {hint ? <Text style={{ color: hint.color, fontSize: font.footnote }}>{hint.text}</Text> : null}
                  {!field.metric ? <Text style={{ color: colors.sub, fontSize: font.caption }}>只有这一次</Text> : null}
                </View>
                {field.metric ? <ChevronIcon color={colors.sub} size={18} /> : null}
              </View>
            </Pressable>
          );
        })}
      </Card>
      ) : null}
      {absent.length ? <Muted>没有{absent.join('、')}。</Muted> : null}
    </>
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
  const detail = selected == null ? caption : point != null ? slotClock(selected) : `${slotClock(selected)} 没有采样`;
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
