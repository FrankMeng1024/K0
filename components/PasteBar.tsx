// PasteBar — Home 底部拇指区 primary CTA (STORY-00101).
// 用户在 Home 首屏就能粘贴链接直达 Learn 流程，不必先点导航卡片。
import React, { useState, useCallback } from 'react';
import { View, TextInput, Pressable, StyleSheet, Platform, Keyboard } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { colors, fonts, spacing, radii } from '@/constants/theme';

export function PasteBar({ bottomInset }: { bottomInset: number }) {
  const [text, setText] = useState('');
  const canSubmit = text.trim().length > 0;

  const onSubmit = useCallback(() => {
    if (!canSubmit) return;
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    Keyboard.dismiss();
    router.push({ pathname: '/learn', params: { text: text.trim() } });
  }, [canSubmit, text]);

  return (
    <View style={[styles.container, { paddingBottom: bottomInset + spacing.md }]}>
      <View style={styles.bar}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="粘贴播客链接或文本，直接开始…"
          placeholderTextColor={colors.inkSecondary}
          style={styles.input}
          multiline={false}
          returnKeyType="go"
          onSubmitEditing={onSubmit}
          // @ts-ignore
          dataSet={{ testid: 'home-pastebar-input' }}
        />
        <Pressable
          onPress={onSubmit}
          disabled={!canSubmit}
          // @ts-ignore
          dataSet={{ testid: 'home-pastebar-cta' }}
          accessibilityRole="button"
          accessibilityLabel="开始"
          style={({ pressed }) => [
            styles.cta,
            !canSubmit && styles.ctaDisabled,
            pressed && canSubmit && styles.ctaPressed,
          ]}
        >
          <View style={styles.ctaInner}>
            <View style={styles.ctaArrow} />
          </View>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.paperMain,
    // Soft top shadow to visually detach from scroll content
    borderTopWidth: 1,
    borderTopColor: colors.paperDark,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.paperCream,
    borderRadius: radii.card,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    paddingVertical: spacing.xs,
    minHeight: 52,
  },
  input: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.inkPrimary,
    paddingVertical: spacing.sm,
    // web-only outline reset
    // @ts-ignore
    outlineStyle: 'none',
  },
  cta: {
    width: 44,
    height: 44,
    borderRadius: radii.card,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brick,
  },
  ctaDisabled: {
    backgroundColor: colors.paperDark,
  },
  ctaPressed: {
    transform: [{ scale: 0.94 }],
  },
  ctaInner: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaArrow: {
    // ASCII → replaced with SVG-ish shape (right pointing arrow)
    width: 12,
    height: 12,
    borderTopWidth: 2,
    borderRightWidth: 2,
    borderColor: colors.paperCream,
    transform: [{ rotate: '45deg' }],
    marginLeft: -3,
  },
});
