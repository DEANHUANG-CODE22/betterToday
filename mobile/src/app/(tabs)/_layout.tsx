import { useRef } from 'react';
import { Link, Tabs } from 'expo-router';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { BoltIcon, GearIcon, HeartIcon, MoonIcon, RefreshIcon } from '@/components/icons';
import { colors, space, touch } from '@/components/theme';
import { useData } from '@/lib/store';
import { useTodayAdvice } from '@/lib/useTodayAdvice';

function AdviceSync() {
  useTodayAdvice();
  return null;
}

function RefreshButton() {
  const { loading, sync } = useData();
  const pending = useRef(false);

  const onPress = () => {
    if (loading || pending.current) return;
    pending.current = true;
    void sync().finally(() => {
      pending.current = false;
    });
  };

  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      accessibilityRole="button"
      accessibilityLabel="刷新"
      accessibilityState={{ disabled: loading, busy: loading }}
      style={{ width: touch, height: touch, alignItems: 'center', justifyContent: 'center' }}
    >
      {loading ? <ActivityIndicator color={colors.sub} size="small" /> : <RefreshIcon color={colors.sub} />}
    </Pressable>
  );
}

function SettingsButton() {
  return (
    <Link href="/settings" asChild>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="设置"
        style={{ width: touch, height: touch, alignItems: 'center', justifyContent: 'center' }}
      >
        <GearIcon color={colors.sub} />
      </Pressable>
    </Link>
  );
}

function HeaderActions() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
      <RefreshButton />
      <SettingsButton />
    </View>
  );
}

export default function TabLayout() {
  return (
    <>
    <AdviceSync />
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        headerRight: () => <HeaderActions />,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.sub,
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: '睡眠与恢复', tabBarIcon: ({ color }) => <MoonIcon color={color} /> }} />
      <Tabs.Screen name="data" options={{ title: '日常健康', tabBarIcon: ({ color }) => <HeartIcon color={color} /> }} />
      <Tabs.Screen name="sport" options={{ title: '运动', tabBarIcon: ({ color }) => <BoltIcon color={color} /> }} />
    </Tabs>
    </>
  );
}
