export const colors = {
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
  zones: ['#7E8A9C', '#5AA9FF', '#3DDC97', '#F5C24C', '#FF5C6C'],
};

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
