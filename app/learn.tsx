// Learn screen — Sprint 2 STORY-00010
// Paste Apple Podcasts URL or text → import → EpisodeCard
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, spacing, radii } from '@/constants/theme';
import { BubbleTag } from '@/components/BubbleTag';
import { ScreenHeader } from '@/components/ScreenHeader';
import { EpisodeCard } from '@/components/EpisodeCard';
import { importEpisode, ApiError, apiFetch } from '@/lib/api';
import type { EpisodeObject } from '@/lib/api';
import { detectUrlType, getAnonymousId } from '@/lib/urlDetector';

// Error code → human-readable message
const ERROR_MESSAGES: Record<string, string> = {
  SOURCE_NOT_SUPPORTED: '目前不支持这个来源。已支持：小宇宙、Apple Podcasts、直接粘贴文本。',
  YOUTUBE_MANUAL_ONLY: 'YouTube 链接目前需要粘贴文本。请复制视频描述或字幕过来。',
  INVALID_URL: '这个链接看起来不太对，检查一下？',
  SOURCE_UNREACHABLE: '网络似乎不稳定，稍后再试。',
  NETWORK_ERROR: '网络连接失败，请检查网络后重试。',
  RATE_LIMITED: '请求太频繁了，稍等一会儿再试。',
  LEGACY_ENDPOINT: '此入口已升级。请从首页粘贴小宇宙或 Apple Podcasts 链接。',
  TEXT_MODE_UNAVAILABLE: '纯文本模式暂未开放。请从首页粘贴小宇宙或 Apple Podcasts 链接开始学习。',
};

function getErrorMessage(code: string): string {
  return ERROR_MESSAGES[code] || '出了点问题，稍后再试。';
}

const URL_RE = /^https?:\/\//i;
const MIN_TEXT_LEN = 200;

export default function Learn() {
  const insets = useSafeAreaInsets();
  const { text: prefillText } = useLocalSearchParams<{ text?: string }>();
  const [input, setInput] = useState(prefillText || '');
  const [loading, setLoading] = useState(false);
  const [episode, setEpisode] = useState<EpisodeObject | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isUrl = URL_RE.test(input.trim());
  const isTextLong = !isUrl && input.length >= MIN_TEXT_LEN;
  const isTextShort = !isUrl && input.length > 0 && input.length < MIN_TEXT_LEN;

  async function handleStart() {
    const val = input.trim();
    if (!val) return;

    if (isTextShort) return; // guard: should be blocked by button disabled

    setLoading(true);
    setError(null);
    setEpisode(null);

    try {
      // Sprint 7: URL 走新的 import-url → 等待屏 → 学习包全链路
      if (isUrl) {
        const urlType = detectUrlType(val);
        if (urlType === 'xiaoyuzhou' || urlType === 'apple') {
          const anonymousId = await getAnonymousId();
          const { jobId } = await apiFetch<{ jobId: string; status: string }>(
            '/api/episodes/import-url',
            {
              method: 'POST',
              body: JSON.stringify({ url: val, goal: 'quick_understand', anonymousId }),
            },
          );
          router.push({ pathname: '/import/[jobId]', params: { jobId, url: val } });
          return;
        }
        // 其他 URL 类型（YouTube 等）走老路径给出友好错误
      }

      // text 分支保留老路径
      const body = isUrl
        ? { url: val, source: 'auto' as const }
        : { source: 'text' as const, text: val };

      const result = await importEpisode(body);
      setEpisode(result.episode);
    } catch (e) {
      if (e instanceof ApiError) {
        setError(getErrorMessage(e.code));
      } else {
        setError('出了点问题，稍后再试。');
      }
    } finally {
      setLoading(false);
    }
  }

  const canSubmit = !loading && (isUrl || isTextLong);

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Sprint 13 #10: 用 ScreenHeader 统一顶部风格（对齐 Snapshot/Episode/Library/Review 内页） */}
      <ScreenHeader title="Learn" subtitle="把一条播客链接变成一节课" />
      <ScrollView
        style={styles.root}
        contentContainerStyle={[
          styles.content,
          { paddingTop: spacing.md, paddingBottom: insets.bottom + spacing.xxxl },
        ]}
        keyboardShouldPersistTaps="handled"
        testID="learn-scroll"
      >
        {/* Input area */}
        <TextInput
          style={styles.textInput}
          multiline
          maxLength={5000}
          placeholder="粘贴小宇宙 / Apple Podcasts 链接，或直接粘贴一段文本"
          placeholderTextColor={colors.inkSecondary}
          value={input}
          onChangeText={setInput}
          editable={!loading}
          testID="learn-input"
          accessibilityLabel="粘贴输入框"
        />

        {/* Inline hint: text too short */}
        {isTextShort ? (
          <Text style={styles.hintText} testID="learn-hint-short">
            再多贴一些内容，至少 200 字（当前 {input.length} 字）
          </Text>
        ) : null}

        {/* CTA button */}
        <Pressable
          style={[styles.ctaButton, !canSubmit && styles.ctaDisabled]}
          onPress={handleStart}
          disabled={!canSubmit}
          accessibilityRole="button"
          accessibilityLabel="开始"
          testID="learn-cta"
        >
          {loading ? (
            <View style={styles.ctaRow}>
              <ActivityIndicator color={colors.paperCream} size="small" />
              <Text style={styles.ctaText}>正在抓取…</Text>
            </View>
          ) : (
            <Text style={[styles.ctaText, !canSubmit && styles.ctaTextDisabled]}>
              {canSubmit ? '开始' : '粘贴链接后开始'}
            </Text>
          )}
        </Pressable>

        {/* Error message */}
        {error ? (
          <Text style={styles.errorText} testID="learn-error">{error}</Text>
        ) : null}

        {/* EpisodeCard */}
        {episode ? (
          <EpisodeCard
            episode={episode}
            onDismiss={() => setEpisode(null)}
          />
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.paperMain,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    gap: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backBtn: {
    paddingVertical: spacing.sm,
    paddingRight: spacing.md,
    minHeight: 44,
    justifyContent: 'center',
  },
  backText: {
    fontFamily: fonts.ui,
    fontSize: 15,
    color: colors.inkPrimary,
  },
  heroTitle: {
    fontFamily: fonts.hero,
    fontSize: 52,
    lineHeight: 54,
    color: colors.brick,
    marginTop: spacing.sm,
  },
  subtitle: {
    fontFamily: fonts.bodyItalic,
    fontStyle: 'italic',
    fontSize: 15,
    color: colors.inkSecondary,
  },
  dividerWrap: {
    alignItems: 'center',
    marginVertical: spacing.sm,
  },
  textInput: {
    backgroundColor: colors.paperCream,
    borderRadius: radii.card,
    // Sprint 13 R3: borderWidth 1.5 → 1 收敛到 theme.borderWidth.thin
    borderWidth: 1,
    borderColor: colors.paperDark,
    padding: spacing.md,
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 22,
    color: colors.inkPrimary,
    minHeight: 120,
    textAlignVertical: 'top',
  },
  hintText: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.olive,
    marginTop: -spacing.sm,
  },
  ctaButton: {
    backgroundColor: colors.brick,
    borderRadius: radii.card,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  // Sprint 13 R5: disabled 用 kraft 底 + dashed border + 灰字，明确"需要先粘贴内容"
  ctaDisabled: {
    backgroundColor: colors.paperCream,
    borderWidth: 1,
    borderColor: colors.paperDark,
    borderStyle: 'dashed',
    opacity: 1,
  },
  ctaTextDisabled: {
    color: colors.inkSecondary,
  },
  ctaRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  ctaText: {
    fontFamily: fonts.hero,
    fontSize: 22,
    color: colors.paperCream,
    letterSpacing: 0.5,
  },
  errorText: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    color: colors.brick,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
  },
});
