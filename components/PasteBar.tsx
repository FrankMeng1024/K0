// PasteBar — Home 底部拇指区 primary CTA (STORY-00101 + Sprint 7 URL 路由).
// 用户在 Home 首屏就能粘贴链接直达 Learn 流程，不必先点导航卡片。
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, TextInput, Pressable, StyleSheet, Platform, Keyboard, Text, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, fonts, spacing, radii } from '@/constants/theme';
import { detectUrlType, getAnonymousId } from '@/lib/urlDetector';
import { apiFetch, ApiError } from '@/lib/api';
// Sprint 9 v7 回退：push init 需下次 EAS build 才能安全启用
// import { initPushNotifications } from '@/lib/pushNotifications';

const LAST_URL_KEY = 'k0.lastUrl';

export function PasteBar({ bottomInset }: { bottomInset: number }) {
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const submittingRef = useRef(false); // 同步防抖 — 避免多点在 React state 生效前串行发送
  const canSubmit = text.trim().length > 0 && !submitting;

  // Sprint 8: 挂载时读取上次失败的 URL 用于预填（Import 屏"回首页重试"）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const last = await AsyncStorage.getItem(LAST_URL_KEY);
        if (last && !cancelled) {
          setText(last);
          // 消费一次即清除，避免下次冷启动仍预填
          AsyncStorage.removeItem(LAST_URL_KEY).catch(() => {});
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  const onSubmit = useCallback(async () => {
    if (submittingRef.current) return; // 同步屏蔽
    if (!canSubmit) return;
    submittingRef.current = true;
    setErrorMsg(null);
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    Keyboard.dismiss();

    const trimmed = text.trim();
    const urlType = detectUrlType(trimmed);

    if (urlType === 'text') {
      router.push({ pathname: '/learn', params: { text: trimmed } });
      submittingRef.current = false;
      return;
    }

    // URL: 调 backend import-url，拿 jobId 跳等待屏
    setSubmitting(true);
    try {
      const anonymousId = await getAnonymousId();
      const { jobId } = await apiFetch<{ jobId: string; status: string }>(
        '/api/episodes/import-url',
        {
          method: 'POST',
          body: JSON.stringify({ url: trimmed, goal: 'quick_understand', anonymousId }),
        }
      );
      router.push({ pathname: '/import/[jobId]', params: { jobId, url: trimmed } });
      // Sprint 9 v7 回退：push init 移到下次 EAS build 后再激活
      // initPushNotifications({ requestPermission: true }).catch(() => {});
    } catch (e: any) {
      // Sprint 8: inline error 替代 alert，提供友好文案
      console.error('import-url fail', e);
      let msg = '提交失败，稍后再试';
      if (e instanceof ApiError) {
        if (e.code === 'NETWORK_TIMEOUT') msg = '请求超时，检查网络后再试';
        else if (e.code === 'NETWORK_ERROR') msg = '网络连接失败，检查网络';
        else if (e.code === 'INVALID_URL') msg = '这个链接看起来不对，检查一下';
        else if (e.code === 'SOURCE_NOT_SUPPORTED') msg = '暂不支持这个来源';
        else if (e.message) msg = e.message;
      }
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
      submittingRef.current = false;
    }
  }, [canSubmit, text]);

  return (
    <View style={[styles.container, { paddingBottom: bottomInset + spacing.md }]}>
      {errorMsg ? (
        <View style={styles.errorPill}>
          <Text style={styles.errorPillText}>{errorMsg}</Text>
        </View>
      ) : null}
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
          editable={!submitting}
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
            {submitting ? (
              <ActivityIndicator size="small" color={colors.paperCream} />
            ) : (
              <View style={styles.ctaArrow} />
            )}
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
  errorPill: {
    backgroundColor: colors.brick,
    borderRadius: radii.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  errorPillText: {
    fontFamily: fonts.ui,
    fontSize: 13,
    color: colors.paperCream,
    textAlign: 'center',
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
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}),
  } as any,
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
