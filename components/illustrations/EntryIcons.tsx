// Illustrations for the 3 entry cards (Learn / Review / Library).
// STORY-00100 精修：三个图标统一到"底层阴影 + 主色块 + 高光/装饰"三层结构，
// 全部用 tearing-strong 或 tearing-mid，视觉一致。
import React from 'react';
import Svg, { Circle, Rect, Path, G, Ellipse, Polygon } from 'react-native-svg';
import { colors } from '@/constants/theme';
import { TearingDefs } from './TearingDefs';

// Learn — a book being opened with light rays (start of a lesson)
export function LearnIll({ size = 80 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 80 80" testID="ill-learn">
      <TearingDefs />
      {/* Layer 1: Shadow — deep brown offset */}
      <G filter="url(#tearing-strong)" opacity={0.35}>
        <Rect x="14" y="32" width="46" height="32" fill={colors.inkPrimary} rx="2" />
      </G>
      {/* Layer 2: Book main body — brown */}
      <G filter="url(#tearing-strong)">
        <Rect x="12" y="28" width="46" height="32" fill={colors.brown} rx="2" />
        {/* Book spine center line */}
        <Rect x="34" y="28" width="2" height="32" fill={colors.inkPrimary} />
      </G>
      {/* Layer 3: Book pages — cream, showing inside */}
      <G filter="url(#tearing-mid)">
        <Rect x="14" y="30" width="19" height="28" fill={colors.paperCream} />
        <Rect x="37" y="30" width="19" height="28" fill={colors.paperCream} />
      </G>
      {/* Text lines (subtle ink strokes) */}
      <Rect x="17" y="34" width="12" height="1.5" fill={colors.inkSecondary} opacity={0.6} />
      <Rect x="17" y="38" width="10" height="1.5" fill={colors.inkSecondary} opacity={0.6} />
      <Rect x="17" y="42" width="12" height="1.5" fill={colors.inkSecondary} opacity={0.6} />
      <Rect x="41" y="34" width="12" height="1.5" fill={colors.inkSecondary} opacity={0.6} />
      <Rect x="41" y="38" width="10" height="1.5" fill={colors.inkSecondary} opacity={0.6} />
      <Rect x="41" y="42" width="12" height="1.5" fill={colors.inkSecondary} opacity={0.6} />

      {/* Light rays from top — brick red spots (learning sparkles) */}
      <G filter="url(#tearing-soft)">
        <Circle cx="65" cy="16" r="3.5" fill={colors.brick} />
        <Circle cx="72" cy="10" r="2.2" fill={colors.yolk} />
        <Circle cx="60" cy="9" r="1.8" fill={colors.brick} />
      </G>
    </Svg>
  );
}

// Review — abstract brain / thought loops (revisiting)
export function ReviewIll({ size = 80 }: { size?: number }) {
  // Sprint 13 #2: 换成沙漏 + 卡片组合 —— SRS = 时间 + 卡片回顾
  return (
    <Svg width={size} height={size} viewBox="0 0 80 80" testID="ill-review">
      <TearingDefs />
      {/* Layer 1: Shadow */}
      <G filter="url(#tearing-strong)" opacity={0.35}>
        <Path
          d="M 22 14 L 60 14 L 56 32 L 44 42 L 44 44 L 56 54 L 60 72 L 22 72 L 26 54 L 38 44 L 38 42 L 26 32 Z"
          fill={colors.inkPrimary}
          transform="translate(2 2)"
        />
      </G>
      {/* Layer 2: Hourglass silhouette (rose) */}
      <G filter="url(#tearing-strong)">
        <Path
          d="M 22 14 L 60 14 L 56 32 L 44 42 L 44 44 L 56 54 L 60 72 L 22 72 L 26 54 L 38 44 L 38 42 L 26 32 Z"
          fill={colors.rose}
        />
      </G>
      {/* Layer 3: Sand top (yolk) */}
      <G filter="url(#tearing-mid)">
        <Path d="M 26 18 L 56 18 L 52 32 L 44 40 L 38 40 L 30 32 Z" fill={colors.yolk} />
      </G>
      {/* Layer 4: Sand bottom (brick) */}
      <G filter="url(#tearing-mid)">
        <Path d="M 30 54 L 52 54 L 58 68 L 24 68 Z" fill={colors.brick} />
      </G>
      {/* Layer 5: Sand stream falling */}
      <G filter="url(#tearing-soft)">
        <Path d="M 40 40 L 42 40 L 42 54 L 40 54 Z" fill={colors.yolk} />
      </G>
      {/* Top/bottom caps */}
      <G filter="url(#tearing-strong)">
        <Path d="M 20 12 L 62 12 L 62 16 L 20 16 Z" fill={colors.brown} />
        <Path d="M 20 70 L 62 70 L 62 74 L 20 74 Z" fill={colors.brown} />
      </G>
    </Svg>
  );
}

// Library — abstract bookshelf + a small plant (growth)
export function LibraryIll({ size = 80 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 80 80" testID="ill-library">
      <TearingDefs />
      {/* Layer 1: Shadow — deep brown offset */}
      <G filter="url(#tearing-strong)" opacity={0.35}>
        <Rect x="10" y="22" width="50" height="46" fill={colors.inkPrimary} rx="2" />
      </G>
      {/* Layer 2: Shelf frame — brown */}
      <G filter="url(#tearing-strong)">
        <Rect x="8" y="20" width="50" height="46" fill={colors.brown} rx="2" />
        {/* Interior lighter panel */}
        <Rect x="12" y="24" width="42" height="38" fill={colors.paperCream} />
        {/* Horizontal shelf divider */}
        <Rect x="12" y="43" width="42" height="2" fill={colors.brown} />
      </G>
      {/* Layer 3: Book spines row 1 — top shelf, torn */}
      <G filter="url(#tearing-strong)">
        <Rect x="14" y="26" width="7" height="16" fill={colors.brick} />
        <Rect x="22" y="26" width="7" height="16" fill={colors.sapphire} />
        <Rect x="30" y="28" width="7" height="14" fill={colors.rose} />
        <Rect x="38" y="26" width="7" height="16" fill={colors.olive} />
        <Rect x="46" y="27" width="7" height="15" fill={colors.yolk} />
      </G>
      {/* Layer 4: Book spines row 2 */}
      <G filter="url(#tearing-strong)">
        <Rect x="14" y="46" width="8" height="14" fill={colors.sapphire} />
        <Rect x="23" y="48" width="7" height="12" fill={colors.brick} />
        <Rect x="31" y="46" width="7" height="14" fill={colors.yolk} />
        <Rect x="39" y="48" width="7" height="12" fill={colors.rose} />
        <Rect x="47" y="46" width="7" height="14" fill={colors.olive} />
      </G>
      {/* Plant pot next to shelf — layered */}
      <G filter="url(#tearing-mid)" opacity={0.4}>
        <Rect x="64" y="54" width="12" height="14" fill={colors.inkPrimary} />
      </G>
      <G filter="url(#tearing-strong)">
        <Rect x="62" y="52" width="12" height="14" fill={colors.brick} />
      </G>
      {/* Plant leaves — torn */}
      <G filter="url(#tearing-strong)">
        <Ellipse cx="66" cy="42" rx="3" ry="8" fill={colors.olive} />
        <Ellipse cx="70" cy="38" rx="3" ry="10" fill={colors.olive} />
        <Ellipse cx="72" cy="46" rx="3" ry="7" fill={colors.olive} />
      </G>
    </Svg>
  );
}
