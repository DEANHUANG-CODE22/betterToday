import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { getMeta, setMeta } from '@/lib/db';
import { applyScheme, type Scheme } from './theme';

/** 外观：跟随系统 / 浅色 / 深色（2026-11-27）。存在本机 meta 表里。 */
export type Appearance = 'system' | 'light' | 'dark';

const Ctx = createContext<{ appearance: Appearance; scheme: Scheme; setAppearance: (a: Appearance) => void }>({
  appearance: 'system',
  scheme: 'dark',
  setAppearance: () => {},
});

export function useTheme() {
  return useContext(Ctx);
}

/**
 * 算出当前主题，原地换掉 `colors`，并把 children 用 scheme 当 key 重挂一次，
 * 让所有直接读 `colors.x` 的组件都拿到新值。expo-router 会按当前路由恢复，停在原来那页。
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [appearance, setLocal] = useState<Appearance>('system');
  useEffect(() => {
    void getMeta('appearance').then((v) => {
      if (v === 'light' || v === 'dark' || v === 'system') setLocal(v);
    });
  }, []);
  const setAppearance = useCallback((a: Appearance) => {
    setLocal(a);
    void setMeta('appearance', a);
  }, []);
  const scheme: Scheme = appearance === 'system' ? (system === 'light' ? 'light' : 'dark') : appearance;
  // 在渲染子树之前换好颜色（幂等）。
  applyScheme(scheme);
  return (
    <Ctx.Provider value={{ appearance, scheme, setAppearance }}>
      <ThemedTree key={scheme}>{children}</ThemedTree>
    </Ctx.Provider>
  );
}

function ThemedTree({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
