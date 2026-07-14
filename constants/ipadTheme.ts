// K0 iPad 横屏设计规范 (token) — 所有 iPad(isWide)页面统一引用, 保证风格一致。
// Frank 要求: 左右留白适度(不空太多)、分割线放大、上下间距统一、组件尺寸统一、每页同一风格。
// 手机竖屏完全不引用本文件 → iPad/iPhone 彻底分离。
import { spacing } from './theme';

export const ipad = {
  // ── 页面外框 ──
  // 内容最大宽度: iPad Pro 11" 横屏 1194 宽, 内容限到 980 居中 → 左右各留约 107 呼吸(适度, 不空太多)。
  maxContentWidth: 980,
  // 页面左右安全边距(内容区内部)
  gutter: spacing.xxl,          // 32
  // 页面上下边距
  padTop: spacing.xl,           // 24 (再叠加 safe-area inset.top)
  padBottom: spacing.xxxl,      // 40

  // ── 顶栏 (ScreenHeader Pad 版) ──
  header: {
    titleSize: 34,              // iPad 标题比手机(28)大
    subtitleSize: 15,
    backSize: 16,               // 返回按钮字号
    dividerHeight: 16,          // 分割线更粗(手机 12)
    gap: spacing.sm,            // 标题/副标题/分割线间距
  },

  // ── 分割线 ──
  // iPad 分割线宽度 = 内容宽度(不再是手机的 max 380 硬上限)→ 铺满内容区, 不再"太小"。
  dividerWidth: 980 - spacing.xxl * 2,   // = maxContentWidth - 左右 gutter

  // ── 双栏/左栏骨架 (episode/library 共用) ──
  rail: {
    width: 268,                 // 左栏统一宽度
    padV: spacing.xl,
    padH: spacing.lg,
    gap: spacing.sm,
    kickerSize: 11,             // 分组小标题
    itemSize: 15,               // 导航/tab 项字号
  },

  // ── 卡片网格 (library 等) ──
  grid: {
    gap: spacing.lg,            // 网格间距统一
    // 列数由容器宽度算(见页面), cell 用统一 minWidth
    cellMinWidth: 260,
  },

  // ── 入口卡 (首页) ──
  card: {
    radius: 16,
    padV: spacing.xl,
    padH: spacing.xl,
    titleSize: 30,
    subSize: 14,
    illBox: 84,                 // 插画盒统一尺寸
  },
} as const;
