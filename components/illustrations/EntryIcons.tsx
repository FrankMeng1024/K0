// Illustrations for the 3 entry cards (Learn / Review / Library).
// Each is geometric-abstract, not realistic.
import React from 'react';
import Svg, { Circle, Rect, Path, G, Ellipse, Polygon } from 'react-native-svg';
import { colors } from '@/constants/theme';
import { TearingDefs } from './TearingDefs';

// Learn — a hand pointing forward (learning path start)
export function LearnIll({ size = 80 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 80 80" testID="ill-learn">
      <TearingDefs />
      {/* Palm base — brown */}
      <G filter="url(#tearing-mid)">
        <Rect x="18" y="34" width="34" height="30" fill={colors.brown} rx="4" />
      </G>
      {/* Thumb — sapphire */}
      <G filter="url(#tearing-strong)">
        <Ellipse cx="18" cy="42" rx="6" ry="10" fill={colors.sapphire} />
      </G>
      {/* Pointing index finger — yolk */}
      <G filter="url(#tearing-strong)">
        <Rect x="46" y="28" width="24" height="10" fill={colors.yolk} rx="5" />
      </G>
      {/* Other fingers — folded, dark accents */}
      <G filter="url(#tearing-soft)">
        <Rect x="24" y="30" width="6" height="10" fill={colors.inkSecondary} rx="2" />
        <Rect x="32" y="30" width="6" height="10" fill={colors.inkSecondary} rx="2" />
        <Rect x="40" y="30" width="6" height="10" fill={colors.inkSecondary} rx="2" />
      </G>
      {/* Sparkle dots — brick red, hint of "aha" */}
      <Circle cx="74" cy="20" r="2.5" fill={colors.brick} />
      <Circle cx="70" cy="14" r="1.8" fill={colors.brick} />
      <Circle cx="76" cy="10" r="1.2" fill={colors.brick} />
    </Svg>
  );
}

// Review — abstract brain / thought loops (revisiting)
export function ReviewIll({ size = 80 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 80 80" testID="ill-review">
      <TearingDefs />
      {/* Brain outer shape — rose */}
      <G filter="url(#tearing-mid)">
        <Path
          d="M 20 42 Q 12 30 22 20 Q 28 12 40 15 Q 52 12 58 20 Q 68 30 60 42 Q 66 55 58 62 Q 50 68 40 65 Q 30 68 22 62 Q 14 55 20 42 Z"
          fill={colors.rose}
        />
      </G>
      {/* Left hemisphere fold — deeper brown */}
      <G filter="url(#tearing-strong)">
        <Path
          d="M 30 30 Q 26 40 30 50 Q 34 45 34 40 Q 34 35 30 30 Z"
          fill={colors.brown}
        />
      </G>
      {/* Right lobe — sapphire slot */}
      <G filter="url(#tearing-strong)">
        <Ellipse cx="50" cy="40" rx="6" ry="10" fill={colors.sapphire} />
      </G>
      {/* Thinking dots orbiting */}
      <Circle cx="12" cy="15" r="2.5" fill={colors.yolk} />
      <Circle cx="68" cy="18" r="2.5" fill={colors.yolk} />
      <Circle cx="70" cy="60" r="2" fill={colors.brick} />
    </Svg>
  );
}

// Library — abstract bookshelf + a small plant (growth)
export function LibraryIll({ size = 80 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 80 80" testID="ill-library">
      <TearingDefs />
      {/* Shelf frame — brown */}
      <G filter="url(#tearing-mid)">
        <Rect x="8" y="20" width="50" height="46" fill={colors.brown} rx="2" />
        {/* Interior lighter panel */}
        <Rect x="12" y="24" width="42" height="38" fill={colors.paperCream} />
      </G>
      {/* Book spines row 1 — top shelf */}
      <G filter="url(#tearing-strong)">
        <Rect x="14" y="26" width="6" height="16" fill={colors.brick} />
        <Rect x="22" y="26" width="6" height="16" fill={colors.sapphire} />
        <Rect x="30" y="28" width="6" height="14" fill={colors.rose} />
        <Rect x="38" y="26" width="6" height="16" fill={colors.olive} />
        <Rect x="46" y="27" width="6" height="15" fill={colors.yolk} />
      </G>
      {/* Book spines row 2 */}
      <G filter="url(#tearing-strong)">
        <Rect x="14" y="46" width="8" height="14" fill={colors.sapphire} />
        <Rect x="24" y="48" width="6" height="12" fill={colors.brick} />
        <Rect x="32" y="46" width="6" height="14" fill={colors.yolk} />
        <Rect x="40" y="48" width="6" height="12" fill={colors.rose} />
        <Rect x="48" y="46" width="6" height="14" fill={colors.olive} />
      </G>
      {/* Plant pot next to shelf */}
      <G filter="url(#tearing-soft)">
        <Rect x="62" y="52" width="12" height="14" fill={colors.brick} />
      </G>
      {/* Plant leaves */}
      <G filter="url(#tearing-mid)">
        <Ellipse cx="66" cy="42" rx="3" ry="8" fill={colors.olive} />
        <Ellipse cx="70" cy="38" rx="3" ry="10" fill={colors.olive} />
        <Ellipse cx="72" cy="46" rx="3" ry="7" fill={colors.olive} />
      </G>
    </Svg>
  );
}
