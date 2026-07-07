// Torn-paper sun — day face illustration for K0Card (D4 fusion).
// 3-layer torn stack: shadow + main body + highlight, matching HeadphoneListener画法.
import React from 'react';
import Svg, { Circle, G, Line } from 'react-native-svg';
import { colors } from '@/constants/theme';
import { TearingDefs } from './TearingDefs';

export function TornSun({ size = 64 }: { size?: number }) {
  const cx = 50;
  const cy = 50;
  const rays = Array.from({ length: 8 }, (_, i) => (i * Math.PI * 2) / 8);
  const rInner = 18;
  const rOuter = 38;

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" testID="ill-torn-sun">
      <TearingDefs />

      {/* Layer 1: deep shadow — olive rays offset */}
      <G filter="url(#tearing-strong)" opacity={0.32}>
        {rays.map((a, i) => (
          <Line
            key={`s-${i}`}
            x1={cx + Math.cos(a) * (rInner + 2)}
            y1={cy + Math.sin(a) * (rInner + 2) + 2}
            x2={cx + Math.cos(a) * (rOuter + 2)}
            y2={cy + Math.sin(a) * (rOuter + 2) + 2}
            stroke={colors.brown}
            strokeWidth={5}
            strokeLinecap="round"
          />
        ))}
        <Circle cx={cx + 1} cy={cy + 2} r={rInner} fill={colors.brown} />
      </G>

      {/* Layer 2: main body — olive rays + yolk core */}
      <G filter="url(#tearing-strong)">
        {rays.map((a, i) => (
          <Line
            key={`m-${i}`}
            x1={cx + Math.cos(a) * rInner}
            y1={cy + Math.sin(a) * rInner}
            x2={cx + Math.cos(a) * rOuter}
            y2={cy + Math.sin(a) * rOuter}
            stroke={colors.olive}
            strokeWidth={4}
            strokeLinecap="round"
          />
        ))}
        <Circle cx={cx} cy={cy} r={rInner} fill={colors.yolk} />
      </G>

      {/* Layer 3: highlight — small warm glow */}
      <G filter="url(#tearing-soft)" opacity={0.7}>
        <Circle cx={cx - 4} cy={cy - 5} r={7} fill={colors.paperCream} />
      </G>

      {/* Tiny brick center dot */}
      <Circle cx={cx} cy={cy} r={3} fill={colors.brick} opacity={0.6} />
    </Svg>
  );
}
