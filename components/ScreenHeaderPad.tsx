// K0 ScreenHeaderPad — iPad 横屏专用顶栏 (与手机版 ScreenHeader 完全独立, 零共享)
// Frank 要求: 返回按钮在最左侧、分割线放大铺满内容宽、整体 iPad 风格统一(引用 ipadTheme)。
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, spacing } from '@/constants/theme';
import { ipad } from '@/constants/ipadTheme';
import { WovenDivider } from '@/components/WovenDivider';

export type ScreenHeaderPadProps = {
  title: string;
  subtitle?: string;
  backLabel?: string;
  onBack?: () => void;
};

export function ScreenHeaderPad({ title, subtitle, backLabel = '‹ 返回', onBack }: ScreenHeaderPadProps) {
  const insets = useSafeAreaInsets();
  const handleBack = () => {
    if (onBack) return onBack();
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + ipad.padTop }]}>
      <View style={styles.inner}>
        {/* 返回按钮: 最左侧独占一行 */}
        <Pressable onPress={handleBack} style={styles.backBtn} accessibilityRole="button" accessibilityLabel={backLabel} hitSlop={14}>
          <Text style={styles.backText}>{backLabel}</Text>
        </Pressable>
        <Text style={styles.title} accessibilityRole="header">{title}</Text>
        {subtitle ? <Text style={styles.subtitle} numberOfLines={2}>{subtitle}</Text> : null}
        <View style={styles.dividerBlock}>
          <WovenDivider width={ipad.dividerWidth} height={ipad.header.dividerHeight} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: colors.paperMain, paddingHorizontal: ipad.gutter },
  // 内容限宽居中: 左右各留适度呼吸(不空太多), 全页统一
  inner: { maxWidth: ipad.maxContentWidth, width: '100%', alignSelf: 'center', gap: ipad.header.gap },
  backBtn: { alignSelf: 'flex-start', paddingVertical: spacing.xs },
  backText: { fontFamily: fonts.ui, fontSize: ipad.header.backSize, color: colors.inkSecondary, letterSpacing: 0.3 },
  title: { fontFamily: fonts.hero, fontSize: ipad.header.titleSize, lineHeight: ipad.header.titleSize + 12, color: colors.inkPrimary, letterSpacing: -0.5, includeFontPadding: true },
  subtitle: { fontFamily: fonts.bodyItalic, fontStyle: 'italic', fontSize: ipad.header.subtitleSize, lineHeight: 22, color: colors.inkSecondary },
  dividerBlock: { alignItems: 'center', marginTop: spacing.md },
});
