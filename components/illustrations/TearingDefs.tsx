// Reusable torn-paper filter for SVG shapes (Style F core visual).
// Wrap shapes in <G filter="url(#tearing-strong)"> etc. after mounting <TearingDefs />.
import React from 'react';
import { Defs, Filter, FeTurbulence, FeDisplacementMap } from 'react-native-svg';
import { tearing } from '@/constants/theme';

type Preset = 'strong' | 'mid' | 'soft';

export function TearingDefs() {
  return (
    <Defs>
      {(Object.keys(tearing) as Preset[]).map(preset => {
        const cfg = tearing[preset];
        return (
          <Filter
            key={preset}
            id={`tearing-${preset}`}
            x="-10%"
            y="-10%"
            width="120%"
            height="120%"
          >
            <FeTurbulence
              type="fractalNoise"
              baseFrequency={cfg.baseFrequency}
              numOctaves={cfg.numOctaves}
              seed={cfg.seed}
              result="noise"
            />
            <FeDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale={cfg.scale}
            />
          </Filter>
        );
      })}
    </Defs>
  );
}
