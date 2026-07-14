// K0 登录/注册页 — Sprint 16 R2
// 仿首页风格：Bagel Fat One 大标题 + 撕纸手工风 + HeadphoneListener 插图 + WovenDivider
// 3-tap 耳机图 → version popup + upload debug（原本在首页，Sprint 16 R2 挪过来）
// upload debug 保留在首页（Frank 要求）
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Platform,
  Modal,
  KeyboardAvoidingView,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { colors, fonts, spacing, radii } from '@/constants/theme';
import { HeadphoneListener } from '@/components/illustrations/HeadphoneListener';
import { WovenDivider } from '@/components/WovenDivider';
import { OtaBadge, OTA_VERSION, OTA_VERSION_MESSAGE } from '@/components/OtaBadge';
import { DebugUploadZone } from '@/components/DebugUploadZone';
import { setSession, loginApi, registerApi, saveCredentials, clearCredentials, loadCredentials } from '@/lib/auth';
import { useResponsive } from '@/hooks/useResponsive';
export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const { isWide } = useResponsive();
  // Sprint 16 R2 v30: 尺寸与首页 (index.tsx) 完全一致
  const isSmallHeight = windowHeight <= 700;
  const heroSize = isSmallHeight ? 88 : 120;
  // R55g(#1): iPad 登录全屏(不再限宽成小卡片, Frank要求); 分割线=表单实际宽(减去左右 padding)→ 铺满不短。
  const cardWidth = isWide ? (windowWidth - spacing.xl * 2) : Math.max(280, Math.min(windowWidth - 40, 380));
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 3-tap version popup (从首页挪过来)
  const [versionModalOpen, setVersionModalOpen] = useState(false);
  const tapCountRef = useRef(0);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sprint 16 R3 v32: 每次开 App 都到登录页，从不自动跳首页
  // 若之前勾过"记住账号密码"，读出来预填输入框，用户仍需手动点登录
  useEffect(() => {
    (async () => {
      const saved = await loadCredentials();
      if (saved) {
        setUsername(saved.username);
        setPassword(saved.password);
        setRememberMe(true);
      }
    })();
  }, []);

  const onHeroTap = useCallback(() => {
    tapCountRef.current += 1;
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    if (tapCountRef.current >= 3) {
      tapCountRef.current = 0;
      setVersionModalOpen(true);
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } else {
      tapTimerRef.current = setTimeout(() => { tapCountRef.current = 0; }, 1200);
    }
  }, []);
  useEffect(() => () => { if (tapTimerRef.current) clearTimeout(tapTimerRef.current); }, []);

  const submit = useCallback(async () => {
    if (submitting) return;
    setError(null);
    const u = username.trim();
    const p = password;
    if (!u || !p) {
      setError('用户名和密码都要填');
      return;
    }
    setSubmitting(true);
    try {
      const session = mode === 'login' ? await loginApi(u, p) : await registerApi(u, p);
      // v32: session 只入内存
      setSession(session);
      // v32: rememberMe 控制的是"下次开 App 预填账号密码"，不是自动登录
      if (rememberMe) {
        await saveCredentials(u, p);
      } else {
        await clearCredentials();
      }
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      // #106: 登录后注册 push token (幂等, web/无权限安全跳过)
      // #108: 消费通知点击留下的待跳路由 (点通知冷启动→未登录→登录后跳目标页)
      import('@/lib/notifications').then(m => { m.registerPushToken(); m.consumePendingRoute(); }).catch(() => {});
      router.replace('/');
    } catch (e: any) {
      setError(e?.message || (mode === 'login' ? '登录失败' : '注册失败'));
    } finally {
      setSubmitting(false);
    }
  }, [mode, username, password, rememberMe, submitting]);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.root}
        contentContainerStyle={{ paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xxxl, paddingHorizontal: spacing.xl, gap: spacing.lg }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Hero — 仿首页 Listen./Learn. 两行 + 耳机图（尺寸完全对齐首页） */}
        <View style={[styles.heroRow, { height: heroSize }]}>
          <View style={[styles.heroTitleCol, { height: heroSize }]}>
            <Text style={styles.hero}>Listen.</Text>
            <Text style={styles.hero}>Learn.</Text>
          </View>
          <Pressable
            onPress={onHeroTap}
            style={[styles.heroIll, { width: heroSize, height: heroSize }]}
            accessibilityRole="image"
            accessibilityLabel="K0 listener"
          >
            <HeadphoneListener size={heroSize} />
          </Pressable>
        </View>

        <Text style={styles.subhead}>
          {mode === 'login' ? '欢迎回来。' : '起一个用户名，创建新账号。'}
        </Text>

        <View style={styles.dividerWrap}>
          <WovenDivider width={cardWidth} height={12} />
        </View>

        {/* Tab: 登录 / 注册 */}
        <View style={styles.tabRow}>
          <Pressable
            onPress={() => { setMode('login'); setError(null); }}
            style={[styles.tabBtn, mode === 'login' && styles.tabBtnActive]}
          >
            <Text style={[styles.tabText, mode === 'login' && styles.tabTextActive]}>登录</Text>
          </Pressable>
          <Pressable
            onPress={() => { setMode('register'); setError(null); }}
            style={[styles.tabBtn, mode === 'register' && styles.tabBtnActive]}
          >
            <Text style={[styles.tabText, mode === 'register' && styles.tabTextActive]}>注册</Text>
          </Pressable>
        </View>

        {/* Form */}
        <View style={styles.formBlock}>
          <View style={styles.inputBlock}>
            <Text style={styles.inputLabel}>用户名</Text>
            <TextInput
              value={username}
              onChangeText={setUsername}
              placeholder=""
              placeholderTextColor={colors.inkSecondary}
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!submitting}
            />
          </View>
          <View style={styles.inputBlock}>
            <Text style={styles.inputLabel}>密码</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder=""
              placeholderTextColor={colors.inkSecondary}
              style={styles.input}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              editable={!submitting}
              onSubmitEditing={submit}
            />
          </View>

          {error ? <Text style={styles.errText}>{error}</Text> : null}

          {/* Sprint 16 R3 v32: 记住账号密码 —— 勾了下次开 App 预填输入框，仍需手动登录 */}
          <Pressable
            onPress={() => setRememberMe(v => !v)}
            style={styles.rememberRow}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: rememberMe }}
            accessibilityLabel="记住账号密码"
            hitSlop={6}
          >
            <View style={[styles.checkbox, rememberMe && styles.checkboxChecked]}>
              {rememberMe ? <Text style={styles.checkmark}>✓</Text> : null}
            </View>
            <Text style={styles.rememberText}>记住账号密码</Text>
          </Pressable>

          <Pressable
            onPress={submit}
            style={({ pressed }) => [styles.submitBtn, pressed && styles.submitBtnPressed, submitting && styles.submitBtnDisabled]}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color={colors.paperCream} />
            ) : (
              <Text style={styles.submitText}>{mode === 'login' ? '登录' : '创建账号'}</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>

      {/* Version popup (3-tap 耳机图触发) —— 从首页挪过来 */}
      <Modal
        visible={versionModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setVersionModalOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setVersionModalOpen(false)}>
          <View style={styles.versionCard}>
            <Text style={styles.versionCardTitle}>K0 · v{OTA_VERSION}</Text>
            <Text style={styles.versionCardBody}>{OTA_VERSION_MESSAGE}</Text>
            <DebugUploadZone />
            <Text style={styles.versionCardHint}>点任意处关闭</Text>
            <View style={{ marginTop: spacing.md }}>
              <OtaBadge inline />
            </View>
          </View>
        </Pressable>
      </Modal>

      {/* 隐藏 OTA 自动检查 —— 仅逻辑，无 UI */}
      <OtaBadge invisible />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paperMain },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroTitleCol: {
    flexShrink: 0,
    justifyContent: 'center',
    marginTop: -8, // 首页 Sprint 14 R1 #1 视觉对齐
  },
  hero: {
    fontFamily: fonts.hero,
    fontSize: 56,
    lineHeight: 60,
    color: colors.inkPrimary,
    letterSpacing: -1.5,
    includeFontPadding: false,
  },
  heroIll: {
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  subhead: {
    fontFamily: fonts.bodyItalic,
    fontStyle: 'italic',
    fontSize: 14,
    lineHeight: 20,
    color: colors.inkSecondary,
    marginTop: spacing.sm,
  },
  dividerWrap: {
    alignItems: 'center',
    marginVertical: spacing.sm,
  },
  tabRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radii.card,
    alignItems: 'center',
    backgroundColor: colors.paperCream,
  },
  tabBtnActive: {
    backgroundColor: colors.brick,
  },
  tabText: {
    fontFamily: fonts.ui,
    fontSize: 15,
    color: colors.inkPrimary,
    fontWeight: '600' as const,
  },
  tabTextActive: {
    color: colors.paperCream,
  },
  formBlock: {
    gap: spacing.md,
  },
  inputBlock: {
    gap: spacing.xs,
  },
  inputLabel: {
    fontFamily: fonts.ui,
    fontSize: 12,
    color: colors.inkSecondary,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    fontWeight: '600' as const,
  },
  input: {
    backgroundColor: colors.paperCream,
    borderRadius: radii.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.inkPrimary,
  },
  errText: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.brick,
    textAlign: 'center',
    marginTop: -spacing.xs,
  },
  // Sprint 16 R2 v31: 记得我 复选框
  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.paperDark,
    backgroundColor: colors.paperCream,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.brick,
    borderColor: colors.brick,
  },
  checkmark: {
    fontFamily: fonts.ui,
    fontSize: 13,
    color: colors.paperCream,
    fontWeight: '700' as const,
    lineHeight: 15,
  },
  rememberText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.inkPrimary,
  },
  submitBtn: {
    backgroundColor: colors.brick,
    borderRadius: radii.card,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
    minHeight: 52,
  },
  submitBtnPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.98 }],
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitText: {
    fontFamily: fonts.ui,
    fontSize: 16,
    color: colors.paperCream,
    fontWeight: '600' as const,
    letterSpacing: 0.5,
  },
  // Version popup
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(26, 22, 19, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  versionCard: {
    backgroundColor: colors.paperCream,
    borderRadius: radii.card,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.xl,
    minWidth: 260,
    alignItems: 'center',
    gap: spacing.xs,
  },
  versionCardTitle: {
    fontFamily: fonts.hero,
    fontSize: 24,
    color: colors.inkPrimary,
  },
  versionCardBody: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.inkSecondary,
    textAlign: 'center',
  },
  versionCardHint: {
    fontFamily: fonts.bodyItalic,
    fontStyle: 'italic',
    fontSize: 11,
    color: colors.inkSecondary,
    marginTop: spacing.sm,
    opacity: 0.6,
  },
});
