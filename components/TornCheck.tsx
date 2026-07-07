// K0 TornCheck — Sprint 13 R4
// 撕纸手工风勾选组件（替代 unicode ✓）
// 支持 unchecked / checked 双态，可用于 checkbox / stepBox / actionBox 等所有勾选 UI
import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors } from '@/constants/theme';

export type TornCheckProps = {
  size?: number;
  checked?: boolean;
  color?: string; // checked 时的填充色
  uncheckedBorderColor?: string;
};

export function TornCheck({
  size = 20,
  checked = false,
  color = colors.olive,
  uncheckedBorderColor = colors.inkSecondary,
}: TornCheckProps) {
  const s = size;
  return (
    <View
      style={[
        styles.box,
        {
          width: s,
          height: s,
          borderRadius: 4,
          borderWidth: checked ? 0 : 1.5,
          borderColor: uncheckedBorderColor,
          backgroundColor: checked ? color : 'transparent',
        },
      ]}
    >
      {checked ? (
        <Svg width={s * 0.7} height={s * 0.7} viewBox="0 0 20 20">
          {/* 手撕胶带勾——起笔在左下，收笔在右上，非几何完美的偏移 */}
          <Path
            d="M4 11 L7.5 15 L16 5"
            stroke={colors.paperCream}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </Svg>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
