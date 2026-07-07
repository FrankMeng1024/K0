// Torn-paper tiny star — night sky accent for K0Card back face.
// Small 4-point star + torn filter. Non-emoji, pure SVG.
import React from 'react';
import Svg, { G, Path, Circle } from 'react-native-svg';
import { colors } from '@/constants/theme';
import { TearingDefs } from './TearingDefs';

type Props = {
  size?: number;
  color?: string;
};

export function TornStar({ size = 12, color = colors.yolk }: Props) {
  // 4-point star path — narrow arms
  const star = 'M 10 2 L 12 8 L 18 10 L 12 12 L 10 18 L 8 12 L 2 10 L 8 8 Z';
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" testID="ill-torn-star">
      <TearingDefs />
      <G filter="url(#tearing-soft)">
        <Path d={star} fill={color} />
      </G>
      <Circle cx={10} cy={10} r={1.2} fill={colors.paperCream} opacity={0.9} />
    </Svg>
  );
}
