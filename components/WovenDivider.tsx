// Woven ribbon divider — SVG pattern using 6 accent colors
import React from 'react';
import Svg, { Rect, G } from 'react-native-svg';
import { colors } from '@/constants/theme';

export function WovenDivider({ width = 300, height = 14 }: { width?: number; height?: number }) {
  const palette = [colors.brick, colors.sapphire, colors.yolk, colors.rose, colors.olive, colors.brown];
  const stripeW = 12;
  const count = Math.ceil(width / stripeW);
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} testID="woven-divider">
      <G>
        {Array.from({ length: count }).map((_, i) => (
          <Rect key={i} x={i * stripeW} y={0} width={stripeW} height={height} fill={palette[i % palette.length]} />
        ))}
      </G>
      {/* Cross stripes for weft */}
      <G opacity={0.35}>
        {Array.from({ length: 3 }).map((_, i) => (
          <Rect key={i} x={0} y={i * (height / 3)} width={width} height={height / 6} fill={colors.inkPrimary} />
        ))}
      </G>
    </Svg>
  );
}
