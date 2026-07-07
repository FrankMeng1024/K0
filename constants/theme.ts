// K0 design tokens — Style F Cutout Illustrated (per UI_SPEC.md §chosen-style)
export const colors = {
  // 主色板
  brick: '#C80306',
  // Sprint 14 R1 #14: sapphire 蓝 Frank 反馈难看，全站换成 olive 军绿（保留 key 避免引用报错；olive 与 brick/yolk/brown 反差好）
  sapphire: '#6B6A4E',
  yolk: '#F8D34A',
  brown: '#652300',
  rose: '#C14F94',
  olive: '#6B6A4E',
  // 纸质基底
  paperMain: '#E8D9B8',
  paperDark: '#DDCEA9',
  paperCream: '#F5EBD3',
  // Ink
  inkPrimary: '#1A1613',
  inkSecondary: '#4A3F35',
  // Utility
  white: '#FFFFFF',
  offWhite: '#FDFBF6',
  shadow: 'rgba(26, 22, 19, 0.08)',
} as const;

export const fonts = {
  hero: 'BagelFatOne_400Regular',
  playful: 'RubikBubbles_400Regular',
  ui: 'Sniglet_400Regular',
  body: 'Fraunces_400Regular',
  bodyItalic: 'Fraunces_400Regular_Italic',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 40,
} as const;

export const radii = {
  card: 12,
  bubble: 100,
} as const;

// Tearing filter presets (react-native-svg feTurbulence).
// STORY-00100 精修: scale 大幅提高让撕纸边缘肉眼可辨；baseFrequency 更低让噪声粒度更粗（更像真实撕纸而非砂纸）。
export const tearing = {
  strong: { baseFrequency: 0.028, numOctaves: 3, seed: 4, scale: 18 },
  mid: { baseFrequency: 0.038, numOctaves: 2, seed: 7, scale: 11 },
  soft: { baseFrequency: 0.055, numOctaves: 2, seed: 2, scale: 6 },
} as const;

// Sprint 13 v20 tokens (强制约束，禁止硬编码 fontSize/color hex)
// PM/Arch/SM 复盘: fontSize/border/shadow 收敛为一套 token，非色板 hex 全部替换

export const typography = {
  // Hero 标题（内页统一，首页大 hero 用 heroXL）
  hero: 44,
  heroXL: 52, // 首页 Listen. Learn.
  heroCard: 30, // 首页 3 卡标题
  h1: 24,
  h2: 22,
  h3: 18,
  body: 14,
  bodyLarge: 15,
  bodySmall: 13,
  ui: 12,
  uiSmall: 11,
  uiTiny: 10,
} as const;

export const lineHeight = {
  hero: 46,
  heroCard: 34,
  h1: 30,
  h2: 26,
  body: 22,
  bodySmall: 20,
  ui: 18,
} as const;

// letterSpacing 收敛
export const letterSpacing = {
  hero: -1,
  h1: -0.5,
  h2: -0.3,
  body: 0,
  ui: 0.3,
  uiUpper: 0.6,
} as const;

// borderWidth 收敛 —— 首页零 border，内页普遍 1px（UI_SPEC 明文 <=2px）
export const borderWidth = {
  none: 0,
  thin: 1, // 只在必要处（chip / input）
  medium: 2, // 极少数场景（focused input）
} as const;

// Shadow 收敛 —— UI_SPEC §chosen-style 禁用有偏移量 shadow
export const shadow = {
  // 完全无 shadow（首页 entryCard 用）
  none: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  // 极柔和阴影（内页卡片可用，无偏移量）
  soft: {
    shadowColor: colors.inkPrimary,
    shadowOffset: { width: 0, height: 0 }, // 无偏移量
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
} as const;

