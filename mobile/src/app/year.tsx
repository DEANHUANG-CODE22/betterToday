import { useMemo } from 'react';
import { Text, View } from 'react-native';
import { colors, font, space } from '@/components/theme';
import { Card, LoadingBlock, Muted, Screen } from '@/components/ui';
import { useData } from '@/lib/store';
import { sessionsByDate, yearMonths } from '@/lib/volume';

export default function YearScreen() {
  const { data, today, loading } = useData();
  const months = useMemo(() => yearMonths(today, sessionsByDate(data.activities)), [data.activities, today]);
  const total = months.reduce((sum, month) => sum + (month.future ? 0 : month.count), 0);
  const max = Math.max(1, ...months.map((month) => month.count));
  const year = today.slice(0, 4);

  if (loading && !data.activities.length) return <Screen><LoadingBlock /></Screen>;

  return (
    <Screen>
      <Card>
        <Muted style={{ fontSize: font.footnote }}>{year}</Muted>
        <Text style={{ color: colors.text, fontSize: font.figure, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
          {total}
          <Text style={{ color: colors.sub, fontSize: font.footnote, fontWeight: '500' }}> 次</Text>
        </Text>
        <View style={{ gap: space.sm, marginTop: space.sm }}>
          {months.map((month) => (
            <View key={month.label} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 24 }}>
              <Text style={{ width: 40, color: colors.sub, fontSize: font.footnote }}>{month.label}</Text>
              <View style={{ flex: 1, height: 8, borderRadius: 2, backgroundColor: month.known ? colors.cardAlt : 'transparent' }}>
                {month.known && month.count > 0 ? (
                  <View style={{ width: `${(month.count / max) * 100}%`, height: '100%', borderRadius: 2, backgroundColor: colors.blue }} />
                ) : null}
              </View>
              <Text style={{ width: 28, textAlign: 'right', color: colors.text, fontSize: font.footnote, fontVariant: ['tabular-nums'] }}>
                {month.known ? String(month.count) : ''}
              </Text>
            </View>
          ))}
        </View>
      </Card>
    </Screen>
  );
}
