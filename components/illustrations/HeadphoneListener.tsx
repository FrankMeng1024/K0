// Abstract headphone-listener silhouette — 更细致抽象几何化 (per user CP1 note).
// STORY-00100 精修：加入 3 层结构（背景阴影副本 + 主体 + 高光），撕纸感更明显。
import React from 'react';
import Svg, { Circle, Rect, Path, G, Ellipse } from 'react-native-svg';
import { colors } from '@/constants/theme';
import { TearingDefs } from './TearingDefs';

export function HeadphoneListener({ size = 200 }: { size?: number }) {
  return (
    <Svg width={size} height={size * 1.05} viewBox="0 0 200 210" testID="ill-headphone">
      <TearingDefs />

      {/* ── Layer 1: Deep shadow copy — offset 6px down/right, dark brown, torn edge ── */}
      <G filter="url(#tearing-strong)" opacity={0.35}>
        <Path
          d="M 66 111 Q 66 51 121 46 Q 171 46 171 106 Q 171 161 136 171 Q 106 181 86 171 Q 66 161 66 111 Z"
          fill={colors.inkPrimary}
        />
      </G>

      {/* ── Layer 2: Mid shadow copy — offset 3px, lighter, adds paper thickness ── */}
      <G filter="url(#tearing-mid)" opacity={0.5}>
        <Path
          d="M 63 108 Q 63 48 118 43 Q 168 43 168 103 Q 168 158 133 168 Q 103 178 83 168 Q 63 158 63 108 Z"
          fill={colors.brown}
        />
      </G>

      {/* ── Layer 3: Main face — brown, torn ── */}
      <G filter="url(#tearing-strong)">
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

      {/* ── Layer 4: Highlight on cheek — soft rose accent, torn ── */}
      <G filter="url(#tearing-soft)" opacity={0.55}>
        <Ellipse cx="95" cy="120" rx="15" ry="10" fill={colors.rose} />
      </G>

      {/* Headband strap — sapphire */}
      <G filter="url(#tearing-strong)">
        <Path
          d="M 78 45 Q 115 5 155 45 L 152 55 Q 118 20 82 55 Z"
          fill={colors.sapphire}
        />
      </G>

      {/* Right ear-cup (visible) — brick red, layered */}
      <G filter="url(#tearing-mid)" opacity={0.35}>
        <Ellipse cx="153" cy="113" rx="24" ry="28" fill={colors.inkPrimary} />
      </G>
      <G filter="url(#tearing-strong)">
        <Ellipse cx="150" cy="110" rx="22" ry="26" fill={colors.brick} />
      </G>
      {/* Ear-cup center dot — sapphire */}
      <Circle cx="150" cy="110" r="5" fill={colors.sapphire} />

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
        <Path
          d="M 184 95 Q 196 110 184 128"
          stroke={colors.yolk}
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
          opacity={0.6}
        />
      </G>
    </Svg>
  );
}
