// K0 PlayIconTorn — Sprint 16 R8
// 撕纸手工风播放三角形（跟 TrashIconTorn 同风格），替代 unicode ▶
import React from 'react';
import Svg, { Path } from 'react-native-svg';
import { colors } from '@/constants/theme';

export function PlayIconTorn({ size = 14, color = colors.inkPrimary }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* 撕纸风三角形：非几何完美，轻微手绘感（左边稍抖动） */}
      <Path
        d="M6 4.5 L6.4 19.5 L19 12.2 Z"
        stroke={color}
        strokeWidth={1.6}
        strokeLinejoin="round"
        fill={color}
        fillOpacity={0.85}
      />
    </Svg>
  );
}
