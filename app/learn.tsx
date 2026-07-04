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
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, spacing, radii } from '@/constants/theme';
import { BubbleTag } from '@/components/BubbleTag';
import { WovenDivider } from '@/components/WovenDivider';
import { EpisodeCard } from '@/components/EpisodeCard';
import { importEpisode, ApiError } from '@/lib/api';
import type { EpisodeObject } from '@/lib/api';

// Error code → human-readable message
const ERROR_MESSAGES: Record<string, string> = {
  SOURCE_NOT_SUPPORTED: '目前不支持这个来源。已支持：Apple Podcasts、直接粘贴文本。',
  YOUTUBE_MANUAL_ONLY: 'YouTube 链接目前需要粘贴文本。请复制视频描述或字幕过来。',
  INVALID_URL: '这个链接看起来不太对，检查一下？',
  SOURCE_UNREACHABLE: '网络似乎不稳定，稍后再试。',
  NETWORK_ERROR: '网络连接失败，请检查网络后重试。',
  RATE_LIMITED: '请求太频繁了，稍等一会儿再试。',
};

function getErrorMessage(code: string): string {
  return ERROR_MESSAGES[code] || '出了点问题，稍后再试。';
}

const URL_RE = /^https?:\/\//i;
const MIN_TEXT_LEN = 200;

export default function Learn() {
  const insets = useSafeAreaInsets();
  const [input, setInput] = useState('');
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
      <ScrollView
        style={styles.root}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xxxl },
        ]}
        keyboardShouldPersistTaps="handled"
        testID="learn-scroll"
      >
        {/* Header row */}
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="返回"
            style={styles.backBtn}
          >
            <Text style={styles.backText}>← 首页</Text>
          </Pressable>
          <BubbleTag dotColor={colors.brick} testID="learn-tag">今天可以开始一集</BubbleTag>
        </View>

        {/* Hero title */}
        <Text style={styles.heroTitle} accessibilityRole="header">Learn</Text>
        <Text style={styles.subtitle}>把一段音频变成一节课</Text>

        <View style={styles.dividerWrap}>
          <WovenDivider width={280} height={10} />
        </View>

        {/* Input area */}
        <TextInput
          style={styles.textInput}
          multiline
          maxLength={5000}
          placeholder="粘贴 Apple Podcasts 链接，或直接粘贴一段播客文本 / 转录"
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
              <ActivityIndicator color={colors.white} size="small" />
              <Text style={styles.ctaText}>正在抓取…</Text>
            </View>
          ) : (
            <Text style={styles.ctaText}>开始</Text>
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
    borderWidth: 1.5,
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
  ctaDisabled: {
    opacity: 0.45,
  },
  ctaRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  ctaText: {
    fontFamily: fonts.hero,
    fontSize: 22,
    color: colors.white,
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
