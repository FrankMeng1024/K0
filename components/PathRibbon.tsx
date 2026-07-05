// PathRibbon — 6 步学习路径纵向撕纸进度带 (Sprint 4 STORY-00103).
// 走过的 step 部分为彩色撕纸纸带；未走的部分为米色描线。
import React from 'react';
import Svg, { Path, Circle, G } from 'react-native-svg';
import { colors } from '@/constants/theme';
import { TearingDefs } from './illustrations/TearingDefs';

const STEP_COLORS = [colors.brick, colors.yolk, colors.sapphire, colors.rose, colors.olive, colors.brown];

export function PathRibbon({
  totalSteps = 6,
  completedIndices,
  height,
}: {
  totalSteps?: number;
  completedIndices: Set<number>;
  height: number;
}) {
  const stepHeight = height / totalSteps;
  const width = 20;
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <TearingDefs />

      {/* Unfinished trail — dashed cream line */}
      <Path
        d={`M ${width / 2} 4 L ${width / 2} ${height - 4}`}
        stroke={colors.paperDark}
        strokeWidth={3}
        strokeDasharray="4 6"
        fill="none"
        strokeLinecap="round"
      />

      {/* Completed ribbons — colored torn strips per completed step */}
      <G filter="url(#tearing-strong)">
        {Array.from({ length: totalSteps }).map((_, i) => {
          if (!completedIndices.has(i)) return null;
          const yTop = i * stepHeight + 2;
          const yBot = (i + 1) * stepHeight - 2;
          const color = STEP_COLORS[i % STEP_COLORS.length];
          const wobble = 3;
          // Draw a torn strip with slight zigzag left/right
          const d = `M ${width / 2 - wobble} ${yTop}
                     L ${width / 2 + wobble} ${yTop}
                     L ${width / 2 - wobble * 0.7} ${yTop + stepHeight / 3}
                     L ${width / 2 + wobble} ${yTop + stepHeight / 2}
                     L ${width / 2 - wobble * 0.5} ${yBot - stepHeight / 4}
                     L ${width / 2 + wobble} ${yBot}
                     L ${width / 2 - wobble} ${yBot}
                     Z`;
          return <Path key={i} d={d} fill={color} opacity={0.85} />;
        })}
      </G>

      {/* Step dots — small circles at each step position */}
      <G filter="url(#tearing-mid)">
        {Array.from({ length: totalSteps }).map((_, i) => {
          const cy = (i + 0.5) * stepHeight;
          const done = completedIndices.has(i);
          return (
            <Circle
              key={`dot-${i}`}
              cx={width / 2}
              cy={cy}
              r={done ? 5 : 3}
              fill={done ? STEP_COLORS[i % STEP_COLORS.length] : colors.paperDark}
              stroke={done ? colors.inkPrimary : 'transparent'}
              strokeWidth={done ? 0.8 : 0}
            />
          );
        })}
      </G>
    </Svg>
  );
}
