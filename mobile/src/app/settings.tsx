import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Card, Muted, Screen, SectionTitle } from '@/components/ui';
import { colors, font, radius, space, touch } from '@/components/theme';
import { RETURN_KIND_LABEL, RETURN_KIND_ORDER, type ReturnKind } from '@/lib/advice';
import { defaultRegion, loadSession } from '@/lib/coros/oauth';
import { fmtDateTime, toISODate } from '@/lib/metrics';
import { useData } from '@/lib/store';

function Button({ label, onPress, tone = 'accent', disabled }: { label: string; onPress: () => void; tone?: 'accent' | 'ghost'; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.btn, tone === 'ghost' && styles.ghost, { opacity: pressed || disabled ? 0.6 : 1 }]}
    >
      <Text style={[styles.btnText, tone === 'ghost' && { color: colors.text }]}>{label}</Text>
    </Pressable>
  );
}

export default function Settings() {
  const { data, today, source, loading, lastSync, lastReport, connect, disconnect, sync, returnKind, returnKindFor, answerReturnKind, clearReturnKind } = useData();
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [taps, setTaps] = useState(0);
  const lastTap = useRef(0);

  // 最后一条训练记录的日期：声明的「本次中断」从这天起算。
  const lastTraining = data.activities.reduce<string | undefined>(
    (latest, a) => {
      const d = toISODate(new Date(a.startTime));
      return !latest || d > latest ? d : latest;
    },
    undefined,
  );

  const declare = (kind: ReturnKind) => {
    void answerReturnKind(kind, lastTraining ?? today);
  };

  // 连点版本号 5 次进演练模式（正式包里藏起来，不给日常使用添乱）。
  const onVersionTap = () => {
    const now = Date.now();
    const next = now - lastTap.current < 1200 ? taps + 1 : 1;
    lastTap.current = now;
    setTaps(next);
    if (next >= 5) {
      setTaps(0);
      router.push('/scenario');
    }
  };

  const version = Constants.expoConfig?.version ?? '';
  const versionCode = Constants.expoConfig?.android?.versionCode;

  useEffect(() => {
    loadSession().then((s) => setConnected(!!s));
  }, [source]);

  return (
    <Screen mockNote="当前显示的是模拟数据。在这里连接 COROS 后切换为真实数据。">
      <SectionTitle>COROS 账户</SectionTitle>
      <Card>
        <Text style={{ color: colors.text, fontSize: font.callout, fontWeight: '600' }}>{connected ? '已连接' : '未连接'}</Text>
        <Muted>
          数据源：{source === 'coros' ? 'COROS（真实数据）' : '模拟数据'} · 区域：{defaultRegion === 'cn' ? '中国区' : '国际区'}
          {lastSync ? `\n上次同步：${fmtDateTime(lastSync)}` : ''}
        </Muted>
        <View style={{ gap: space.sm, marginTop: space.sm }}>
          {connected ? (
            <>
              <Button label={loading ? '同步中…' : '立即同步'} onPress={sync} disabled={loading} />
              <Button label="断开连接并回到模拟数据" tone="ghost" onPress={disconnect} />
            </>
          ) : (
            <Button
              label={busy ? '正在登录高驰…' : '连接 COROS'}
              onPress={async () => {
                setBusy(true);
                try {
                  await connect();
                } finally {
                  setBusy(false);
                }
              }}
              disabled={loading || busy}
            />
          )}
          {(loading || busy) && <ActivityIndicator color={colors.sub} />}
        </View>
      </Card>

      {lastReport && (
        <>
          <SectionTitle>上次同步结果</SectionTitle>
          <Card plain>
            {(Object.keys(lastReport.counts) as (keyof typeof lastReport.counts)[]).map((k) => (
              <Muted key={k}>
                {k}：{lastReport.counts[k]} 条{lastReport.tools[k] ? `（工具 ${lastReport.tools[k]}）` : '（未找到对应工具）'}
              </Muted>
            ))}
            {lastReport.errors.map((e) => (
              <Muted key={e} style={{ color: colors.poor }}>
                {e}
              </Muted>
            ))}
          </Card>
        </>
      )}

      <SectionTitle>我现在的状态</SectionTitle>
      <Card>
        <Muted>
          中断满 7 天时我会问你一次。也可以现在先说——它决定回来那几周走多慢。
          声明只在进入回归期时起作用，不会提前改变今天的建议。
        </Muted>
        <Text style={{ color: colors.text, fontSize: font.callout, fontWeight: '600' }}>
          {returnKind ? `当前：${RETURN_KIND_LABEL[returnKind]}` : '还没声明（默认按 3–4 周算）'}
        </Text>
        {returnKind && returnKindFor ? <Muted>这次中断从 {returnKindFor} 起算</Muted> : null}
        <View style={{ gap: space.xs }}>
          {RETURN_KIND_ORDER.map((kind) => (
            <Pressable
              key={kind}
              accessibilityRole="button"
              accessibilityState={{ selected: returnKind === kind }}
              onPress={() => declare(kind)}
              style={({ pressed }) => ({
                minHeight: touch,
                justifyContent: 'center',
                borderTopWidth: 1,
                borderTopColor: colors.border,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Text style={{ color: returnKind === kind ? colors.accent : colors.text, fontSize: font.body, fontWeight: returnKind === kind ? '700' : '400' }}>
                {RETURN_KIND_LABEL[kind]}
                {returnKind === kind ? '  ✓' : ''}
              </Text>
            </Pressable>
          ))}
        </View>
        {returnKind ? (
          <Pressable accessibilityRole="button" onPress={() => { void clearReturnKind(); }} style={{ minHeight: 36, justifyContent: 'center' }}>
            <Muted>清掉，下次中断重新问</Muted>
          </Pressable>
        ) : null}
      </Card>

      <SectionTitle>关于授权</SectionTitle>
      <Card plain>
        <Muted>
          点连接后会打开高驰登录页。登录完成会自动回到这里并开始同步。授权只发生在你的手机和高驰之间，token 存在本机安全存储里。
        </Muted>
      </Card>

      <Pressable accessibilityRole="button" onPress={onVersionTap} style={{ minHeight: touch, justifyContent: 'center', alignItems: 'center' }}>
        <Muted>betterToday {version}{versionCode ? `（${versionCode}）` : ''}</Muted>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  btn: { backgroundColor: colors.accent, borderRadius: radius, minHeight: touch, paddingHorizontal: space.lg, alignItems: 'center', justifyContent: 'center' },
  ghost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
  btnText: { color: colors.bg, fontWeight: '700', fontSize: font.callout },
});
