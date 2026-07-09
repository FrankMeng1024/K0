// 统一 loading 转圈块 — 原 review/library/snapshot/episode/card 各内联一份 (Phase B 统一)
import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { colors, spacing } from '@/constants/theme';

export function LoadingBlock() {
  return (
    <View style={styles.block}>
      <ActivityIndicator color={colors.brick} />
    </View>
  );
}

const styles = StyleSheet.create({
  block: { paddingVertical: spacing.xxl, alignItems: 'center' },
});
