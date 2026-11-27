import type { BottomTabBarProps } from 'expo-router/build/layouts/Tabs';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, Pressable, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, font, space } from './theme';

/**
 * 悬浮底栏（2026-11-27，学 betterNow 的 iOS 26 Tab 栏）：
 * 往下滚缩成左下角一颗小胶囊（只剩当前页图标），往上滚、滚回顶部、点它或换页就展开。
 * 0.1.45：同方向累计滚动才触发；只动 opacity / transform，交给原生驱动。
 * 0.1.46：壳连续形变、图标滑到圆心；弹簧驱动，中途反向会从当前位置掉头。
 * 安卓没有系统液态玻璃，用仿玻璃：半透明底 + 细亮边 + 阴影（colors.glass / glassBorder）。
 * 「问一句」固定在底栏上方，不跟着往下落（缩起后落到原来「运动」的位置容易误点，0.1.45）。
 */
export const BAR_H = 64;
export const BAR_GAP = 10;
/** 展开时各项离壳边的距离。 */
const PAD = 6;
/** 壳拼缝的重叠宽度。 */
const SEAM = 4;
/** 同一方向累计滚过这么多才缩 / 展开：慢慢推也能触发，手抖不会来回跳（0.1.45）。 */
const TRIGGER = 32;
const TOP = 24;
/** 接近临界阻尼：利落、几乎不回弹；回弹的那一点被各插值 clamp 掉。 */
const SPRING = { stiffness: 320, damping: 32, mass: 1 } as const;
const clamp = { extrapolate: 'clamp' } as const;

type Listener = (collapsed: boolean) => void;

interface Chrome {
  /** 0 = 展开，1 = 缩起。只用原生驱动能跑的属性（opacity / transform）。 */
  progress: Animated.Value;
  /** 页面报滚动：y 是这页自己的位置，dy 是和这页上一次的差。 */
  report: (y: number, dy: number) => void;
  expand: () => void;
  /** 底栏订阅缩起状态（换 pointerEvents 用），不放进 context 值里，免得整页跟着重渲染。 */
  subscribe: (fn: Listener) => () => void;
}

const Ctx = createContext<Chrome | null>(null);

/** 页面里用：不在 Tab 里（设置、趋势……）时为空，什么都不做。 */
export function useTabChrome() {
  return useContext(Ctx);
}

/** 每个 Screen 自己记上一次的位置，三个 Tab 互不干扰。 */
export function useChromeScroll() {
  const chrome = useTabChrome();
  const lastY = useRef(0);
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const dy = y - lastY.current;
    lastY.current = y;
    chrome?.report(y, dy);
  }, [chrome]);
  return chrome ? onScroll : undefined;
}

export function TabChromeProvider({ children }: { children: ReactNode }) {
  const [progress] = useState(() => new Animated.Value(0));
  const collapsed = useRef(false);
  const acc = useRef(0);
  const listeners = useRef(new Set<Listener>());
  const to = useCallback((c: boolean) => {
    if (collapsed.current === c) return;
    collapsed.current = c;
    listeners.current.forEach((fn) => fn(c));
    // 弹簧：动画进行中反向，会从当前位置掉头，不跳、不重来（可打断）。
    Animated.spring(progress, { toValue: c ? 1 : 0, ...SPRING, useNativeDriver: true }).start();
  }, [progress]);
  const report = useCallback((y: number, dy: number) => {
    if (y < TOP) { acc.current = 0; to(false); return; }
    if (dy === 0) return;
    if (Math.sign(dy) !== Math.sign(acc.current)) acc.current = 0;
    acc.current += dy;
    if (acc.current > TRIGGER) to(true);
    else if (acc.current < -TRIGGER) to(false);
  }, [to]);
  const expand = useCallback(() => { acc.current = 0; to(false); }, [to]);
  const subscribe = useCallback((fn: Listener) => {
    listeners.current.add(fn);
    return () => { listeners.current.delete(fn); };
  }, []);
  const value = useMemo(() => ({ progress, report, expand, subscribe }), [progress, report, expand, subscribe]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** 悬浮控件共用的仿玻璃外观。阴影压轻：安卓的 elevation 在半透明底下会透出来。 */
export function glassStyle(radius: number) {
  return {
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  } as const;
}

/**
 * 形变而不是切换（0.1.46）：玻璃壳拆成左帽、中段、右帽三块——中段 scaleX 收到 0、右帽左移，
 * 整条连续地缩成左下角一颗圆；当前页的图标从自己的格子滑到圆心，其余项一边往左收一边淡出。
 * 只动 transform / opacity，原生驱动；壳的三块用实色，整组统一降透明度，拼缝不叠色。
 */
export function FloatingTabBar({ state, descriptors, emitter, navigateToTab }: BottomTabBarProps) {
  const chrome = useTabChrome();
  const insets = useSafeAreaInsets();
  const [fallback] = useState(() => new Animated.Value(0));
  const p = chrome?.progress ?? fallback;
  const expand = chrome?.expand;
  const [w, setW] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => chrome?.subscribe(setCollapsed), [chrome]);
  // 换页就展开。
  useEffect(() => { expand?.(); }, [state.index, expand]);

  const n = state.routes.length;
  const H = BAR_H;
  const R = H / 2;
  const itemW = w ? (w - PAD * 2) / n : 0;
  const centerOf = (i: number) => PAD + itemW * (i + 0.5);

  // 选中底块在 Tab 间滑动；滑动的图标直接跟到新格子（不飞过去）。
  const [hl] = useState(() => new Animated.Value(state.index));
  const [iconAt] = useState(() => new Animated.Value(state.index));
  useEffect(() => {
    iconAt.setValue(state.index);
    Animated.spring(hl, { toValue: state.index, ...SPRING, useNativeDriver: true }).start();
  }, [state.index, hl, iconAt]);

  const shrink = Math.max(0, w - H);
  const midScale = p.interpolate({ inputRange: [0, 1], outputRange: [1, 0], ...clamp });
  const capShift = p.interpolate({ inputRange: [0, 1], outputRange: [0, -shrink], ...clamp });
  const rowOpacity = p.interpolate({ inputRange: [0, 0.35], outputRange: [1, 0], ...clamp });
  // 图标 x = 格子中心 ×(1-p) + 圆心 × p；y 从「图标在字上面」回到正中。
  const slotX = Animated.add(PAD + itemW * 0.5, Animated.multiply(iconAt, itemW));
  const pc = p.interpolate({ inputRange: [0, 1], outputRange: [0, 1], ...clamp });
  const iconX = Animated.add(Animated.multiply(slotX, Animated.subtract(1, pc)), Animated.multiply(pc, R));
  const iconY = pc.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] });
  const iconScale = pc.interpolate({ inputRange: [0, 1], outputRange: [1, 1.1] });
  const ICON = 22;
  const current = state.routes[state.index];
  const movingIcon = descriptors[current.key].options.tabBarIcon?.({ focused: true, color: colors.text, size: ICON });
  const piece = { position: 'absolute' as const, top: 0, height: H, backgroundColor: colors.glassSolid, borderColor: colors.glassBorder };

  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: space.lg, paddingBottom: insets.bottom + BAR_GAP }}
    >
      <View pointerEvents="box-none" onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height: H }}>
        {w > 0 && (
          <>
            {/* 壳：实色三块，整组降透明度。 */}
            <View pointerEvents="none" needsOffscreenAlphaCompositing style={{ position: 'absolute', left: 0, top: 0, width: w, height: H, opacity: colors.glassAlpha }}>
              {/* 两个帽各自往里多伸 SEAM 的平直部分，盖住中段两头：中段缩得再窄也不会在拼缝露出一道线。 */}
              <Animated.View style={[piece, { left: R, width: shrink, borderTopWidth: 1, borderBottomWidth: 1, transform: [{ scaleX: midScale }], transformOrigin: 'left center' }]} />
              <View style={[piece, { left: 0, width: R + SEAM, borderWidth: 1, borderRightWidth: 0, borderTopLeftRadius: R, borderBottomLeftRadius: R }]} />
              <Animated.View style={[piece, { left: w - R - SEAM, width: R + SEAM, borderWidth: 1, borderLeftWidth: 0, borderTopRightRadius: R, borderBottomRightRadius: R, transform: [{ translateX: capShift }] }]} />
            </View>

            {/* 展开时的各项：选中底块滑动；缩的时候往圆心收、淡出。 */}
            <Animated.View pointerEvents={collapsed ? 'none' : 'box-none'} style={{ position: 'absolute', left: 0, top: 0, width: w, height: H, opacity: rowOpacity }}>
              <Animated.View
                pointerEvents="none"
                style={{ position: 'absolute', top: 6, left: 0, width: itemW, height: H - 12, borderRadius: (H - 12) / 2, backgroundColor: colors.border, transform: [{ translateX: Animated.add(PAD, Animated.multiply(hl, itemW)) }] }}
              />
              <View style={{ flexDirection: 'row', paddingHorizontal: PAD, height: H, alignItems: 'center' }}>
                {state.routes.map((route, index) => {
                  const { options } = descriptors[route.key];
                  const focused = state.index === index;
                  const color = focused ? colors.text : colors.sub;
                  const label = typeof options.title === 'string' ? options.title : route.name;
                  const toward = p.interpolate({ inputRange: [0, 1], outputRange: [0, (R - centerOf(index)) * 0.4], ...clamp });
                  return (
                    <Pressable
                      key={route.key}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: focused }}
                      accessibilityLabel={label}
                      onPress={() => {
                        const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                        if (!focused && !event.defaultPrevented) navigateToTab(route.key);
                      }}
                      style={({ pressed }) => ({ flex: 1, height: H - 12, opacity: pressed ? 0.7 : 1 })}
                    >
                      <Animated.View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, transform: [{ translateX: toward }] }}>
                        {/* 选中项的图标由下面那颗会滑的图标画，这里只占位。 */}
                        <View style={{ opacity: focused ? 0 : 1 }}>{options.tabBarIcon?.({ focused, color, size: ICON })}</View>
                        <Text numberOfLines={1} style={{ color, fontSize: font.caption, fontWeight: focused ? '700' : '500' }}>{label}</Text>
                      </Animated.View>
                    </Pressable>
                  );
                })}
              </View>
            </Animated.View>

            {/* 当前页图标：从格子滑到圆心，全程不消失。 */}
            <Animated.View
              pointerEvents="none"
              style={{ position: 'absolute', left: -ICON / 2, top: R - ICON / 2, width: ICON, height: ICON, transform: [{ translateX: iconX }, { translateY: iconY }, { scale: iconScale }] }}
            >
              {movingIcon}
            </Animated.View>

            {/* 缩起时点圆：展开。 */}
            <Pressable
              pointerEvents={collapsed ? 'auto' : 'none'}
              accessibilityRole="button"
              accessibilityLabel="展开底栏"
              accessibilityElementsHidden={!collapsed}
              onPress={() => expand?.()}
              style={{ position: 'absolute', left: 0, top: 0, width: H, height: H }}
            />
          </>
        )}
      </View>
    </View>
  );
}
