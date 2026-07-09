// K0 卡片类型 — 颜色 + 中文标签
// 单一来源 (原 episode/review/library/K0Card 各复制一份, Phase A 收敛)
import { colors } from './theme';

export const CARD_TYPE_COLORS: Record<string, string> = {
  opinion: colors.brick,
  method: colors.sapphire,
  case: colors.brown,
  reflection: colors.rose,
  action: colors.olive,
};

export const CARD_TYPE_LABELS: Record<string, string> = {
  opinion: '观点',
  method: '方法',
  case: '案例',
  reflection: '洞察',
  action: '行动',
};
