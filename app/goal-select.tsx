// GoalSelect screen — Sprint 3 STORY-00030
// After episode import, user picks one of 5 learning goals before generation begins
import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Platform, ActivityIndicator, useWindowDimensions } from 'react-native';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { colors, fonts, spacing, radii } from '@/constants/theme';
import { BubbleTag } from '@/components/BubbleTag';
import { WovenDivider } from '@/components/WovenDivider';
import { apiFetch, ApiError } from '@/lib/api';
import { useResponsive } from '@/hooks/useResponsive';
import { ipadLayout } from '@/constants/ipadTheme';

export type GoalKey = 'quick_understand' | 'deep_learn' | 'find_actions' | 'critical_thinking' | 'for_work';

type GoalDef = {
  key: GoalKey;
  label: string;
  desc: string;
  accent: string;
};

// STORY-00102: 5 目标按钮反转顺序 —— 最常用/最快选项放底部拇指落点，
// 符合 iOS HIG "list bottom is thumb natural zone" 原则。
// Sprint 13 R3: 删除 emoji（撕纸风零 emoji），靠 accent color bar 区分 5 目标
const GOALS: GoalDef[] = [
  {
    key: 'for_work',
    label: '为工作/研究使用',
    desc: '聚焦应用场景，整合到实际工作',
    accent: colors.rose,
  },
  {
    key: 'critical_thinking',
    label: '批判性思考',
    desc: '质疑假设，识别论证漏洞',
    accent: colors.brown,
  },
  {
    key: 'find_actions',
    label: '找可执行方法',
    desc: '提炼可以立即行动的步骤',
    accent: colors.sapphire,
  },
  {
    key: 'deep_learn',
    label: '深度学习',
    desc: '逐步分析，彻底理解',
    accent: colors.brick,
  },
  {
    key: 'quick_understand',
    label: '快速了解',
    desc: '5 分钟掌握这集的核心',
    accent: colors.yolk,
  },
];

export default function GoalSelect() {
  const insets = useSafeAreaInsets();
  const { isWide } = useResponsive();
  const { width } = useWindowDimensions();
  const L = ipadLayout(width);
  const dividerW = isWide ? Math.min(L.contentWidth, 560) : 280;
  const { episodeId, episodeTitle } = useLocalSearchParams<{ episodeId: string; episodeTitle?: string }>();
  const [loading, setLoading] = useState(false);
  const [loadingGoal, setLoadingGoal] = useState<GoalKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  // BUG-00004 fix: reset local state whenever the screen regains focus.
  // Without this, navigating back from /episode leaves the previously-selected
  // goal in "loading" state, disabling all 5 goal buttons.
  useFocusEffect(
    useCallback(() => {
      setLoading(false);
      setLoadingGoal(null);
      setError(null);
    }, [])
  );

  const onSelectGoal = useCallback(async (goal: GoalKey) => {
    if (loading) return;
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }

    setLoading(true);
    setLoadingGoal(goal);
    setError(null);

    try {
      const res = await apiFetch<{ jobId: string; status: string }>(
        `/api/episodes/${episodeId}/generate`,
        { method: 'POST', body: JSON.stringify({ goal }) }
      );
      router.push({
        pathname: '/episode/[id]',
        params: { id: episodeId, goal, jobId: res.jobId },
      });
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : '生成失败，稍后重试';
      setError(msg);
      setLoading(false);
      setLoadingGoal(null);
    }
  }, [episodeId, loading]);

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xxxl },
        isWide && { maxWidth: 600, width: '100%', alignSelf: 'center' },
      ]}
      testID="goal-select-scroll"
    >
      {/* Header row — STORY-00102: 移除右上冗余"选个目标" pill（与 hero title 信息重复） */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.canGoBack() ? router.back() : router.replace('/')}
          accessibilityRole="button"
          accessibilityLabel="返回"
          style={styles.backBtn}
          testID="goal-back-btn"
        >
          <Text style={styles.backText}>‹ 返回</Text>
        </Pressable>
      </View>

      {/* Hero title */}
      <Text style={styles.heroTitle} accessibilityRole="header">今天{"\n"}怎么学？</Text>
      {episodeTitle ? (() => {
        // STORY-00102: preview 改为"你粘贴的内容 · 约 XX 字" + 前 20 字原文
        // episodeTitle 来自 Learn 页，格式："文本 · <前 20 字...>"
        const cleaned = episodeTitle.replace(/^文本\s*·\s*/, '').replace(/…$/, '');
        const wordCount = cleaned.length * 4; // rough estimate（未来 backend 返回精确 wordCount 时切换）
        return (
          <View style={styles.previewBlock}>
            <Text style={styles.previewMeta}>你粘贴的内容 · 约 {wordCount} 字</Text>
            <Text style={styles.previewText} numberOfLines={2}>{cleaned}…</Text>
          </View>
        );
      })() : null}

      <View style={styles.dividerWrap}>
        <WovenDivider width={dividerW} height={10} />
      </View>

      {/* Goal buttons */}
      <View style={styles.goalList} testID="goal-list">
        {GOALS.map((g) => {
          const isThisLoading = loadingGoal === g.key;
          return (
            <Pressable
              key={g.key}
              onPress={() => onSelectGoal(g.key)}
              accessibilityRole="button"
              accessibilityLabel={`${g.label}：${g.desc}`}
              testID={`goal-btn-${g.key}`}
              disabled={loading}
              style={({ pressed }) => [
                styles.goalBtn,
                (pressed || isThisLoading) && styles.goalBtnPressed,
                loading && !isThisLoading && styles.goalBtnDimmed,
              ]}
            >
              <View style={[styles.goalAccentBar, { backgroundColor: g.accent }]} />
              <View style={styles.goalBtnInner}>
                {isThisLoading ? (
                  <ActivityIndicator color={colors.brick} size="small" style={{ width: 8 }} />
                ) : null}
                <View style={styles.goalTextBlock}>
                  <Text style={styles.goalLabel}>{g.label}</Text>
                  <Text style={styles.goalDesc}>{g.desc}</Text>
                </View>
                <Text style={styles.goalArrow}>→</Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      {error ? (
        <Text style={styles.errorText} testID="goal-error">{error}</Text>
      ) : null}

      <Text style={styles.hint} testID="goal-hint">
        AI 会根据你的目标调整内容侧重
      </Text>
    </ScrollView>
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
    fontSize: 48,
    lineHeight: 50,
    color: colors.inkPrimary,
    marginTop: spacing.sm,
    letterSpacing: -1,
  },
  episodeHint: {
    fontFamily: fonts.bodyItalic,
    fontStyle: 'italic',
    fontSize: 14,
    lineHeight: 20,
    color: colors.inkSecondary,
    maxWidth: 300,
  },
  previewBlock: {
    backgroundColor: colors.paperCream,
    borderRadius: radii.card,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.paperDark,
  },
  previewMeta: {
    fontFamily: fonts.ui,
    fontSize: 12,
    color: colors.inkSecondary,
    letterSpacing: 0.3,
  },
  previewText: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    color: colors.inkPrimary,
  },
  dividerWrap: {
    alignItems: 'center',
    marginVertical: spacing.sm,
  },
  goalList: {
    gap: spacing.md,
  },
  goalBtn: {
    backgroundColor: colors.paperCream,
    borderRadius: radii.card,
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'stretch',
    overflow: 'hidden',
    // Sprint 13 R3: 去 border + 零 shadowOffset 对齐首页拼布风 UI_SPEC §chosen-style
  },
  goalBtnPressed: {
    opacity: 0.85,
    // Sprint 4 STORY-00105: 撕纸翻起感
    transform: [{ scale: 0.97 }, { rotate: '-0.4deg' }],
  },
  goalBtnDimmed: {
    opacity: 0.5,
  },
  goalAccentBar: {
    width: 6,
    borderTopLeftRadius: radii.card - 2,
    borderBottomLeftRadius: radii.card - 2,
  },
  goalBtnInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  // Sprint 13 R3: goalEmoji style 已删（撕纸风零 emoji）
  goalTextBlock: {
    flex: 1,
    gap: 2,
  },
  goalLabel: {
    fontFamily: fonts.ui,
    fontSize: 17,
    color: colors.inkPrimary,
  },
  goalDesc: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
    color: colors.inkSecondary,
  },
  goalArrow: {
    fontFamily: fonts.ui,
    fontSize: 20,
    color: colors.inkSecondary,
  },
  hint: {
    fontFamily: fonts.bodyItalic,
    fontStyle: 'italic',
    fontSize: 13,
    color: colors.inkSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  errorText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.brick,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
  },
});
