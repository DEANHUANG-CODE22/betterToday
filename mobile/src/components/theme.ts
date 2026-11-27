const dark = {
  bg: '#0E1116',
  card: '#171B22',
  cardAlt: '#1F2530',
  border: '#262D3A',
  borderStrong: '#3A4252',
  text: '#EEF1F5',
  /** 结论下面那一两句：比正文暗一级，比次要色亮。 */
  textSoft: '#C4C9D2',
  sub: '#8A93A3',
  accent: '#FF6B2C',
  /** Agent 的颜色：和应用图标的色带同一个橙。只在它开口的地方用（标记、问一句、把握亮格）。 */
  agent: '#FF6B2C',
  /** 深底上 Agent 的小字。纯橙在 13px 字上对比不够，提亮一点。 */
  agentText: '#FF8A57',
  /** 运动页判断铺底的颜色。白字压得住（对比 ≥ 4.5）。 */
  kindField: { rest: '#A3303C', recovery: '#7A5A10', aerobic: '#1D4FB8', intensity: '#11704B', unknown: '#1F2530' },
  good: '#3DDC97',
  fair: '#F5C24C',
  poor: '#FF5C6C',
  blue: '#5AA9FF',
  purple: '#A77BFF',
  sleep: { deep: '#4B5BFF', light: '#7FA6FF', rem: '#B58CFF', awake: '#FF9F43' },
  /** 压力表盘四段：0–25、26–50、51–75、76–100。冷到暖，不用红（红只给运动页的停训线）。 */
  stress: ['#3D6BFF', '#5AA9FF', '#FFB547', '#FF8A3D'],
  /** 悬浮控件的仿玻璃：半透明底 + 一圈细亮边（安卓没有系统液态玻璃）。只给底栏、问一句这类悬浮的东西，卡片和图表用实底。 */
  glass: 'rgba(28,33,42,0.84)',
  /** 底栏分块拼的玻璃：块用实色，整组再统一降透明度，拼缝处不会叠出深线。 */
  glassSolid: '#1C212A',
  glassAlpha: 0.84,
  glassBorder: 'rgba(255,255,255,0.12)',
  zones: ['#7E8A9C', '#5AA9FF', '#3DDC97', '#F5C24C', '#FF5C6C'],
};

/** 浅色（2026-11-27）。判断色、仪表色都换成在白底上压得住的深一档；运动页判断色块不变（白字）。 */
const light: typeof dark = {
  bg: '#F4F5F7',
  card: '#FFFFFF',
  cardAlt: '#EEF0F4',
  border: '#DDE1E7',
  borderStrong: '#C4CAD3',
  text: '#14171C',
  textSoft: '#3D4450',
  sub: '#5F6775',
  accent: '#EA580C',
  agent: '#EA580C',
  agentText: '#C2410C',
  kindField: { rest: '#A3303C', recovery: '#7A5A10', aerobic: '#1D4FB8', intensity: '#11704B', unknown: '#5F6775' },
  good: '#0F8A5F',
  fair: '#A16207',
  poor: '#D7263D',
  blue: '#2563EB',
  purple: '#7C3AED',
  sleep: { deep: '#3B4FE0', light: '#6C8EF0', rem: '#9B6BF0', awake: '#F08A2E' },
  stress: ['#3D6BFF', '#5AA9FF', '#F5A524', '#F07A2E'],
  glass: 'rgba(255,255,255,0.86)',
  glassSolid: '#FFFFFF',
  glassAlpha: 0.86,
  glassBorder: 'rgba(15,23,42,0.10)',
  zones: ['#8A94A6', '#3B82F6', '#10B981', '#D4A017', '#E5484D'],
};

export type Scheme = 'dark' | 'light';
export type Palette = typeof dark;

/**
 * 当前用的颜色。各处直接读 `colors.x`；换主题时 `applyScheme` 原地改它，
 * 外层用 key 把导航树重挂一次，所有页面就读到新值（ThemeProvider）。
 */
export const colors: Palette = { ...dark, kindField: { ...dark.kindField }, sleep: { ...dark.sleep }, stress: [...dark.stress], zones: [...dark.zones] };

/** 当前主题；`themed()` 按它缓存，换了才重建。 */
let current: Scheme = 'dark';

export function applyScheme(scheme: Scheme) {
  if (scheme === current) return;
  current = scheme;
  const p = scheme === 'light' ? light : dark;
  Object.assign(colors, p, { kindField: { ...p.kindField }, sleep: { ...p.sleep }, stress: [...p.stress], zones: [...p.zones] });
}

/** 模块顶层的 StyleSheet 会在启动时把颜色定死；包一层，按当前主题建一次、缓存，换主题才重建（0.1.45）。 */
export function themed<T extends object>(make: () => T): T {
  let built: T | undefined;
  let builtFor: Scheme | undefined;
  return new Proxy({} as T, {
    get: (_target, key) => {
      if (!built || builtFor !== current) { built = make(); builtFor = current; }
      return (built as Record<string | symbol, unknown>)[key];
    },
  });
}


export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
export const radius = 8;
export const touch = 48;
export const font = {
  micro: 10,
  caption: 11,
  footnote: 12,
  subhead: 13,
  body: 14,
  callout: 15,
  headline: 16,
  title: 17,
  lead: 20,
  metric: 22,
  display: 28,
  figure: 34,
};
