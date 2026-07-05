// K0 design tokens — Style F Cutout Illustrated (per UI_SPEC.md §chosen-style)
export const colors = {
  // 主色板
  brick: '#C80306',
  sapphire: '#284EA9',
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
