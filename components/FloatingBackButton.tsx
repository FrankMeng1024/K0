// K0 FloatingBackButton — Sprint 16 R8
// 永久悬浮在页面左上角的返回按钮（不受滚动影响）
// 灵感：iOS App 常见 sticky 返回浮层，撕纸风 pill
import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, spacing, radii } from '@/constants/theme';

export function FloatingBackButton({ onPress }: { onPress?: () => void }) {
  const insets = useSafeAreaInsets();
  const handleBack = () => {
    if (onPress) return onPress();
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };
  return (
    <Pressable
      onPress={handleBack}
      style={[styles.btn, { top: insets.top + spacing.xs }]}
      accessibilityRole="button"
      accessibilityLabel="返回"
      hitSlop={12}
    >
      <Text style={styles.text}>‹ 返回</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    position: 'absolute',
    left: spacing.md,
    zIndex: 999,
    backgroundColor: colors.paperCream,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: 999,
    // 撕纸风轻阴影
    shadowColor: colors.inkPrimary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },
  text: {
    fontFamily: fonts.ui,
    fontSize: 14,
    color: colors.inkPrimary,
    letterSpacing: 0.3,
  },
});
