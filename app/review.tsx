// Review screen — E-005 Review System (SRS 复习系统)
// Sprint 8 Loop 30 MVP：真实实现
//   - GET /api/review/queue 拿今日 due 卡片
//   - 一次一张 flashcard: 正面(title + 上下文) → 翻面(explanation) → 3 rating
//     记得(known) / 模糊(fuzzy) / 不记得(forgot) → POST /api/review/rate → 下一张
//   - PRD M5: "每张卡片的复习完成 ≤ 30 秒"
import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiFetch } from '@/lib/api';
import { colors, fonts, spacing, radii } from '@/constants/theme';
import { WovenDivider } from '@/components/WovenDivider';
import { BubbleTag } from '@/components/BubbleTag';
import { TornCheck } from '@/components/TornCheck';
import { K0Card } from '@/components/K0Card';
import { ReviewIll } from '@/components/illustrations/EntryIcons';
import { ScreenHeader } from '@/components/ScreenHeader';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { EmptyState } from '@/components/ui/EmptyState';
import { useReviewQueue } from '@/hooks/useReviewQueue';

type Rating = 'known' | 'fuzzy' | 'forgot';

export default function Review() {
  const insets = useSafeAreaInsets();
  // Phase 2.3: 服务端数据走 useReviewQueue (React Query)
  const { data, isLoading: loading, refetch } = useReviewQueue();
  const stats = data.stats;
  const upcoming = data.upcoming;
  const queue = data.queue;
  // UI 态仍由页面自己管
  const [currentIdx, setCurrentIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [doneCount, setDoneCount] = useState(0);
  // Sprint 13 R3: commitment 勾选中间态（点击后 400ms 内显示勾，然后移除）
  const [committingId, setCommittingId] = useState<number | null>(null);
  // Phase 2.3: 承诺完成的本地消失 overlay (动画用), 服务端真值由 refetch 拉
  const [dismissedActionIds, setDismissedActionIds] = useState<number[]>([]);
  const actions = data.actions.filter(a => !dismissedActionIds.includes(a.id));

  // Sprint 16 R21 (B2): 每次 focus 重取 queue/stats + 重置 UI 到第一张
  useFocusEffect(useCallback(() => {
    setCurrentIdx(0);
    setFlipped(false);
    setDismissedActionIds([]);
    refetch();
  }, [refetch]));

  const current = queue[currentIdx];

  const rate = async (rating: Rating) => {
    if (!current || submitting) return;
    setSubmitting(true);
    try {
      await apiFetch('/api/review/rate', {
        method: 'POST',
        body: JSON.stringify({
          packId: current.packId,
          cardIndex: current.cardIndex,
          rating,
        }),
      });
      setDoneCount(c => c + 1);
      // Phase 2.3: 不在评分后 refetch queue — 会缩短数组导致本地 currentIdx 错位/闪卡。
      // queue 在 focus 时已固定, 本地 index 顺序推进即可; stats/queue 下次 focus 时刷新 (服务器权威)。
    } catch {
      // 失败不改本地
    } finally {
      setSubmitting(false);
      // 下一张
      setFlipped(false);
      setCurrentIdx(i => i + 1);
    }
  };

  const finished = !loading && queue.length > 0 && currentIdx >= queue.length;
  const noneDue = !loading && queue.length === 0;

  return (
    <View style={styles.root}>
      {/* Sprint 13 R1: ScreenHeader 统一顶部 */}
      <ScreenHeader title="Review" subtitle="温故而知新" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingTop: spacing.md, paddingBottom: insets.bottom + spacing.xxxl }]}
      >
        {/* Sprint 14 R2 fix: 删掉 "N 张待复习" BubbleTag，下方 dashboard 3 个数字已足够 */}

        {/* Sprint 10 STORY-01004: 你的承诺（放在闪卡之前，永远显示） */}
        {actions.length > 0 && (
          <View style={styles.commitmentsBlock}>
            <Text style={styles.commitmentsTitle}>你的承诺</Text>
            <Text style={styles.commitmentsHint}>{actions.length} 条待完成</Text>
            {actions.slice(0, 5).map((a) => (
              <View key={a.id} style={styles.commitmentRow}>
                <Pressable
                  onPress={async () => {
                    if (committingId) return;
                    // Sprint 13 R3: 中间态勾选反馈（撕纸风勾）+ Phase 2.3 overlay 消失
                    setCommittingId(a.id);
                    setTimeout(() => {
                      setDismissedActionIds(prev => [...prev, a.id]);
                      setCommittingId(null);
                    }, 400);
                    try {
                      await apiFetch(`/api/review/actions/${a.id}`, {
                        method: 'PATCH',
                        body: JSON.stringify({ status: 'done' }),
                      });
                      // Phase 2.3: 服务器权威 — 完成后 refetch; 服务端已不返回该 action,
                      // 清掉这条 overlay id (避免无限累积 + id 复用误隐藏)
                      refetch();
                      setDismissedActionIds(prev => prev.filter(x => x !== a.id));
                    } catch {
                      // 回滚 overlay
                      setDismissedActionIds(prev => prev.filter(x => x !== a.id));
                      setCommittingId(null);
                    }
                  }}
                  accessibilityRole="checkbox"
                  accessibilityLabel="完成"
                  hitSlop={6}
                  style={{ marginTop: 2 }}
                >
                  <TornCheck size={20} checked={committingId === a.id} />
                </Pressable>
                <View style={{ flex: 1 }}>
                  <Text style={styles.commitmentTimeframe}>
                    {a.timeframe === 'today' ? '今天' : a.timeframe === 'week' ? '本周' : '长期'}
                  </Text>
                  <Text style={styles.commitmentText}>{a.action_text}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {loading ? (
          <LoadingBlock />
        ) : noneDue ? (
          <EmptyState
            illustration={<ReviewIll size={80} />}
            title="还没有要复习的卡片"
            text="去 Learn 学一集，收藏卡片就会出现在这里"
            hint={upcoming.length > 0 ? `接下来 7 天有 ${upcoming.length} 张排队` : undefined}
            ctaLabel="回首页"
            onCtaPress={() => router.replace('/')}
          />
        ) : finished ? (
          <EmptyState
            illustration={<ReviewIll size={80} />}
            title="今日复习完成"
            text={`共复习 ${doneCount} 张卡片`}
            ctaLabel="回首页"
            onCtaPress={() => router.replace('/')}
          />
        ) : current ? (
          <>
            {/* Sprint 13 #22: dashboard 顶部小卡显示统计 */}
            {stats ? (
              <View style={styles.dashboardRow}>
                <View style={styles.dashboardCard}>
                  <Text style={styles.dashboardNum}>{stats.dueToday || 0}</Text>
                  <Text style={styles.dashboardLabel}>今日待复习</Text>
                </View>
                <View style={styles.dashboardCard}>
                  <Text style={styles.dashboardNum}>{stats.dueThisWeek || 0}</Text>
                  <Text style={styles.dashboardLabel}>本周待复习</Text>
                </View>
                <View style={styles.dashboardCard}>
                  <Text style={styles.dashboardNum}>{stats.totalReviews || 0}</Text>
                  <Text style={styles.dashboardLabel}>已复习</Text>
                </View>
              </View>
            ) : null}

            {/* 进度 */}
            <View style={styles.progressRow}>
              <Text style={styles.progressText}>
                {currentIdx + 1} / {queue.length}
              </Text>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${((currentIdx + 1) / queue.length) * 100}%` }]} />
              </View>
            </View>

            {/* Sprint 15+ #K0Card: 用 D4 日夜翻面卡替换 KnowledgeCard；翻面后才显示 rating 按钮 */}
            <View style={styles.flashcard}>
              <K0Card
                card={{
                  quote: current.quote,
                  insight: current.insight || current.title,
                  context: current.context || current.explanation,
                  timestamp: current.sourceTimestamp,
                  type: current.type,
                  podcastName: current.podcastName,
                }}
                variant="review"
                flippable
                flipped={flipped}
                onFlip={(isBack) => setFlipped(isBack)}
                // Review queue 目前不返回 audioUrl —— 时间戳仅展示不可点播；
                // 后续 backend 补 audioUrl 后再接入 onTimestampPress
              />
              {current.reviewCount > 0 ? (
                <Text style={styles.reviewHistory}>已复习 {current.reviewCount} 次</Text>
              ) : (
                <Text style={styles.reviewHistory}>首次复习</Text>
              )}
            </View>

            {/* Rating 按钮 - 翻牌后显示 */}
            {flipped ? (
              <View style={styles.ratingRow}>
                <Pressable
                  style={[styles.ratingBtn, styles.forgotBtn]}
                  onPress={() => rate('forgot')}
                  disabled={submitting}
                >
                  <Text style={styles.ratingText}>不记得</Text>
                  <Text style={styles.ratingHint}>明天再来</Text>
                </Pressable>
                <Pressable
                  style={[styles.ratingBtn, styles.fuzzyBtn]}
                  onPress={() => rate('fuzzy')}
                  disabled={submitting}
                >
                  <Text style={styles.ratingText}>模糊</Text>
                  <Text style={styles.ratingHint}>3 天后</Text>
                </Pressable>
                <Pressable
                  style={[styles.ratingBtn, styles.knownBtn]}
                  onPress={() => rate('known')}
                  disabled={submitting}
                >
                  <Text style={[styles.ratingText, styles.knownText]}>记得</Text>
                  <Text style={[styles.ratingHint, styles.knownText]}>+ 间隔翻倍</Text>
                </Pressable>
              </View>
            ) : null}

            <Text style={styles.tipText}>
              一张卡 30 秒，不催不评分
            </Text>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paperMain },
  scroll: { flex: 1 },
  content: { paddingHorizontal: spacing.xl, gap: spacing.md },
  // Sprint 13 R2: header/backBtn/backText/heroTitle/subtitle/dividerWrap/headerTag/emptyIcon 死代码删除（ScreenHeader 已接管）
  // Sprint 13 R3: headerTagInline/headerTagText 死代码删除（改用 BubbleTag 组件）

  progressRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  // Sprint 13 #22: dashboard 顶部 3 小卡
  dashboardRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  dashboardCard: {
    flex: 1,
    padding: spacing.md,
    backgroundColor: colors.paperCream,
    borderRadius: radii.card,
    alignItems: 'center',
    gap: 4,
  },
  dashboardNum: {
    fontFamily: fonts.hero,
    fontSize: 28,
    lineHeight: 30,
    color: colors.brick,
  },
  dashboardLabel: {
    fontFamily: fonts.ui,
    fontSize: 11,
    color: colors.inkSecondary,
    letterSpacing: 0.3,
  },
  progressText: { fontFamily: fonts.ui, fontSize: 13, color: colors.inkSecondary, minWidth: 44 },
  progressBar: { flex: 1, height: 6, backgroundColor: colors.paperCream, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 6, backgroundColor: colors.brick, borderRadius: 3 },

  flashcard: {
    // Sprint 15+ K0Card: 简化容器，卡片自带 shadow/border
    gap: spacing.sm,
    minHeight: 260,
  },
  // Sprint 15+ K0Card: cardTypeBar/flashcardInner/flashcardMeta 死代码删除（K0Card 已接管全部）
  // Sprint 13 R2: flashcardTitle/Explanation/QuoteBox/QuoteMark/Quote/Ts/SectionLabel/BodyText/flipHint/flipBtn 死代码删除（KnowledgeCard 组件已接管全部展示）
  reviewHistory: { fontFamily: fonts.ui, fontSize: 10, color: colors.inkSecondary, opacity: 0.5, marginTop: spacing.md },

  ratingRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  ratingBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radii.card,
    borderWidth: 1,
    alignItems: 'center',
    gap: 2,
  },
  forgotBtn: { backgroundColor: colors.paperCream, borderColor: colors.paperDark },
  fuzzyBtn: { backgroundColor: colors.paperCream, borderColor: colors.yolk },
  knownBtn: { backgroundColor: colors.brick, borderColor: colors.brick },
  ratingText: { fontFamily: fonts.ui, fontSize: 15, color: colors.inkPrimary, fontWeight: '600' },
  ratingHint: { fontFamily: fonts.ui, fontSize: 10, color: colors.inkSecondary, opacity: 0.7 },
  knownText: { color: colors.paperCream },

  tipText: {
    fontFamily: fonts.bodyItalic,
    fontStyle: 'italic',
    fontSize: 11,
    color: colors.inkSecondary,
    textAlign: 'center',
    marginTop: spacing.md,
    opacity: 0.6,
  },
  // Sprint 10 STORY-01004: 承诺 section — Sprint 13 R4 去 border 对齐零 border 契约
  commitmentsBlock: {
    backgroundColor: colors.paperCream,
    borderRadius: radii.card,
    padding: spacing.md,
    gap: spacing.sm,
  },
  commitmentsTitle: { fontFamily: fonts.ui, fontSize: 15, color: colors.inkPrimary, fontWeight: '600' },
  commitmentsHint: { fontFamily: fonts.ui, fontSize: 11, color: colors.inkSecondary, letterSpacing: 0.3 },
  commitmentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginTop: spacing.xs },
  // Sprint 13 R4: commitmentCheckbox/Checked/Checkmark 死代码删除（改用 TornCheck 组件）
  commitmentTimeframe: { fontFamily: fonts.ui, fontSize: 10, color: colors.inkSecondary, letterSpacing: 0.3 },
  commitmentText: { fontFamily: fonts.body, fontSize: 13, color: colors.inkPrimary, lineHeight: 19 },
});
