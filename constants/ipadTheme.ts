// K0 iPad 横屏设计规范 — 响应式(按实际屏宽算, 不 hardcode 任何设备尺寸)。
// 所有 iPad(isWide)页面统一引用, 保证风格一致。手机竖屏完全不引用 → iPad/iPhone 彻底分离。
// Frank: "都应该适配啊, 怎么可能 hardcode" → 用 ipadLayout(width) 按真实屏宽动态算。
import { spacing } from './theme';

// 按实际屏宽算的布局量(gutter/内容宽/分割线宽), 任何 iPad 宽度都自适应, 不贴边、分割线满、不过大。
export function ipadLayout(screenW: number) {
  // 左右 gutter = 屏宽的 ~6%, 夹在 [28, 96] → 窄屏不挤、宽屏不空太多。
  const gutter = Math.round(Math.min(96, Math.max(28, screenW * 0.06)));
  // 内容宽 = 屏宽 - 两侧 gutter, 但设一个舒适上限(1040), 超大屏(12.9")不至于内容拉太宽。
  const contentWidth = Math.min(1040, screenW - gutter * 2);
  return {
    gutter,
    contentWidth,
    dividerWidth: contentWidth,   // 分割线 = 内容宽 → 永远铺满、不再"过短"。
  };
}

// 固定尺寸 token(不随屏宽剧烈变化的: 字号/圆角/间距/rail 宽)。
export const ipad = {
  padTop: spacing.xl,           // 24 (叠加 safe-area inset.top)
  padBottom: spacing.xxxl,      // 40

  header: {
    titleSize: 32,
    subtitleSize: 15,
    backSize: 16,
    dividerHeight: 14,
    gap: spacing.sm,
  },

  rail: {
    width: 268,                 // 左栏统一宽度(双栏页 episode/library)
    padV: spacing.xl,
    padH: spacing.lg,
    gap: spacing.sm,
    kickerSize: 11,
    itemSize: 15,
  },

  grid: {
    gap: spacing.lg,
    cellMinWidth: 260,
  },

  card: {
    radius: 16,
    padV: spacing.xl,
    padH: spacing.xl,
    titleSize: 28,
    subSize: 14,
    illBox: 76,
  },
} as const;
