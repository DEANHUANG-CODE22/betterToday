import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { colors } from '@/components/theme';
import { DataProvider } from '@/lib/store';

export default function RootLayout() {
  return (
    <DataProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="activity/[id]" options={{ title: '运动详情' }} />
        <Stack.Screen name="trend/[metric]" options={{ title: '趋势' }} />
        <Stack.Screen name="ability" options={{ title: '运动能力' }} />
        <Stack.Screen name="year" options={{ title: '今年' }} />
        <Stack.Screen name="scenario" options={{ title: '演练模式' }} />
        <Stack.Screen name="settings" options={{ title: '设置', presentation: 'modal' }} />
      </Stack>
    </DataProvider>
  );
}
