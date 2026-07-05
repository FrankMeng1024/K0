// Woven ribbon divider — SVG pattern using 6 accent colors.
// STORY-00100 精修: 不规则宽度 (8-16px random) + tearing filter for torn paper edges.
import React from 'react';
import Svg, { Rect, G } from 'react-native-svg';
import { colors } from '@/constants/theme';
import { TearingDefs } from './illustrations/TearingDefs';

// Deterministic pseudo-random so layout is stable across re-renders
function pseudoRand(seed: number, i: number): number {
  return ((Math.sin(seed * 100 + i * 7.3) * 43758.5453) % 1 + 1) % 1;
}

export function WovenDivider({ width = 300, height = 14 }: { width?: number; height?: number }) {
  const palette = [colors.brick, colors.sapphire, colors.yolk, colors.rose, colors.olive, colors.brown];
  const stripes: { x: number; w: number; color: string; yOffset: number }[] = [];
  let x = 0;
  let i = 0;
  while (x < width) {
    const w = 8 + pseudoRand(1, i) * 8; // 8-16px random width
    const yOffset = (pseudoRand(2, i) - 0.5) * 2; // ±1px vertical wobble
    stripes.push({ x, w, color: palette[i % palette.length], yOffset });
    x += w;
    i++;
  }
  return (
    <Svg width={width} height={height + 4} viewBox={`0 0 ${width} ${height + 4}`} testID="woven-divider">
      <TearingDefs />
      <G filter="url(#tearing-strong)">
        {stripes.map((s, idx) => (
          <Rect
            key={idx}
            x={s.x}
            y={2 + s.yOffset}
            width={s.w}
            height={height}
            fill={s.color}
          />
        ))}
      </G>
      {/* Cross weft — subtle darker overlay */}
      <G opacity={0.22} filter="url(#tearing-mid)">
        <Rect x={0} y={2 + height * 0.35} width={width} height={height * 0.15} fill={colors.inkPrimary} />
        <Rect x={0} y={2 + height * 0.65} width={width} height={height * 0.12} fill={colors.inkPrimary} />
      </G>
    </Svg>
  );
}
