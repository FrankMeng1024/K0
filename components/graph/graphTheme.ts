// #R36 脑图视觉主题 — 单篇/多篇共享。去红黄纯色球, 改低饱和暖色纸质风 + 大小编码。
import { colors } from '@/constants/theme';

export type GraphNodeKind = 'center' | 'core' | 'concept' | 'card';

// 节点半径 (大小编码: center 最大 → card 最小)
// A3: 球整体缩小以适应整体、给标签让空间(Frank: 球可以小一点)
export const NODE_R: Record<string, number> = {
  center: 20,
  core: 15,
  concept: 11,
  card: 9,
};

export function rOf(kind: string): number {
  return NODE_R[kind] ?? 13;
}

// 低饱和暖色填充 (不再纯 brick/yolk 当大面积球)
export const NODE_FILL: Record<string, string> = {
  center: colors.rose,        // #C14F94 玫瑰 (中心)
  core: colors.olive,         // #6B6A4E 橄榄 (一级主题)
  concept: colors.paperCream, // 米白 + olive 描边
  card: colors.paperMain,     // 暖纸 + brown 描边
};

// 描边 (concept 用 olive, 其余 brown; center 略粗)
export const NODE_STROKE: Record<string, string> = {
  center: colors.brown,
  core: colors.brown,
  concept: colors.olive,
  card: colors.brown,
};

export function strokeWidthOf(kind: string, selected: boolean): number {
  if (selected) return 2.4;
  return kind === 'center' ? 2 : 1.3;
}

// 边样式: skeleton/belong 直线 brown 实线; semantic 贝塞尔 brick 虚线
export const EDGE_STYLE = {
  skeleton: { stroke: colors.brown, width: 2, dash: undefined as string | undefined, curve: false },
  belong: { stroke: colors.brown, width: 1.2, dash: undefined as string | undefined, curve: false },
  semantic: { stroke: colors.brick, width: 1.5, dash: '5,4', curve: true },
};

// 高亮/淡化 opacity
export const OPACITY = {
  dimNode: 0.12,
  dimEdge: 0.06,
  activeEdge: 0.95,
  normalNodeMin: 0.85,
};

// 标签渐进披露阈值: 缩放 > 此值才显 concept/card 标签
export const LABEL_SCALE_THRESHOLD = 1.4;
