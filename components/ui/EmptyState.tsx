// 统一空状态块 — 原 review/library 各内联多个变体 (Phase B 统一)
// 结构: 插画(children) + 标题 + 说明 + 可选额外提示 + 可选 CTA 按钮
// 统一间距采用 review 版 (gap: md), 修正之前 review/library 不一致的问题
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, fonts, spacing, radii } from '@/constants/theme';

export function EmptyState({
  illustration,
  title,
  text,
  hint,
  ctaLabel,
  onCtaPress,
}: {
  illustration?: React.ReactNode;
  title: string;
  text?: string;
  hint?: string;
  ctaLabel?: string;
  onCtaPress?: () => void;
}) {
  return (
    <View style={styles.block}>
      {illustration ? <View style={styles.ill}>{illustration}</View> : null}
      <Text style={styles.title}>{title}</Text>
      {text ? <Text style={styles.text}>{text}</Text> : null}
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      {ctaLabel && onCtaPress ? (
        <Pressable style={styles.btn} onPress={onCtaPress}>
          <Text style={styles.btnText}>{ctaLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xxl },
  ill: { marginBottom: spacing.md },
  title: { fontFamily: fonts.hero, fontSize: 22, color: colors.inkPrimary, textAlign: 'center' },
  text: { fontFamily: fonts.body, fontSize: 14, color: colors.inkSecondary, textAlign: 'center' },
  hint: { fontFamily: fonts.bodyItalic, fontStyle: 'italic', fontSize: 13, color: colors.inkSecondary },
  btn: {
    marginTop: spacing.md,
    backgroundColor: colors.brick,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radii.card,
  },
  btnText: { fontFamily: fonts.ui, fontSize: 15, color: colors.paperCream, fontWeight: '600' },
});
