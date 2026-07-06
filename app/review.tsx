// Review screen — E-005 Review System (SRS 复习系统)
// Sprint 8 Loop 30 MVP：真实实现
//   - GET /api/review/queue 拿今日 due 卡片
//   - 一次一张 flashcard: 正面(title + 上下文) → 翻面(explanation) → 3 rating
//     记得(known) / 模糊(fuzzy) / 不记得(forgot) → POST /api/review/rate → 下一张
//   - PRD M5: "每张卡片的复习完成 ≤ 30 秒"
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, Animated, Easing } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiGet, apiFetch } from '@/lib/api';
import { getAnonymousId } from '@/lib/urlDetector';
import { colors, fonts, spacing, radii } from '@/constants/theme';
import { WovenDivider } from '@/components/WovenDivider';

type ReviewCard = {
  userCardId: number | null;
  packId: number;
  cardIndex: number;
  title: string;
  explanation: string;
  type: string;
  sourceTimestamp: number;
  podcastName: string;
  episodeTitle: string;
  coverImageUrl: string | null;
  reviewState: string | null;
  reviewCount: number;
  reviewNextAt: string | null;
};

type Stats = { dueToday: number; dueThisWeek: number; totalReviews: number };
type Rating = 'known' | 'fuzzy' | 'forgot';

// Sprint 10 STORY-01004
type UserAction = {
  id: number;
  pack_id: number;
  action_index: number;
  action_text: string;
  timeframe: 'today' | 'week' | 'longterm';
};

const CARD_TYPE_COLORS: Record<string, string> = {
  opinion: colors.brick,
  method: colors.sapphire,
  case: colors.brown,
  reflection: colors.rose,
  action: colors.olive,
};

const CARD_TYPE_LABELS: Record<string, string> = {
  opinion: '观点',
  method: '方法',
  case: '案例',
  reflection: '洞察',
  action: '行动',
};

export default function Review() {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [queue, setQueue] = useState<ReviewCard[]>([]);
  const [upcoming, setUpcoming] = useState<ReviewCard[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [doneCount, setDoneCount] = useState(0);
  const [anonymousId, setAnonymousId] = useState<string | null>(null);
  // Sprint 10 STORY-01004: 用户承诺的 actions
  const [actions, setActions] = useState<UserAction[]>([]);
  const flipAnim = React.useRef(new Animated.Value(0)).current;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const aid = await getAnonymousId();
      setAnonymousId(aid);
      const q = `?anonymousId=${encodeURIComponent(aid)}`;
      const [statsRes, queueRes, actionsRes] = await Promise.all([
        apiGet<Stats>(`/api/review/stats${q}`),
        apiGet<{ due: ReviewCard[]; upcoming: ReviewCard[] }>(`/api/review/queue${q}`),
        apiGet<{ pending: UserAction[]; done: UserAction[] }>(`/api/review/actions${q}`).catch(() => ({ pending: [], done: [] })),
      ]);
      setStats(statsRes);
      setQueue(queueRes.due || []);
      setUpcoming(queueRes.upcoming || []);
      setActions(actionsRes.pending || []);
      setCurrentIdx(0);
      setFlipped(false);
    } catch {
      // stay empty
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const current = queue[currentIdx];

  const flipCard = () => {
    setFlipped(true);
    Animated.timing(flipAnim, { toValue: 1, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  };

  const rate = async (rating: Rating) => {
    if (!current || submitting || !anonymousId) return;
    setSubmitting(true);
    try {
      await apiFetch('/api/review/rate', {
        method: 'POST',
        body: JSON.stringify({
          anonymousId,
          packId: current.packId,
          cardIndex: current.cardIndex,
          rating,
        }),
      });
      setDoneCount(c => c + 1);
    } catch {
      // even on error, advance to prevent stuck
    } finally {
      setSubmitting(false);
      // 下一张
      flipAnim.setValue(0);
      setFlipped(false);
      setCurrentIdx(i => i + 1);
    }
  };

  const finished = !loading && queue.length > 0 && currentIdx >= queue.length;
  const noneDue = !loading && queue.length === 0;

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xxxl }]}
      >
        <View style={styles.header}>
          <Pressable
            onPress={() => router.canGoBack() ? router.back() : router.replace('/')}
            style={styles.backBtn}
            accessibilityRole="button"
          >
            <Text style={styles.backText}>‹ 首页</Text>
          </Pressable>
          <View style={styles.headerTag}>
            <Text style={styles.headerTagText}>
              {stats ? `${stats.dueToday} 张待复习` : '…'}
            </Text>
          </View>
        </View>

        <Text style={styles.heroTitle} accessibilityRole="header">Review</Text>
        <Text style={styles.subtitle}>不催、不评分，只是陪你走完</Text>

        <View style={styles.dividerWrap}>
          <WovenDivider width={280} height={10} />
        </View>

        {/* Sprint 10 STORY-01004: 你的承诺（放在闪卡之前，永远显示） */}
        {actions.length > 0 && (
          <View style={styles.commitmentsBlock}>
            <Text style={styles.commitmentsTitle}>你的承诺</Text>
            <Text style={styles.commitmentsHint}>{actions.length} 条待完成</Text>
            {actions.slice(0, 5).map((a) => (
              <View key={a.id} style={styles.commitmentRow}>
                <Pressable
                  style={styles.commitmentCheckbox}
                  onPress={async () => {
                    setActions(prev => prev.filter(x => x.id !== a.id));
                    try {
                      const aid = anonymousId || (await getAnonymousId());
                      await apiFetch(`/api/review/actions/${a.id}`, {
                        method: 'PATCH',
                        body: JSON.stringify({ anonymousId: aid, status: 'done' }),
                      });
                    } catch {
                      // 回滚
                      setActions(prev => [...prev, a]);
                    }
                  }}
                  accessibilityRole="checkbox"
                  accessibilityLabel="完成"
                  hitSlop={6}
                />
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
          <View style={styles.loadingBlock}>
            <ActivityIndicator color={colors.brick} />
          </View>
        ) : noneDue ? (
          <View style={styles.emptyBlock}>
            <Text style={styles.emptyIcon}>☕</Text>
            <Text style={styles.emptyTitle}>还没有要复习的卡片</Text>
            <Text style={styles.emptyText}>
              去 Learn 学一集，收藏卡片就会出现在这里
            </Text>
            {upcoming.length > 0 ? (
              <Text style={styles.upcomingHint}>接下来 7 天有 {upcoming.length} 张排队</Text>
            ) : null}
            <Pressable style={styles.goHomeBtn} onPress={() => router.replace('/')}>
              <Text style={styles.goHomeBtnText}>回首页</Text>
            </Pressable>
          </View>
        ) : finished ? (
          <View style={styles.emptyBlock}>
            <Text style={styles.emptyIcon}>🎉</Text>
            <Text style={styles.emptyTitle}>今日复习完成</Text>
            <Text style={styles.emptyText}>共复习 {doneCount} 张卡片</Text>
            <Pressable style={styles.goHomeBtn} onPress={() => router.replace('/')}>
              <Text style={styles.goHomeBtnText}>回首页</Text>
            </Pressable>
          </View>
        ) : current ? (
          <>
            {/* 进度 */}
            <View style={styles.progressRow}>
              <Text style={styles.progressText}>
                {currentIdx + 1} / {queue.length}
              </Text>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${((currentIdx + 1) / queue.length) * 100}%` }]} />
              </View>
            </View>

            {/* Flashcard */}
            <View style={styles.flashcard}>
              <View style={[styles.cardTypeBar, { backgroundColor: CARD_TYPE_COLORS[current.type] || colors.olive }]} />
              <View style={styles.flashcardInner}>
                <Text style={styles.flashcardMeta} numberOfLines={1}>
                  {current.podcastName} · {CARD_TYPE_LABELS[current.type] || current.type}
                </Text>
                <Text style={styles.flashcardTitle}>{current.title}</Text>
                {flipped ? (
                  <View style={{ gap: spacing.md }}>
                    {/* Sprint 11 v3: 一套完整理解 = core + usage + challenge，不只是 explanation */}
                    <Text style={styles.flashcardExplanation}>
                      {(current as any).core || current.explanation}
                    </Text>
                    {(current as any).usage ? (
                      <View>
                        <Text style={styles.flashcardSectionLabel}>用例</Text>
                        <Text style={styles.flashcardBodyText}>{(current as any).usage}</Text>
                      </View>
                    ) : null}
                    {(current as any).challenge ? (
                      <View>
                        <Text style={styles.flashcardSectionLabel}>反面视角</Text>
                        <Text style={styles.flashcardBodyText}>{(current as any).challenge}</Text>
                      </View>
                    ) : null}
                  </View>
                ) : (
                  <View style={styles.flipHint}>
                    <Text style={styles.flipHintText}>能想起这张卡的内容吗？</Text>
                    <Pressable style={styles.flipBtn} onPress={flipCard}>
                      <Text style={styles.flipBtnText}>翻到背面 →</Text>
                    </Pressable>
                  </View>
                )}
                {current.reviewCount > 0 ? (
                  <Text style={styles.reviewHistory}>已复习 {current.reviewCount} 次</Text>
                ) : (
                  <Text style={styles.reviewHistory}>首次复习</Text>
                )}
              </View>
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
              PRD M5: 每张卡片复习 ≤ 30 秒，不催、不评分
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
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  backBtn: { paddingVertical: spacing.sm, paddingRight: spacing.md, minHeight: 44, justifyContent: 'center' },
  backText: { fontFamily: fonts.ui, fontSize: 15, color: colors.inkPrimary },
  headerTag: {
    backgroundColor: colors.paperCream,
    borderRadius: radii.bubble,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  headerTagText: { fontFamily: fonts.ui, fontSize: 12, color: colors.brown, letterSpacing: 0.3 },

  heroTitle: { fontFamily: fonts.hero, fontSize: 44, lineHeight: 48, color: colors.inkPrimary, letterSpacing: -1 },
  subtitle: { fontFamily: fonts.bodyItalic, fontStyle: 'italic', fontSize: 15, color: colors.inkSecondary },
  dividerWrap: { alignItems: 'center', marginVertical: spacing.sm },

  loadingBlock: { paddingVertical: spacing.xxl, alignItems: 'center' },
  emptyBlock: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xxl },
  emptyIcon: { fontSize: 60 },
  emptyTitle: { fontFamily: fonts.hero, fontSize: 24, color: colors.inkPrimary },
  emptyText: { fontFamily: fonts.body, fontSize: 14, color: colors.inkSecondary, textAlign: 'center' },
  upcomingHint: { fontFamily: fonts.bodyItalic, fontStyle: 'italic', fontSize: 13, color: colors.inkSecondary },
  goHomeBtn: {
    marginTop: spacing.md,
    backgroundColor: colors.brick,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radii.card,
  },
  goHomeBtnText: { fontFamily: fonts.ui, fontSize: 15, color: colors.paperCream, fontWeight: '600' },

  progressRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  progressText: { fontFamily: fonts.ui, fontSize: 13, color: colors.inkSecondary, minWidth: 44 },
  progressBar: { flex: 1, height: 6, backgroundColor: colors.paperCream, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 6, backgroundColor: colors.brick, borderRadius: 3 },

  flashcard: {
    flexDirection: 'row',
    backgroundColor: colors.paperCream,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.paperDark,
    overflow: 'hidden',
    minHeight: 260,
  },
  cardTypeBar: { width: 6 },
  flashcardInner: { flex: 1, padding: spacing.lg, gap: spacing.sm },
  flashcardMeta: { fontFamily: fonts.ui, fontSize: 11, color: colors.inkSecondary, letterSpacing: 0.3, opacity: 0.7 },
  flashcardTitle: { fontFamily: fonts.hero, fontSize: 22, lineHeight: 30, color: colors.inkPrimary, marginTop: spacing.xs },
  flashcardExplanation: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 22,
    color: colors.inkPrimary,
    marginTop: spacing.md,
  },
  flashcardSectionLabel: {
    fontFamily: fonts.ui,
    fontSize: 11,
    color: colors.inkSecondary,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  flashcardBodyText: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 20,
    color: colors.inkPrimary,
  },
  flipHint: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, marginTop: spacing.lg },
  flipHintText: { fontFamily: fonts.bodyItalic, fontStyle: 'italic', fontSize: 14, color: colors.inkSecondary },
  flipBtn: {
    backgroundColor: colors.paperMain,
    borderWidth: 1,
    borderColor: colors.paperDark,
    borderRadius: radii.card,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  flipBtnText: { fontFamily: fonts.ui, fontSize: 15, color: colors.inkPrimary, fontWeight: '600' },
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
  // Sprint 10 STORY-01004: 承诺 section
  commitmentsBlock: {
    backgroundColor: colors.paperCream,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.paperDark,
    padding: spacing.md,
    gap: spacing.sm,
  },
  commitmentsTitle: { fontFamily: fonts.ui, fontSize: 15, color: colors.inkPrimary, fontWeight: '600' },
  commitmentsHint: { fontFamily: fonts.ui, fontSize: 11, color: colors.inkSecondary, letterSpacing: 0.3 },
  commitmentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginTop: spacing.xs },
  commitmentCheckbox: { width: 20, height: 20, borderRadius: 4, borderWidth: 1.5, borderColor: colors.inkSecondary, marginTop: 2 },
  commitmentTimeframe: { fontFamily: fonts.ui, fontSize: 10, color: colors.inkSecondary, letterSpacing: 0.3 },
  commitmentText: { fontFamily: fonts.body, fontSize: 13, color: colors.inkPrimary, lineHeight: 19 },
});
