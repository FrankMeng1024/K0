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
import { apiGet, apiFetch } from '@/lib/api';
import { colors, fonts, spacing, radii } from '@/constants/theme';
import { WovenDivider } from '@/components/WovenDivider';
import { BubbleTag } from '@/components/BubbleTag';
import { SwipeablePackCard } from '@/components/SwipeablePackCard';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { LibraryIll, ReviewIll } from '@/components/illustrations/EntryIcons';
import { ScreenHeader } from '@/components/ScreenHeader';

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
  // Sprint 13 R2: mode 字段进入契约，避免 (p as any).mode 兜底 (Sprint 11 v3 CR-018)
  mode?: 'deep' | 'quick' | 'skip' | null;
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
  // Sprint 14 R2: 删除 pack 确认弹窗
  const [deletePackId, setDeletePackId] = useState<number | null>(null);
  const [modeFilter, setModeFilter] = useState<ModeFilter>('all');
  const [stats, setStats] = useState<Stats | null>(null);
  const [packs, setPacks] = useState<LibraryPack[]>([]);
  const [cards, setCards] = useState<LibraryCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const q = ``;
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
  // Sprint 16 R22 (Bug1): focus 时把 modeFilter 重置回 'all'，避免 Frank 场景
  //   "Library 处于 skip tab → 去 Learn 粘贴新 URL 生成 quick pack → 回 Library
  //    发现学习包列表空"（新 quick pack 不在 skip tab 里 → 视觉是空的）
  useFocusEffect(useCallback(() => {
    setModeFilter('all');
    setCardFilter('all');
  }, []));

  const filteredCards = cards.filter(c => {
    if (cardFilter === 'all') return true;
    if (cardFilter === 'starred') return c.starred;
    return c.type === cardFilter;
  });

  return (
    <View style={styles.root}>
      {/* Sprint 13 R1: 用 ScreenHeader 统一（首页同款 WovenDivider） */}
      <ScreenHeader title="Library" subtitle="你已经收集的知识" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingTop: spacing.md, paddingBottom: insets.bottom + spacing.xxxl }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brick} />}
        testID="library-scroll"
      >
        {/* Sprint 14 R2: Frank 反馈 "N 集 · N 卡片" 徽标没意义，去掉 */}

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

        {/* Sprint 13 R6 #4: 空态也保留 modeTabsRow，与 cards tab 的 filter 保持一致 */}
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
              <View style={{ marginBottom: spacing.md }}>
                <LibraryIll size={80} />
              </View>
              <Text style={styles.emptyTitle}>还没有学习包</Text>
              <Text style={styles.emptyDesc}>粘贴一条播客链接开始</Text>
              <Pressable style={styles.emptyBtn} onPress={() => router.replace('/learn')}>
                <Text style={styles.emptyBtnText}>去 Learn 粘贴</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.packsList}>
              {packs.map(p => (
                <SwipeablePackCard
                  key={p.packId}
                  packId={p.packId}
                  podcastName={p.podcastName}
                  episodeTitle={p.episodeTitle}
                  oneSentence={p.oneSentence}
                  coverImageUrl={p.coverImageUrl}
                  stepsDoneCount={p.stepsDoneCount}
                  cardsCount={p.cardsCount}
                  mode={p.mode ?? null}
                  goal={p.goal}
                  todayTotal={(p as any).todayTotal}
                  todayDone={(p as any).todayDone}
                  onPress={() => {
                    // Sprint 16 R3-4: mode=skip/null 跳 snapshot 页（可升级）
                    // mode=quick/deep 跳 episode 学习包页
                    if (!p.mode || p.mode === 'skip') {
                      router.push({
                        pathname: '/snapshot/[packId]',
                        params: { packId: String(p.packId) },
                      });
                    } else {
                      router.push({
                        pathname: '/episode/[id]',
                        params: { id: String(p.packId), goal: p.goal, mode: p.mode, direct: '1', packId: String(p.packId) },
                      });
                    }
                  }}
                  onDelete={() => setDeletePackId(p.packId)}
                />
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
                <View style={{ marginBottom: spacing.md }}>
                  <LibraryIll size={72} />
                </View>
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
                    onPress={() => router.push({
                      // Sprint 15+ K0Card: 点击跳单卡详情页展示日夜翻面卡
                      pathname: '/card/[key]',
                      params: {
                        key: `${c.packId}-${c.cardIndex}`,
                        packId: String(c.packId),
                        cardIdx: String(c.cardIndex),
                      },
                    })}
                    style={styles.libCard}
                  >
                    <View style={[styles.libCardBar, { backgroundColor: CARD_TYPE_COLORS[c.type] || colors.olive }]} />
                    <View style={styles.libCardInner}>
                      <View style={styles.libCardTitleRow}>
                        <Text style={styles.libCardTitle} numberOfLines={1}>
                          {/* Sprint 16 R5: v4+ 用 insight 作主标题，兜底 title */}
                          {(c as any).insight || c.title || '未命名卡片'}
                        </Text>
                        {c.starred ? <Text style={styles.libCardStar}>★</Text> : null}
                      </View>
                      <Text style={styles.libCardExplanation} numberOfLines={3}>
                        {/* Sprint 16 R5: v4+ 用 quote 作正文，兜底 explanation/context */}
                        {(c as any).quote || c.explanation || (c as any).context || ''}
                      </Text>
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
      {/* Sprint 14 R2: 删除 pack 撕纸风确认弹窗 */}
      <ConfirmDialog
        visible={deletePackId !== null}
        title="删除这个学习包？"
        message="卡片、步骤进度、承诺都会一起消失"
        confirmLabel="删除"
        cancelLabel="取消"
        destructive
        onCancel={() => setDeletePackId(null)}
        onConfirm={async () => {
          const id = deletePackId;
          if (!id) return;
          setDeletePackId(null);
          // 乐观更新
          setPacks(prev => prev.filter(p => p.packId !== id));
          try {
            await apiFetch(`/api/library/packs/${id}`, {
              method: 'DELETE',
            });
          } catch {
            // 失败重新 load
            load();
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paperMain },
  scroll: { flex: 1 },
  content: { paddingHorizontal: spacing.xl, gap: spacing.md },
  // Sprint 13 R2: header/backBtn/backText/heroTitle/subtitle/dividerWrap/headerTag/emptyIcon 死代码删除（ScreenHeader 已接管）
  // Sprint 13 R3: headerTagInline/headerTagText 死代码删除（改用 BubbleTag 组件）

  // Sprint 13 R2: heroTitle/subtitle/dividerWrap 已删（ScreenHeader 已接管）

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
    // Sprint 13 R6 #3: 蓝 → brick 红对齐 tabActive
    backgroundColor: colors.brick,
    borderColor: colors.brick,
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
    // Sprint 13 R6 #3: Frank 反馈蓝色不好看，改回 brick 红（与页内 CTA 统一）
    // 首页 Library 蓝卡作为入口视觉保留，内页 accent 收敛到 brick
    backgroundColor: colors.brick,
    borderColor: colors.brick,
  },
  tabText: { fontFamily: fonts.ui, fontSize: 14, color: colors.inkSecondary, fontWeight: '600' },
  tabTextActive: { color: colors.paperCream },

  loadingBlock: { paddingVertical: spacing.xxl, alignItems: 'center' },
  // Sprint 13 R2: emptyText/emptyIcon 死代码删除（SVG 已接管）
  // Sprint 10 v14: 空态美化，对齐 Review 空态风格
  emptyBlock: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
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
    // Sprint 13 R1: 去 border 对齐首页 entryCard 零 border
  },
  packCover: {
    width: 64,
    height: 64,
    borderRadius: radii.card,
  },
  packCoverPlaceholder: {
    backgroundColor: colors.paperMain,
    alignItems: 'center',
    justifyContent: 'center',
  },
  packCoverPlaceholderText: {
    fontFamily: fonts.hero,
    fontSize: 28,
    color: colors.brick,
  },
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
  // Sprint 13 R6 #3: filterChip 激活也统一 brick
  filterChipActive: { backgroundColor: colors.brick, borderColor: colors.brick },
  filterChipText: { fontFamily: fonts.ui, fontSize: 12, color: colors.inkSecondary },
  filterChipTextActive: { color: colors.paperCream, fontWeight: '600' },

  cardsList: { gap: spacing.md },
  libCard: {
    flexDirection: 'row',
    backgroundColor: colors.paperCream,
    borderRadius: radii.card,
    // Sprint 13 R1: 去 border 对齐首页
    overflow: 'hidden',
  },
  libCardBar: { width: 4 }, // Sprint 13 R1: 5→4 匹配 UI_SPEC §差异化视觉记忆点
  libCardInner: { flex: 1, padding: spacing.md },
  libCardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 4 },
  libCardTitle: { flex: 1, fontFamily: fonts.ui, fontSize: 14, color: colors.inkPrimary, fontWeight: '600' },
  libCardStar: { fontSize: 16, color: colors.yolk },
  libCardExplanation: { fontFamily: fonts.body, fontSize: 12, lineHeight: 18, color: colors.inkPrimary },
  libCardMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  libCardMetaText: { fontFamily: fonts.ui, fontSize: 10, color: colors.inkSecondary, opacity: 0.7, flexShrink: 1 },
  libCardMetaSep: { fontFamily: fonts.ui, fontSize: 10, color: colors.paperDark },
});
