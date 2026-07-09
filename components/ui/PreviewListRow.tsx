// 统一预览列表行骨架 — library「学习包」tab 和「卡片」tab 同级预览 list 共用同一外壳
// Frank 原则: list 是 list(预览行骨架统一, 内容各自填), detail 是 detail(K0Card)
// - 统一背景 paperCream / 圆角 radii.card / 按压反馈 / 可选左侧色条
// - 行内容由 children 决定 (学习包行: 封面+title+meta; 卡片行: insight+摘要+来源)
import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { colors, radii } from '@/constants/theme';

export function PreviewListRow({
  accentColor,
  onPress,
  accessibilityLabel,
  children,
}: {
  /** 可选左侧色条 (卡片行按类型着色; 学习包行不传) */
  accentColor?: string;
  onPress?: () => void;
  accessibilityLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={styles.row}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      {accentColor ? <View style={[styles.accent, { backgroundColor: accentColor }]} /> : null}
      <View style={styles.inner}>{children}</View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    backgroundColor: colors.paperCream,
    borderRadius: radii.card,
    overflow: 'hidden',
  },
  accent: { width: 4 },
  inner: { flex: 1 },
});
