// K0 ScreenHeaderPad — iPad 横屏专用顶栏 (与手机版 ScreenHeader 完全独立, 零共享)
// 响应式: gutter/分割线宽按实际屏宽算(ipadLayout), 不 hardcode → 任何 iPad 不贴边、分割线铺满。
import React from 'react';
import { View, Text, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, spacing } from '@/constants/theme';
import { ipad, ipadLayout } from '@/constants/ipadTheme';
import { WovenDivider } from '@/components/WovenDivider';

export type ScreenHeaderPadProps = {
  title: string;
  subtitle?: string;
  backLabel?: string;
  onBack?: () => void;
};

export function ScreenHeaderPad({ title, subtitle, backLabel = '‹ 返回', onBack }: ScreenHeaderPadProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const L = ipadLayout(width);
  const handleBack = () => {
    if (onBack) return onBack();
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + ipad.padTop, paddingHorizontal: L.gutter }]}>
      <View style={[styles.inner, { maxWidth: L.contentWidth }]}>
        {/* 返回按钮: 最左侧独占一行 */}
        <Pressable onPress={handleBack} style={styles.backBtn} accessibilityRole="button" accessibilityLabel={backLabel} hitSlop={14}>
          <Text style={styles.backText}>{backLabel}</Text>
        </Pressable>
        <Text style={styles.title} accessibilityRole="header">{title}</Text>
        {subtitle ? <Text style={styles.subtitle} numberOfLines={2}>{subtitle}</Text> : null}
        <View style={styles.dividerBlock}>
          <WovenDivider width={L.dividerWidth} height={ipad.header.dividerHeight} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: colors.paperMain },
  // 内容限宽居中(maxWidth 运行时按屏宽算): 左右适度呼吸, 不贴边不空太多。
  inner: { width: '100%', alignSelf: 'center', gap: ipad.header.gap },
  backBtn: { alignSelf: 'flex-start', paddingVertical: spacing.xs },
  backText: { fontFamily: fonts.ui, fontSize: ipad.header.backSize, color: colors.inkSecondary, letterSpacing: 0.3 },
  title: { fontFamily: fonts.hero, fontSize: ipad.header.titleSize, lineHeight: ipad.header.titleSize + 12, color: colors.inkPrimary, letterSpacing: -0.5, includeFontPadding: true },
  subtitle: { fontFamily: fonts.bodyItalic, fontStyle: 'italic', fontSize: ipad.header.subtitleSize, lineHeight: 22, color: colors.inkSecondary },
  dividerBlock: { alignItems: 'center', marginTop: spacing.md },
});
