// K0 响应式断点 hook — iPad 适配
// 手机竖屏(小屏) → isWide=false, 走原有竖屏布局。
// iPad/大屏横屏(宽≥900 且 宽>高) → isWide=true, 走横屏专属布局。
// Frank 定调: 小屏竖屏一套、大屏横屏一套, 靠断点自适应(不是固定 iPad 尺寸)。
import { useWindowDimensions } from 'react-native';

export interface Responsive {
  width: number;
  height: number;
  isWide: boolean;      // iPad 横屏/大屏: 宽≥900 且横向
  isLandscape: boolean;
}

// 900: iPad mini 竖屏宽 744 不触发, iPad Pro 11" 横屏 1194 触发。
// 且要求 宽>高(真横屏), 避免大屏竖屏(如 iPad 竖屏 834 宽)误判。
const WIDE_MIN = 900;
// R55(Risk review C2): 叠加"短边≥600"兜底 —— iPhone 最大短边约 430(15 Pro Max 横屏 932×430),
//   纯靠 width≥900 会被 15 Pro Max 横屏(932)误判成 iPad。要求短边≥600 → 只有真平板满足,
//   任何 iPhone 即使万一进横屏也永不触发 iPad 布局。双保险(iPhone 另有 iOS plist 锁竖屏)。
const TABLET_MIN_SHORT_SIDE = 600;

export function useResponsive(): Responsive {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const shortSide = Math.min(width, height);
  const isWide = width >= WIDE_MIN && isLandscape && shortSide >= TABLET_MIN_SHORT_SIDE;
  return { width, height, isWide, isLandscape };
}
