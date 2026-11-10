import { Text, View } from 'react-native';
import type { Settlement } from '@/lib/settle';
import { colors, font, space } from './theme';
import { Card, Chip, Muted } from './ui';

/**
 * 训练后结算卡（PRD §4.2）。和决策卡占同一个位置，按「今天有没有记录 / 有没有点按钮」切换。
 *
 * 它只做三件事：一句判断、一句事实对照、一句下一步。
 * 不做的事：不评分、不追问「为什么没按计划」——那会把教练变成裁判。
 * 标题用正文色。强调色只留给当前页和选中的按钮。
 */
export function SettleCard({ settlement, onUndo }: { settlement: Settlement; onUndo?: () => void }) {
  return (
    <Card>
      <Text style={{ color: colors.sub, fontSize: font.footnote }}>训练后结算</Text>
      <Text style={{ color: colors.text, fontSize: font.metric, fontWeight: '800', lineHeight: 30 }}>{settlement.headline}</Text>
      <Muted>{settlement.detail}</Muted>
      <Text style={{ color: colors.text, fontSize: font.body, lineHeight: 21 }}>{settlement.next}</Text>
      {onUndo && (
        <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
          <Chip label="重记一次" onPress={onUndo} />
        </View>
      )}
    </Card>
  );
}
