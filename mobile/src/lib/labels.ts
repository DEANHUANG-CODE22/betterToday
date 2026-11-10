import type { SportType } from './types';

/** 手表有时只给一个英文类型名。整段就是这个词时，用中文类型，避免一行里中英各说一遍。 */
const GENERIC_EN: Record<string, string> = {
  run: '跑步',
  running: '跑步',
  'trail run': '越野',
  'trail running': '越野',
  trail: '越野',
  ride: '骑行',
  bike: '骑行',
  cycling: '骑行',
  swim: '游泳',
  swimming: '游泳',
  strength: '力量',
  'strength training': '力量',
  walk: '步行',
  walking: '步行',
  hike: '徒步',
  hiking: '徒步',
};

export function activityTitle(name: string): string {
  return GENERIC_EN[name.trim().toLowerCase()] ?? name;
}

/** 名字已经是类型本身时，日期旁不再把类型写第二遍。 */
export function sportSuffix(name: string, sport: SportType): string {
  const kind = SPORT_LABEL[sport];
  return activityTitle(name) === kind ? '' : ` · ${kind}`;
}

export const SPORT_LABEL: Record<SportType, string> = {
  run: '跑步',
  trail: '越野',
  bike: '骑行',
  swim: '游泳',
  strength: '力量',
  walk: '步行',
  other: '其他',
};
