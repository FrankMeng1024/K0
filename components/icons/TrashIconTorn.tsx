// K0 TrashIconTorn — Sprint 14 R1 #11
// 撕纸手工风垃圾桶图标（替代 × unicode）
import React from 'react';
import Svg, { Path, Rect } from 'react-native-svg';
import { colors } from '@/constants/theme';

export function TrashIconTorn({ size = 18, color = colors.inkSecondary }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* 撕纸风垃圾桶：非几何完美,轻微手绘感 */}
      {/* 盖子 */}
      <Path
        d="M4 6 L20 6"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
      />
      {/* 提手 */}
      <Path
        d="M9 6 L9 4 Q9 3 10 3 L14 3 Q15 3 15 4 L15 6"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
        fill="none"
      />
      {/* 桶身（手绘感梯形） */}
      <Path
        d="M5.5 6 L6.5 20 Q6.5 21 7.5 21 L16.5 21 Q17.5 21 17.5 20 L18.5 6"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* 桶身竖纹 */}
      <Path d="M10 10 L10 17" stroke={color} strokeWidth={1.4} strokeLinecap="round" />
      <Path d="M14 10 L14 17" stroke={color} strokeWidth={1.4} strokeLinecap="round" />
    </Svg>
  );
}
