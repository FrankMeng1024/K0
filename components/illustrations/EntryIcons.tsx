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
  return (
    <Svg width={size} height={size} viewBox="0 0 80 80" testID="ill-review">
      <TearingDefs />
      {/* Layer 1: Shadow copy — dark brown offset */}
      <G filter="url(#tearing-strong)" opacity={0.35}>
        <Path
          d="M 23 45 Q 15 33 25 23 Q 31 15 43 18 Q 55 15 61 23 Q 71 33 63 45 Q 69 58 61 65 Q 53 71 43 68 Q 33 71 25 65 Q 17 58 23 45 Z"
          fill={colors.inkPrimary}
        />
      </G>
      {/* Layer 2: Brain outer shape — rose */}
      <G filter="url(#tearing-strong)">
        <Path
          d="M 20 42 Q 12 30 22 20 Q 28 12 40 15 Q 52 12 58 20 Q 68 30 60 42 Q 66 55 58 62 Q 50 68 40 65 Q 30 68 22 62 Q 14 55 20 42 Z"
          fill={colors.rose}
        />
      </G>
      {/* Layer 3: Left hemisphere fold — deeper brown */}
      <G filter="url(#tearing-mid)">
        <Path
          d="M 30 30 Q 26 40 30 50 Q 34 45 34 40 Q 34 35 30 30 Z"
          fill={colors.brown}
        />
      </G>
      {/* Right lobe — sapphire slot */}
      <G filter="url(#tearing-strong)">
        <Ellipse cx="50" cy="40" rx="6" ry="10" fill={colors.sapphire} />
      </G>
      {/* Layer 4: Thinking dots orbiting — small torn accents */}
      <G filter="url(#tearing-soft)">
        <Circle cx="12" cy="15" r="3" fill={colors.yolk} />
        <Circle cx="68" cy="18" r="3" fill={colors.yolk} />
        <Circle cx="70" cy="60" r="2.5" fill={colors.brick} />
        <Circle cx="8" cy="55" r="2" fill={colors.brick} />
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
