// Torn-paper moon — night face illustration for K0Card (D4 fusion).
// 3-layer stack: rose halo + brown crescent + paperCream highlight, torn filter.
import React from 'react';
import Svg, { Circle, G, Path } from 'react-native-svg';
import { colors } from '@/constants/theme';
import { TearingDefs } from './TearingDefs';

export function TornMoon({ size = 64 }: { size?: number }) {
  // Crescent = outer circle minus offset inner circle (Path with even-odd)
  // Use a filled crescent path directly for simplicity.
  const crescent =
    'M 55 22 A 28 28 0 1 0 55 78 A 22 22 0 1 1 55 22 Z';

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" testID="ill-torn-moon">
      <TearingDefs />

      {/* Layer 1: rose halo — soft glow */}
      <G filter="url(#tearing-mid)" opacity={0.45}>
        <Circle cx={52} cy={50} r={36} fill={colors.rose} />
      </G>

      {/* Layer 2: mid shadow behind crescent */}
      <G filter="url(#tearing-strong)" opacity={0.4}>
        <Path d={crescent} fill={colors.inkPrimary} transform="translate(3,3)" />
      </G>

      {/* Layer 3: main crescent — brown */}
      <G filter="url(#tearing-strong)">
        <Path d={crescent} fill={colors.brown} />
      </G>

      {/* Layer 4: highlight on top-right edge */}
      <G filter="url(#tearing-soft)" opacity={0.6}>
        <Circle cx={62} cy={35} r={5} fill={colors.paperCream} />
      </G>

      {/* Tiny yolk crater accents */}
      <Circle cx={45} cy={45} r={2.2} fill={colors.yolk} opacity={0.7} />
      <Circle cx={40} cy={62} r={1.6} fill={colors.yolk} opacity={0.55} />
    </Svg>
  );
}
