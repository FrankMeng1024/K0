// GoalSelect screen — Sprint 3 STORY-00030
// After episode import, user picks one of 5 learning goals before generation begins
import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { colors, fonts, spacing, radii } from '@/constants/theme';
import { BubbleTag } from '@/components/BubbleTag';
import { WovenDivider } from '@/components/WovenDivider';
import { apiFetch, ApiError } from '@/lib/api';

export type GoalKey = 'quick_understand' | 'deep_learn' | 'find_actions' | 'critical_thinking' | 'for_work';

type GoalDef = {
  key: GoalKey;
  emoji: string;
  label: string;
  desc: string;
  accent: string;
};

const GOALS: GoalDef[] = [
  {
    key: 'quick_understand',
    emoji: '⚡',
    label: '快速了解',
    desc: '5 分钟掌握这集的核心',
    accent: colors.yolk,
  },
  {
    key: 'deep_learn',
    emoji: '🎯',
    label: '深度学习',
    desc: '逐步分析，彻底理解',
    accent: colors.brick,
  },
  {
    key: 'find_actions',
    emoji: '⚙',
    label: '找可执行方法',
    desc: '提炼可以立即行动的步骤',
    accent: colors.sapphire,
  },
  {
    key: 'critical_thinking',
    emoji: '🔍',
    label: '批判性思考',
    desc: '质疑假设，识别论证漏洞',
    accent: colors.brown,
  },
  {
    key: 'for_work',
    emoji: '📎',
    label: '为工作/研究使用',
    desc: '聚焦应用场景，整合到实际工作',
    accent: colors.rose,
  },
];

export default function GoalSelect() {
  const insets = useSafeAreaInsets();
  const { episodeId, episodeTitle } = useLocalSearchParams<{ episodeId: string; episodeTitle?: string }>();
  const [loading, setLoading] = useState(false);
  const [loadingGoal, setLoadingGoal] = useState<GoalKey | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      ]}
      testID="goal-select-scroll"
    >
      {/* Header row */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.canGoBack() ? router.back() : router.replace('/')}
          accessibilityRole="button"
          accessibilityLabel="返回"
          style={styles.backBtn}
          testID="goal-back-btn"
        >
          <Text style={styles.backText}>← 返回</Text>
        </Pressable>
        <BubbleTag testID="goal-tag">选个目标</BubbleTag>
      </View>

      {/* Hero title */}
      <Text style={styles.heroTitle} accessibilityRole="header">今天{"\n"}怎么学？</Text>
      {episodeTitle ? (
        <Text style={styles.episodeHint} numberOfLines={2}>「{episodeTitle}」</Text>
      ) : null}

      <View style={styles.dividerWrap}>
        <WovenDivider width={280} height={10} />
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
                  <ActivityIndicator color={colors.brick} size="small" style={{ width: 32 }} />
                ) : (
                  <Text style={styles.goalEmoji}>{g.emoji}</Text>
                )}
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
    borderWidth: 1.5,
    borderColor: colors.paperDark,
    shadowColor: colors.inkPrimary,
    shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 0,
    elevation: 2,
  },
  goalBtnPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
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
  goalEmoji: {
    fontSize: 24,
    lineHeight: 28,
    width: 32,
    textAlign: 'center',
  },
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
