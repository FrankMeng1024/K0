// K0 ScreenHeader — Sprint 13 R1 rebuilt
// 所有内页统一顶部：返回按钮 + 标题 + 副标题 + WovenDivider（首页同款撕纸织带）
// 对齐首页美学（Cutout Illustrated 撕纸手工风）
import React from 'react';
import { View, Text, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, spacing } from '@/constants/theme';
import { WovenDivider } from '@/components/WovenDivider';

export type ScreenHeaderProps = {
  title: string;
  subtitle?: string;
  backLabel?: string;
  onBack?: () => void;
};

export function ScreenHeader({ title, subtitle, backLabel = '‹ 返回', onBack }: ScreenHeaderProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  // Sprint 13 R1: dynamic dividerWidth 匹配 cardWidth（对齐首页 index.tsx）
  const dividerWidth = Math.max(280, Math.min(width - spacing.xl * 2, 380));

  const handleBack = () => {
    if (onBack) return onBack();
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  return (
    // Sprint 13 R1: paddingTop insets.top + xl 支持 iPhone 灵动岛
    // Sprint 16 R9: 移除内嵌返回按钮，改用 FloatingBackButton 常驻左上角
    <View style={[styles.wrap, { paddingTop: insets.top + spacing.xxxl }]}>
      <Text style={styles.title} accessibilityRole="header">{title}</Text>
      {subtitle ? <Text style={styles.subtitle} numberOfLines={2}>{subtitle}</Text> : null}
      <View style={styles.dividerBlock}>
        <WovenDivider width={dividerWidth} height={12} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.xl,
    gap: spacing.xs,
    backgroundColor: colors.paperMain,
  },
  title: {
    fontFamily: fonts.hero,
    fontSize: 44,
    lineHeight: 58,
    color: colors.inkPrimary,
    letterSpacing: -1,
    includeFontPadding: true,
  },
  subtitle: {
    fontFamily: fonts.bodyItalic,
    fontStyle: 'italic',
    fontSize: 13,
    lineHeight: 18,
    color: colors.inkSecondary,
    marginTop: spacing.xs / 2,
  },
  dividerBlock: {
    alignItems: 'center',
    marginTop: spacing.md,
  },
});
