import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { colors, font, radius, space, touch } from '@/components/theme';
import { Card, Muted, Screen, SectionTitle } from '@/components/ui';
import { dailyAdvice } from '@/lib/advice';
import { buildScenarios } from '@/lib/scenarios';
import { useData } from '@/lib/store';

const KIND_LABEL: Record<string, string> = {
  intensity: '强度课',
  aerobic: '有氧',
  recovery: '回归期',
  rest: '休息',
  unknown: '不给建议',
};

const CONF_LABEL: Record<string, string> = { high: '把握高', medium: '把握中', low: '把握低' };

/**
 * 演练模式（正式包内的隐藏页，设置页连点版本号 5 次进入）。
 *
 * 每行显示「期望 vs 实际」：期望来自 PRD，实际是当前代码跑出来的。
 * 红色那行说明代码不对——这正是这个页面存在的理由：
 * 以前只能装到手机上碰运气，而碰运气发现不了「中断第 62 天」那类错。
 */
export default function ScenarioScreen() {
  const { today, injectScenario, sync, loading } = useData();
  const [busy, setBusy] = useState<string>();
  const scenarios = useMemo(() => buildScenarios(today), [today]);
  const rows = useMemo(
    () => scenarios.map((sc) => {
      const advice = dailyAdvice(sc.dataset, today);
      return { sc, advice, ok: advice.kind === sc.expect.kind && advice.confidence === sc.expect.confidence };
    }),
    [scenarios, today],
  );
  const failed = rows.filter((row) => !row.ok).length;

  return (
    <Screen mockNote={null}>
      <Card>
        <Text style={{ color: colors.text, fontSize: font.headline, fontWeight: '700' }}>演练模式</Text>
        <Muted>
          每个场景是一套造出来的数据。点「载入」会清空本机数据，首页就变成那个场景下的样子；
          真实数据要退出后再同步一次才会回来。
        </Muted>
        <Muted style={{ color: failed ? colors.poor : colors.good }}>
          {failed ? `${failed} 个场景和期望不一致——这是代码问题，不是数据问题。` : '全部场景都和期望一致。'}
        </Muted>
      </Card>

      <SectionTitle>场景</SectionTitle>
      {rows.map(({ sc, advice, ok }) => (
        <Card key={sc.id} style={{ borderColor: ok ? colors.border : colors.poor, borderWidth: 1 }}>
          <Text style={{ color: colors.text, fontSize: font.callout, fontWeight: '700' }}>{sc.title}</Text>
          <Muted>{sc.why}</Muted>
          <Text style={{ color: ok ? colors.good : colors.poor, fontSize: font.subhead, fontWeight: '600' }}>
            {ok ? '✓' : '✗'} 期望 {KIND_LABEL[sc.expect.kind]} · {CONF_LABEL[sc.expect.confidence]}｜实际 {KIND_LABEL[advice.kind]} · {CONF_LABEL[advice.confidence]}
          </Text>
          <Text style={{ color: colors.sub, fontSize: font.footnote }}>首页会写：{advice.title}</Text>
          <Pressable
            accessibilityRole="button"
            disabled={!!busy}
            onPress={async () => {
              setBusy(sc.id);
              try {
                await injectScenario(sc.dataset);
                router.push('/');
              } finally {
                setBusy(undefined);
              }
            }}
            style={({ pressed }) => ({
              minHeight: touch,
              justifyContent: 'center',
              alignItems: 'center',
              borderRadius: radius,
              backgroundColor: colors.accent,
              opacity: pressed || busy ? 0.6 : 1,
            })}
          >
            {busy === sc.id ? <ActivityIndicator color={colors.bg} /> : <Text style={{ color: colors.bg, fontWeight: '700', fontSize: font.callout }}>载入并看首页</Text>}
          </Pressable>
        </Card>
      ))}

      <SectionTitle>退出</SectionTitle>
      <Card>
        <Muted>退出演练会重新拉真实数据（没有登录就回到模拟数据）。</Muted>
        <Pressable
          accessibilityRole="button"
          disabled={loading}
          onPress={() => { void sync(); }}
          style={({ pressed }) => ({
            minHeight: touch,
            justifyContent: 'center',
            alignItems: 'center',
            borderRadius: radius,
            borderWidth: 1,
            borderColor: colors.border,
            opacity: pressed || loading ? 0.6 : 1,
          })}
        >
          {loading ? <ActivityIndicator color={colors.sub} /> : <Text style={{ color: colors.text, fontWeight: '600', fontSize: font.callout }}>退出演练 · 重新同步</Text>}
        </Pressable>
      </Card>
    </Screen>
  );
}
