// Abstract headphone-listener silhouette — 更细致抽象几何化 (per user CP1 note).
// Not a photorealistic person; a symbolic mark: circle head + rectangle headband + oval cans.
import React from 'react';
import Svg, { Circle, Rect, Path, G, Ellipse } from 'react-native-svg';
import { colors } from '@/constants/theme';
import { TearingDefs } from './TearingDefs';

export function HeadphoneListener({ size = 200 }: { size?: number }) {
  return (
    <Svg width={size} height={size * 1.05} viewBox="0 0 200 210" testID="ill-headphone">
      <TearingDefs />
      {/* Abstract face silhouette (side view) */}
      <G filter="url(#tearing-mid)">
        {/* Ear (background layer, olive) */}
        <Ellipse cx="140" cy="115" rx="26" ry="30" fill={colors.olive} />
        {/* Head shape — abstract oval, brown */}
        <Path
          d="M 60 105 Q 60 45 115 40 Q 165 40 165 100 Q 165 155 130 165 Q 100 175 80 165 Q 60 155 60 105 Z"
          fill={colors.brown}
        />
        {/* Neck */}
        <Rect x="90" y="160" width="45" height="35" fill={colors.brown} />
      </G>
      {/* Headband strap — sapphire */}
      <G filter="url(#tearing-strong)">
        <Path
          d="M 78 45 Q 115 5 155 45 L 152 55 Q 118 20 82 55 Z"
          fill={colors.sapphire}
        />
      </G>
      {/* Right ear-cup (visible) — brick red */}
      <G filter="url(#tearing-strong)">
        <Ellipse cx="150" cy="110" rx="22" ry="26" fill={colors.brick} />
      </G>
      {/* Eye — small ink dot */}
      <Circle cx="95" cy="105" r="3.5" fill={colors.inkPrimary} />
      {/* Mouth — subtle line hint (calm expression) */}
      <Path
        d="M 88 130 Q 96 133 104 130"
        stroke={colors.inkSecondary}
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />
      {/* Small sound wave hint from ear-cup — yolk */}
      <G filter="url(#tearing-soft)">
        <Path
          d="M 178 100 Q 188 110 178 122"
          stroke={colors.yolk}
          strokeWidth="4"
          fill="none"
          strokeLinecap="round"
        />
      </G>
    </Svg>
  );
}
