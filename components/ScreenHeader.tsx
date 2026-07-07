// K0 ScreenHeader — Sprint 11 v3
// 所有内页统一顶部：返回按钮 + 标题 + 副标题 + 分割线
// 对齐首页美学（Cutout Illustrated 撕纸手工风）
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, spacing } from '@/constants/theme';

export type ScreenHeaderProps = {
  title: string;
  subtitle?: string;
  backLabel?: string;
  onBack?: () => void;
};

export function ScreenHeader({ title, subtitle, backLabel = '‹ 首页', onBack }: ScreenHeaderProps) {
  const insets = useSafeAreaInsets();

  const handleBack = () => {
    if (onBack) return onBack();
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + spacing.lg }]}>
      <View style={styles.row}>
        <Pressable
          onPress={handleBack}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel={backLabel}
          hitSlop={12}
        >
          <Text style={styles.backText}>{backLabel}</Text>
        </Pressable>
      </View>
      <Text style={styles.title} accessibilityRole="header">{title}</Text>
      {subtitle ? <Text style={styles.subtitle} numberOfLines={2}>{subtitle}</Text> : null}
      {/* Sprint 12 #4: 分割线换成极简一根实线（撕纸风的 WovenDivider 在内页 header 里太重） */}
      <View style={styles.divider} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.xl,
    gap: spacing.xs,
    backgroundColor: colors.paperMain,
  },
  divider: {
    height: 1,
    backgroundColor: colors.paperDark,
    marginTop: spacing.md,
    opacity: 0.4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  backBtn: {
    paddingVertical: spacing.xs,
  },
  backText: {
    fontFamily: fonts.ui,
    fontSize: 15,
    color: colors.inkSecondary,
    letterSpacing: 0.3,
  },
  title: {
    fontFamily: fonts.hero,
    fontSize: 40,
    lineHeight: 42,
    color: colors.inkPrimary,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontFamily: fonts.bodyItalic,
    fontStyle: 'italic',
    fontSize: 13,
    lineHeight: 18,
    color: colors.inkSecondary,
    marginTop: spacing.xs / 2,
  },
});
