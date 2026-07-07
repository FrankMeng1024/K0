// Library screen — E-006 Knowledge Library
// Sprint 8 Loop 29 MVP：真实实现
//   - 两个 tab: Packs（学习包列表）+ Cards（跨集卡片列表）
//   - Packs 按 createdAt DESC，显示 cover + 播客名 + 集标题 + progress + oneSentence
//   - Cards 按 pack DESC + index ASC，按类型/收藏筛选
//   - 点击 pack 跳到 Episode 屏；点击 card 跳到对应 pack 的 Episode
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Image, ActivityIndicator, RefreshControl } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiGet } from '@/lib/api';
import { getAnonymousId } from '@/lib/urlDetector';
import { colors, fonts, spacing, radii } from '@/constants/theme';
import { WovenDivider } from '@/components/WovenDivider';

type LibraryPack = {
  packId: number;
  goal: string;
  language: string;
  createdAt: string;
  episodeId: number;
  episodeTitle: string;
  durationSeconds: number | null;
  coverImageUrl: string | null;
  podcastName: string;
  platform: string;
  oneSentence: string;
  cardsCount: number;
  stepsDoneCount: number;
};

type LibraryCard = {
  packId: number;
  cardIndex: number;
  type: string;
  title: string;
  explanation: string;
  sourceTimestamp: number;
  starred: boolean;
  episodeTitle: string;
  coverImageUrl: string | null;
  podcastName: string;
  goal: string;
  packCreatedAt: string;
};

type Stats = {
  packsCount: number;
  cardsCount: number;
  starredCount: number;
  stepsDoneCount: number;
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

type Tab = 'packs' | 'cards';
type CardFilter = 'all' | 'starred' | 'method' | 'opinion' | 'reflection';
// Sprint 11 v3: 外层 mode 筛选 (Library 4 tab)
type ModeFilter = 'all' | 'deep' | 'quick' | 'skip';

export default function Library() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('packs');
  const [cardFilter, setCardFilter] = useState<CardFilter>('all');
  const [modeFilter, setModeFilter] = useState<ModeFilter>('all');
  const [stats, setStats] = useState<Stats | null>(null);
  const [packs, setPacks] = useState<LibraryPack[]>([]);
  const [cards, setCards] = useState<LibraryCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const anonymousId = await getAnonymousId();
      const q = `?anonymousId=${encodeURIComponent(anonymousId)}`;
      const modeQ = modeFilter !== 'all' ? `&mode=${modeFilter}` : '';
      const [statsRes, packsRes, cardsRes] = await Promise.all([
        apiGet<Stats>(`/api/library/stats${q}`),
        apiGet<{ packs: LibraryPack[] }>(`/api/library/packs${q}${modeQ}`),
        apiGet<{ cards: LibraryCard[] }>(`/api/library/cards${q}`),
      ]);
      setStats(statsRes);
      setPacks(packsRes.packs || []);
      setCards(cardsRes.cards || []);
    } catch (e) {
      // ignore, stays empty
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [modeFilter]);

  useEffect(() => { load(); }, [load]);

  // Sprint 13 #10: 每次页面 focus 时 reload 学习包（学习包内勾选步骤后回来立即更新）
  useFocusEffect(useCallback(() => {
    load();
  }, [load]));

  const filteredCards = cards.filter(c => {
    if (cardFilter === 'all') return true;
    if (cardFilter === 'starred') return c.starred;
    return c.type === cardFilter;
  });

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xxxl }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brick} />}
        testID="library-scroll"
      >
        {/* Header */}
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
              {stats ? `${stats.packsCount} 集 · ${stats.cardsCount} 卡片` : '…'}
            </Text>
          </View>
        </View>

        <Text style={styles.heroTitle} accessibilityRole="header">Library</Text>
        <Text style={styles.subtitle}>你已经收集的知识</Text>

        <View style={styles.dividerWrap}>
          <WovenDivider width={280} height={10} />
        </View>

        {/* Tabs — 主切换 (Packs/Cards) 在上 */}
        <View style={styles.tabsRow}>
          <Pressable
            onPress={() => setTab('packs')}
            style={[styles.tab, tab === 'packs' && styles.tabActive]}
          >
            <Text style={[styles.tabText, tab === 'packs' && styles.tabTextActive]}>
              学习包 {stats ? `(${stats.packsCount})` : ''}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setTab('cards')}
            style={[styles.tab, tab === 'cards' && styles.tabActive]}
          >
            <Text style={[styles.tabText, tab === 'cards' && styles.tabTextActive]}>
              卡片 {stats ? `(${stats.cardsCount})` : ''}
            </Text>
          </Pressable>
        </View>

        {/* Sprint 13 #11: filter 统一放在 tab 下方（Packs mode filter + Cards category filter 都在 tab 下方） */}
        {tab === 'packs' ? (
          <View style={styles.modeTabsRow}>
            {(['all', 'deep', 'quick', 'skip'] as const).map(m => (
              <Pressable
                key={m}
                onPress={() => setModeFilter(m)}
                style={[styles.modeTab, modeFilter === m && styles.modeTabActive]}
              >
                <Text style={[styles.modeTabText, modeFilter === m && styles.modeTabTextActive]}>
                  {m === 'all' ? '全部' : m === 'deep' ? '精学' : m === 'quick' ? '速学' : '跳过'}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {loading ? (
          <View style={styles.loadingBlock}>
            <ActivityIndicator color={colors.brick} />
          </View>
        ) : null}

        {/* Packs tab */}
        {!loading && tab === 'packs' ? (
          packs.length === 0 ? (
            <View style={styles.emptyBlock}>
              <Text style={styles.emptyIcon}>📚</Text>
              <Text style={styles.emptyTitle}>还没有学习包</Text>
              <Text style={styles.emptyDesc}>回首页粘贴一条播客链接开始</Text>
              <Pressable style={styles.emptyBtn} onPress={() => router.replace('/')}>
                <Text style={styles.emptyBtnText}>回首页</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.packsList}>
              {packs.map(p => (
                <Pressable
                  key={p.packId}
                  onPress={() => router.push({ pathname: '/episode/[id]', params: { id: String(p.packId), goal: p.goal } })}
                  style={styles.packCard}
                >
                  {p.coverImageUrl ? (
                    <Image source={{ uri: p.coverImageUrl }} style={styles.packCover} accessibilityIgnoresInvertColors />
                  ) : (
                    <View style={[styles.packCover, styles.packCoverPlaceholder]}>
                      <Text style={styles.packCoverPlaceholderText}>🎧</Text>
                    </View>
                  )}
                  <View style={styles.packInfo}>
                    <Text style={styles.packPodcast} numberOfLines={1}>{p.podcastName}</Text>
                    <Text style={styles.packTitle} numberOfLines={2}>{p.episodeTitle}</Text>
                    {p.oneSentence ? (
                      <Text style={styles.packOneSentence} numberOfLines={2}>{p.oneSentence}</Text>
                    ) : null}
                    <View style={styles.packMeta}>
                      <Text style={styles.packMetaText}>{p.stepsDoneCount}/6 步骤</Text>
                      <Text style={styles.packMetaSep}>·</Text>
                      <Text style={styles.packMetaText}>{p.cardsCount} 卡片</Text>
                      <Text style={styles.packMetaSep}>·</Text>
                      {/* Sprint 13 #8: 优先用 user 选的 mode（deep/quick/skip）；无 mode 才 fallback 到 goal */}
                      <Text style={styles.packMetaText}>
                        {(p as any).mode === 'deep' ? '🎯 精学' :
                         (p as any).mode === 'quick' ? '⚡ 速学' :
                         (p as any).mode === 'skip' ? '⏩ 跳过' :
                         p.goal === 'quick_understand' ? '⚡ 快速' :
                         p.goal === 'deep_learn' ? '🎯 深度' :
                         p.goal === 'find_actions' ? '⚙ 行动' :
                         p.goal === 'critical_thinking' ? '🔍 批判' :
                         p.goal === 'for_work' ? '📎 工作' : p.goal}
                      </Text>
                    </View>
                  </View>
                </Pressable>
              ))}
            </View>
          )
        ) : null}

        {/* Cards tab */}
        {!loading && tab === 'cards' ? (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              {(['all', 'starred', 'method', 'opinion', 'reflection'] as CardFilter[]).map(f => (
                <Pressable
                  key={f}
                  onPress={() => setCardFilter(f)}
                  style={[styles.filterChip, cardFilter === f && styles.filterChipActive]}
                >
                  <Text style={[styles.filterChipText, cardFilter === f && styles.filterChipTextActive]}>
                    {f === 'all' ? '全部' : f === 'starred' ? '★ 已收藏' : CARD_TYPE_LABELS[f]}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            {filteredCards.length === 0 ? (
              <View style={styles.emptyBlock}>
                <Text style={styles.emptyIcon}>📇</Text>
                <Text style={styles.emptyTitle}>
                  {cardFilter === 'starred' ? '还没有收藏的卡片' : '还没有卡片'}
                </Text>
                <Text style={styles.emptyDesc}>
                  {cardFilter === 'starred' ? '在学习包里点 ★ 收藏卡片' : '学完一集会自动生成卡片'}
                </Text>
              </View>
            ) : (
              <View style={styles.cardsList}>
                {filteredCards.map((c, i) => (
                  <Pressable
                    key={`${c.packId}-${c.cardIndex}`}
                    onPress={() => router.push({ pathname: '/episode/[id]', params: { id: String(c.packId), goal: c.goal } })}
                    style={styles.libCard}
                  >
                    <View style={[styles.libCardBar, { backgroundColor: CARD_TYPE_COLORS[c.type] || colors.olive }]} />
                    <View style={styles.libCardInner}>
                      <View style={styles.libCardTitleRow}>
                        <Text style={styles.libCardTitle} numberOfLines={1}>{c.title}</Text>
                        {c.starred ? <Text style={styles.libCardStar}>★</Text> : null}
                      </View>
                      <Text style={styles.libCardExplanation} numberOfLines={3}>{c.explanation}</Text>
                      <View style={styles.libCardMeta}>
                        <Text style={styles.libCardMetaText}>{CARD_TYPE_LABELS[c.type] || c.type}</Text>
                        <Text style={styles.libCardMetaSep}>·</Text>
                        <Text style={styles.libCardMetaText} numberOfLines={1}>{c.podcastName}</Text>
                      </View>
                    </View>
                  </Pressable>
                ))}
              </View>
            )}
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

  tabsRow: { flexDirection: 'row', gap: spacing.sm },
  // Sprint 11 v3: 外层 mode 筛选
  modeTabsRow: { flexDirection: 'row', gap: 6, marginBottom: spacing.sm, flexWrap: 'wrap' },
  modeTab: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.paperDark,
    backgroundColor: colors.paperCream,
  },
  modeTabActive: {
    backgroundColor: colors.sapphire,
    borderColor: colors.sapphire,
  },
  modeTabText: { fontFamily: fonts.ui, fontSize: 12, color: colors.inkSecondary },
  modeTabTextActive: { color: colors.paperCream },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.paperDark,
    backgroundColor: colors.paperCream,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: colors.brick,
    borderColor: colors.brick,
  },
  tabText: { fontFamily: fonts.ui, fontSize: 14, color: colors.inkSecondary, fontWeight: '600' },
  tabTextActive: { color: colors.paperCream },

  loadingBlock: { paddingVertical: spacing.xxl, alignItems: 'center' },
  emptyText: {
    fontFamily: fonts.bodyItalic,
    fontStyle: 'italic',
    fontSize: 14,
    color: colors.inkSecondary,
    textAlign: 'center',
    paddingVertical: spacing.xxl,
  },
  // Sprint 10 v14: 空态美化，对齐 Review 空态风格
  emptyBlock: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
  emptyIcon: {
    fontSize: 56,
    marginBottom: spacing.md,
  },
  emptyTitle: {
    fontFamily: fonts.hero,
    fontSize: 22,
    color: colors.inkPrimary,
    textAlign: 'center',
  },
  emptyDesc: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.inkSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  emptyBtn: {
    backgroundColor: colors.brick,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.card,
    marginTop: spacing.md,
  },
  emptyBtnText: {
    fontFamily: fonts.ui,
    fontSize: 15,
    color: colors.paperCream,
  },

  packsList: { gap: spacing.md },
  packCard: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.paperCream,
    borderRadius: radii.card,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.paperDark,
  },
  packCover: {
    width: 64,
    height: 64,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.paperDark,
  },
  packCoverPlaceholder: {
    backgroundColor: colors.paperMain,
    alignItems: 'center',
    justifyContent: 'center',
  },
  packCoverPlaceholderText: { fontSize: 24 },
  packInfo: { flex: 1, gap: 2 },
  packPodcast: { fontFamily: fonts.ui, fontSize: 11, color: colors.inkSecondary, letterSpacing: 0.3 },
  packTitle: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.inkPrimary },
  packOneSentence: { fontFamily: fonts.bodyItalic, fontStyle: 'italic', fontSize: 12, lineHeight: 18, color: colors.inkSecondary, marginTop: 4 },
  packMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6, flexWrap: 'wrap' },
  packMetaText: { fontFamily: fonts.ui, fontSize: 11, color: colors.inkSecondary },
  packMetaSep: { fontFamily: fonts.ui, fontSize: 11, color: colors.paperDark },

  filterRow: { flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.xs },
  filterChip: {
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: radii.bubble,
    backgroundColor: colors.paperCream,
    borderWidth: 1,
    borderColor: colors.paperDark,
  },
  filterChipActive: { backgroundColor: colors.yolk, borderColor: colors.yolk },
  filterChipText: { fontFamily: fonts.ui, fontSize: 12, color: colors.inkSecondary },
  filterChipTextActive: { color: colors.brown, fontWeight: '600' },

  cardsList: { gap: spacing.md },
  libCard: {
    flexDirection: 'row',
    backgroundColor: colors.paperCream,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.paperDark,
    overflow: 'hidden',
  },
  libCardBar: { width: 5 },
  libCardInner: { flex: 1, padding: spacing.md },
  libCardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 4 },
  libCardTitle: { flex: 1, fontFamily: fonts.ui, fontSize: 14, color: colors.inkPrimary, fontWeight: '600' },
  libCardStar: { fontSize: 16, color: colors.yolk },
  libCardExplanation: { fontFamily: fonts.body, fontSize: 12, lineHeight: 18, color: colors.inkPrimary },
  libCardMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  libCardMetaText: { fontFamily: fonts.ui, fontSize: 10, color: colors.inkSecondary, opacity: 0.7, flexShrink: 1 },
  libCardMetaSep: { fontFamily: fonts.ui, fontSize: 10, color: colors.paperDark },
});
