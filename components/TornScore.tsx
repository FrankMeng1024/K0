// TornScore — 撕纸风评分点条 (Sprint 4 STORY-00103).
// 替换 App Store 风格的 ●●●●○○○○ 血条，改为手撕彩色不规则小圆。
import React from 'react';
import Svg, { Circle, G } from 'react-native-svg';
import { colors } from '@/constants/theme';
import { TearingDefs } from './illustrations/TearingDefs';

// Deterministic pseudo-random so re-renders are stable
function jitter(seed: number, i: number): number {
  return ((Math.sin(seed * 37 + i * 11.7) * 43758.5453) % 1 + 1) % 1;
}

const COLORS_FILLED = [colors.brick, colors.yolk, colors.rose, colors.brick, colors.sapphire];

export function TornScore({ value, max = 10, seed = 1 }: { value: number; max?: number; seed?: number }) {
  const dotSize = 11;
  const gap = 5;
  const width = max * (dotSize + gap);
  return (
    <Svg width={width} height={dotSize + 6} viewBox={`0 0 ${width} ${dotSize + 6}`}>
      <TearingDefs />
      <G filter="url(#tearing-strong)">
        {Array.from({ length: max }).map((_, i) => {
          const filled = i < value;
          const cx = i * (dotSize + gap) + dotSize / 2 + (jitter(seed, i) - 0.5) * 2;
          const cy = dotSize / 2 + 3 + (jitter(seed + 1, i) - 0.5) * 2;
          const r = dotSize / 2 + (jitter(seed + 2, i) - 0.5) * 0.8;
          return (
            <Circle
              key={i}
              cx={cx}
              cy={cy}
              r={r}
              fill={filled ? COLORS_FILLED[i % COLORS_FILLED.length] : colors.paperDark}
              opacity={filled ? 1 : 0.55}
            />
          );
        })}
      </G>
    </Svg>
  );
}
