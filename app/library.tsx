// Library screen — E-006 Knowledge Library
// Sprint 8 Loop 29 MVP：真实实现
//   - 两个 tab: Packs（学习包列表）+ Cards（跨集卡片列表）
//   - Packs 按 createdAt DESC，显示 cover + 播客名 + 集标题 + progress + oneSentence
//   - Cards 按 pack DESC + index ASC，按类型/收藏筛选
//   - 点击 pack 跳到 Episode 屏；点击 card 跳到对应 pack 的 Episode
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Image, RefreshControl } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiFetch } from '@/lib/api';
import { colors, fonts, spacing, radii } from '@/constants/theme';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { EmptyState } from '@/components/ui/EmptyState';
import { PreviewListRow } from '@/components/ui/PreviewListRow';
import { WovenDivider } from '@/components/WovenDivider';
import { BubbleTag } from '@/components/BubbleTag';
import { SwipeablePackCard } from '@/components/SwipeablePackCard';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { LibraryIll, ReviewIll } from '@/components/illustrations/EntryIcons';
import { ScreenHeader } from '@/components/ScreenHeader';
import { ScreenHeaderPad } from '@/components/ScreenHeaderPad';
import { ipad } from '@/constants/ipadTheme';
import { useLibrary, type LibraryPack, type LibraryCard, type LibraryStats } from '@/hooks/useLibrary';
import { queryClient } from '@/lib/queryClient';
import { useResponsive } from '@/hooks/useResponsive';


type Tab = 'packs' | 'cards';
// Bug7 (Sprint16 R23): v4 卡片模型无 type 字段 (pack_cards 表无 card_type 列),
//   方法/观点/洞察 filter 恒无匹配 = 死 filter, 按 Frank "没用就删" 移除。
//   仅保留 全部 / ★已收藏 (starred 是真实字段)。
type CardFilter = 'all' | 'starred';
// Sprint 11 v3: 外层 mode 筛选 (Library 4 tab)
type ModeFilter = 'all' | 'deep' | 'quick' | 'skip';

export default function Library() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('packs');
  const [cardFilter, setCardFilter] = useState<CardFilter>('all');
  // Sprint 14 R2: 删除 pack 确认弹窗
  const [deletePackId, setDeletePackId] = useState<number | null>(null);
  const [modeFilter, setModeFilter] = useState<ModeFilter>('all');
  const [refreshing, setRefreshing] = useState(false);

  // Phase E: 数据层收敛到 useLibrary hook (React Query drop-in ready)
  const { data, isLoading: loading, refetch } = useLibrary(modeFilter);
  const stats = data.stats;
  const packs = data.packs;
  const cards = data.cards;

  // Sprint 13 #10: 每次页面 focus 时把 filter 重置回 'all'（学习包内勾选步骤后回来立即更新）
  // Sprint 16 R22 (Bug1): focus 时把 modeFilter 重置回 'all'，避免 Frank 场景
  //   "Library 处于 skip tab → 去 Learn 粘贴新 URL 生成 quick pack → 回 Library
  //    发现学习包列表空"（新 quick pack 不在 skip tab 里 → 视觉是空的）
  useFocusEffect(useCallback(() => {
    setModeFilter('all');
    setCardFilter('all');
    refetch();
  }, [refetch]));

  const filteredCards = cards.filter(c => {
    if (cardFilter === 'all') return true;
    if (cardFilter === 'starred') return c.starred;
    return true;
  });

  const { isWide } = useResponsive();

  // R55: 手机竖屏 与 iPad 横屏 = 两套完全独立的渲染组件, 零共享 JSX → 互不干扰。
  //   数据/状态/handler 在这里算好, 通过 props 传给各自组件。改哪端都不可能影响另一端。
  const shared: LibraryViewProps = {
    insets, tab, setTab, cardFilter, setCardFilter, modeFilter, setModeFilter,
    refreshing, setRefreshing, loading, refetch, stats, packs, filteredCards,
    deletePackId, setDeletePackId,
  };

  return (
    <>
      {isWide ? <LibraryWide {...shared} /> : <LibraryPhone {...shared} />}
      {/* 删除确认弹窗(两端共用, 自带 maxWidth 居中, 不受布局影响) */}
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
          try {
            await apiFetch(`/api/library/packs/${id}`, { method: 'DELETE' });
          } finally {
            refetch();
            queryClient.invalidateQueries({ queryKey: ['review'] });
          }
        }}
      />
    </>
  );
}

// 两端共享的数据/状态 props
interface LibraryViewProps {
  insets: ReturnType<typeof useSafeAreaInsets>;
  tab: Tab; setTab: (t: Tab) => void;
  cardFilter: CardFilter; setCardFilter: (f: CardFilter) => void;
  modeFilter: ModeFilter; setModeFilter: (m: ModeFilter) => void;
  refreshing: boolean; setRefreshing: (b: boolean) => void;
  loading: boolean; refetch: () => void;
  stats: LibraryStats | null | undefined;
  packs: LibraryPack[];
  filteredCards: LibraryCard[];
  deletePackId: number | null; setDeletePackId: (id: number | null) => void;
}

// pack 卡点击跳转(两端共用)
function openPack(p: LibraryPack) {
  if (!p.mode || p.mode === 'skip') {
    router.push({ pathname: '/snapshot/[packId]', params: { packId: String(p.packId), direct: '1' } });
  } else {
    router.push({ pathname: '/episode/[id]', params: { id: String(p.packId), goal: p.goal, mode: p.mode, direct: '1', packId: String(p.packId) } });
  }
}

// ═══════════ 手机竖屏 (原始布局, 一字未改 → 保证零回归) ═══════════
function LibraryPhone({ insets, tab, setTab, cardFilter, setCardFilter, modeFilter, setModeFilter, refreshing, setRefreshing, loading, refetch, stats, packs, filteredCards, setDeletePackId }: LibraryViewProps) {
  return (
    <View style={styles.root}>
      <ScreenHeader title="Library" subtitle="你已经收集的知识" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingTop: spacing.md, paddingBottom: insets.bottom + spacing.xxxl }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); refetch(); setTimeout(() => setRefreshing(false), 600); }} tintColor={colors.brick} />}
        testID="library-scroll"
      >
        <Pressable style={styles.kmapEntry} onPress={() => router.push('/knowledge-map')} testID="entry-knowledge-map">
          <View style={{ flex: 1 }}>
            <Text style={styles.kmapTitle}>知识图谱</Text>
            <Text style={styles.kmapSub}>看你学过的每一集如何连成一张网</Text>
          </View>
          <Text style={styles.kmapArrow}>→</Text>
        </Pressable>

        <View style={styles.tabsRow}>
          <Pressable onPress={() => setTab('packs')} style={[styles.tab, tab === 'packs' && styles.tabActive]}>
            <Text style={[styles.tabText, tab === 'packs' && styles.tabTextActive]}>学习包 {stats ? `(${stats.packsCount})` : ''}</Text>
          </Pressable>
          <Pressable onPress={() => setTab('cards')} style={[styles.tab, tab === 'cards' && styles.tabActive]}>
            <Text style={[styles.tabText, tab === 'cards' && styles.tabTextActive]}>卡片 {stats ? `(${stats.cardsCount})` : ''}</Text>
          </Pressable>
        </View>

        {tab === 'packs' ? (
          <View style={styles.modeTabsRow}>
            {(['all', 'deep', 'quick', 'skip'] as const).map(m => (
              <Pressable key={m} onPress={() => setModeFilter(m)} style={[styles.modeTab, modeFilter === m && styles.modeTabActive]}>
                <Text style={[styles.modeTabText, modeFilter === m && styles.modeTabTextActive]}>{m === 'all' ? '全部' : m === 'deep' ? '精学' : m === 'quick' ? '速学' : '跳过'}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {loading ? <LoadingBlock /> : null}

        {!loading && tab === 'packs' ? (
          packs.length === 0 ? (
            <EmptyState illustration={<LibraryIll size={80} />} title="还没有学习包" text="粘贴一条播客链接开始" ctaLabel="去 Learn 粘贴" onCtaPress={() => router.replace('/learn')} />
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
                  onPress={() => openPack(p)}
                  onDelete={() => setDeletePackId(p.packId)}
                />
              ))}
            </View>
          )
        ) : null}

        {!loading && tab === 'cards' ? (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              {(['all', 'starred'] as CardFilter[]).map(f => (
                <Pressable key={f} onPress={() => setCardFilter(f)} style={[styles.filterChip, cardFilter === f && styles.filterChipActive]}>
                  <Text style={[styles.filterChipText, cardFilter === f && styles.filterChipTextActive]}>{f === 'all' ? '全部' : '★ 已收藏'}</Text>
                </Pressable>
              ))}
            </ScrollView>
            {filteredCards.length === 0 ? (
              <EmptyState illustration={<LibraryIll size={80} />} title={cardFilter === 'starred' ? '还没有收藏的卡片' : '还没有卡片'} text={cardFilter === 'starred' ? '在学习包里点 ★ 收藏卡片' : '学完一集会自动生成卡片'} />
            ) : (
              <View style={styles.cardsList}>
                {filteredCards.map((c) => (
                  <PreviewListRow
                    key={`${c.packId}-${c.cardIndex}`}
                    accentColor={colors.olive}
                    accessibilityLabel={`卡片 ${(c as any).insight || c.title || ''}`}
                    onPress={() => router.push({ pathname: '/card/[key]', params: { key: `${c.packId}-${c.cardIndex}`, packId: String(c.packId), cardIdx: String(c.cardIndex) } })}
                  >
                    <View style={styles.libCardInner}>
                      <View style={styles.libCardTitleRow}>
                        <Text style={styles.libCardTitle} numberOfLines={1}>{(c as any).insight || c.title || '未命名卡片'}</Text>
                        {c.starred ? <Text style={styles.libCardStar}>★</Text> : null}
                      </View>
                      <Text style={styles.libCardExplanation} numberOfLines={3}>{(c as any).quote || c.explanation || (c as any).context || ''}</Text>
                      <View style={styles.libCardMeta}>
                        <Text style={styles.libCardMetaText} numberOfLines={1}>{c.podcastName}</Text>
                      </View>
                    </View>
                  </PreviewListRow>
                ))}
              </View>
            )}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

// ═══════════ iPad 横屏 (方案A: 左 filter 栏 + 右多列网格, 完全独立) ═══════════
function LibraryWide({ insets, tab, setTab, cardFilter, setCardFilter, modeFilter, setModeFilter, refreshing, setRefreshing, loading, refetch, stats, packs, filteredCards, setDeletePackId }: LibraryViewProps) {
  return (
    <View style={styles.root}>
      <ScreenHeaderPad title="Library" subtitle="你已经收集的知识" />
      <View style={wide.bodyRow}>
        {/* 左固定 filter 栏 */}
        <View style={[wide.rail, { paddingBottom: insets.bottom + spacing.lg }]}>
          <Pressable style={wide.kmapEntry} onPress={() => router.push('/knowledge-map')} testID="entry-knowledge-map">
            <Text style={styles.kmapTitle}>知识图谱</Text>
            <Text style={styles.kmapSub}>看每一集如何连成一张网</Text>
          </Pressable>
          <Text style={wide.kicker}>类型</Text>
          <Pressable onPress={() => setTab('packs')} style={[wide.railTab, tab === 'packs' && wide.railTabActive]}>
            <Text style={[wide.railTabText, tab === 'packs' && wide.railTabTextActive]}>学习包 {stats ? `(${stats.packsCount})` : ''}</Text>
          </Pressable>
          <Pressable onPress={() => setTab('cards')} style={[wide.railTab, tab === 'cards' && wide.railTabActive]}>
            <Text style={[wide.railTabText, tab === 'cards' && wide.railTabTextActive]}>卡片 {stats ? `(${stats.cardsCount})` : ''}</Text>
          </Pressable>
          {tab === 'packs' ? (
            <>
              <Text style={wide.kicker}>学习模式</Text>
              {(['all', 'deep', 'quick', 'skip'] as const).map(m => (
                <Pressable key={m} onPress={() => setModeFilter(m)} style={[wide.chip, modeFilter === m && wide.chipActive]}>
                  <Text style={[wide.chipText, modeFilter === m && wide.chipTextActive]}>{m === 'all' ? '全部' : m === 'deep' ? '精学' : m === 'quick' ? '速学' : '跳过'}</Text>
                </Pressable>
              ))}
            </>
          ) : (
            <>
              <Text style={wide.kicker}>筛选</Text>
              {(['all', 'starred'] as CardFilter[]).map(f => (
                <Pressable key={f} onPress={() => setCardFilter(f)} style={[wide.chip, cardFilter === f && wide.chipActive]}>
                  <Text style={[wide.chipText, cardFilter === f && wide.chipTextActive]}>{f === 'all' ? '全部' : '★ 已收藏'}</Text>
                </Pressable>
              ))}
            </>
          )}
        </View>

        {/* 右主区: 多列网格 */}
        <ScrollView
          style={wide.main}
          contentContainerStyle={[wide.mainContent, { paddingBottom: insets.bottom + spacing.xxxl }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); refetch(); setTimeout(() => setRefreshing(false), 600); }} tintColor={colors.brick} />}
          testID="library-scroll"
        >
          {loading ? <LoadingBlock /> : null}

          {!loading && tab === 'packs' ? (
            packs.length === 0 ? (
              <EmptyState illustration={<LibraryIll size={80} />} title="还没有学习包" text="粘贴一条播客链接开始" ctaLabel="去 Learn 粘贴" onCtaPress={() => router.replace('/learn')} />
            ) : (
              <View style={wide.grid}>
                {packs.map(p => (
                  <View key={p.packId} style={wide.cell}>
                    <SwipeablePackCard
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
                      onPress={() => openPack(p)}
                      onDelete={() => setDeletePackId(p.packId)}
                    />
                  </View>
                ))}
              </View>
            )
          ) : null}

          {!loading && tab === 'cards' ? (
            filteredCards.length === 0 ? (
              <EmptyState illustration={<LibraryIll size={80} />} title={cardFilter === 'starred' ? '还没有收藏的卡片' : '还没有卡片'} text={cardFilter === 'starred' ? '在学习包里点 ★ 收藏卡片' : '学完一集会自动生成卡片'} />
            ) : (
              <View style={wide.grid}>
                {filteredCards.map((c) => (
                  <View key={`${c.packId}-${c.cardIndex}`} style={wide.cell}>
                    <PreviewListRow
                      accentColor={colors.olive}
                      accessibilityLabel={`卡片 ${(c as any).insight || c.title || ''}`}
                      onPress={() => router.push({ pathname: '/card/[key]', params: { key: `${c.packId}-${c.cardIndex}`, packId: String(c.packId), cardIdx: String(c.cardIndex) } })}
                    >
                      <View style={styles.libCardInner}>
                        <View style={styles.libCardTitleRow}>
                          <Text style={styles.libCardTitle} numberOfLines={1}>{(c as any).insight || c.title || '未命名卡片'}</Text>
                          {c.starred ? <Text style={styles.libCardStar}>★</Text> : null}
                        </View>
                        <Text style={styles.libCardExplanation} numberOfLines={3}>{(c as any).quote || c.explanation || (c as any).context || ''}</Text>
                        <View style={styles.libCardMeta}>
                          <Text style={styles.libCardMetaText} numberOfLines={1}>{c.podcastName}</Text>
                        </View>
                      </View>
                    </PreviewListRow>
                  </View>
                ))}
              </View>
            )
          ) : null}
        </ScrollView>
      </View>
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
  kmapEntry: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.paperCream, borderRadius: 12, paddingHorizontal: spacing.md, paddingVertical: spacing.md, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.paperDark },
  kmapTitle: { fontFamily: fonts.hero, fontSize: 18, color: colors.inkPrimary },
  kmapSub: { fontFamily: fonts.body, fontSize: 12, color: colors.inkSecondary, marginTop: 2 },
  kmapArrow: { fontFamily: fonts.ui, fontSize: 20, color: colors.brick },
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
  libCardInner: { flex: 1, padding: spacing.md },
  libCardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 4 },
  libCardTitle: { flex: 1, fontFamily: fonts.ui, fontSize: 14, color: colors.inkPrimary, fontWeight: '600' },
  libCardStar: { fontSize: 16, color: colors.yolk },
  libCardExplanation: { fontFamily: fonts.body, fontSize: 12, lineHeight: 18, color: colors.inkPrimary },
  libCardMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  libCardMetaText: { fontFamily: fonts.ui, fontSize: 10, color: colors.inkSecondary, opacity: 0.7, flexShrink: 1 },
  libCardMetaSep: { fontFamily: fonts.ui, fontSize: 10, color: colors.paperDark },
});

// ── iPad 横屏 方案A 独立样式 (wide.*, 仅 LibraryWide 用, 手机路径完全不引用) ──
const wide = StyleSheet.create({
  bodyRow: { flex: 1, flexDirection: 'row' },
  rail: {
    width: ipad.rail.width, backgroundColor: colors.paperCream, paddingVertical: ipad.rail.padV, paddingHorizontal: ipad.rail.padH,
    borderRightWidth: 1, borderRightColor: colors.paperDark, gap: spacing.sm,
  },
  kmapEntry: { backgroundColor: colors.paperMain, borderRadius: radii.card, padding: spacing.md, borderWidth: 1, borderColor: colors.paperDark, marginBottom: spacing.sm },
  kicker: { fontFamily: fonts.ui, fontSize: 11, letterSpacing: 1, color: colors.inkSecondary, textTransform: 'uppercase', opacity: 0.7, marginTop: spacing.sm },
  railTab: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radii.card, backgroundColor: colors.paperMain, borderWidth: 1, borderColor: colors.paperDark },
  railTabActive: { backgroundColor: colors.brick, borderColor: colors.brick },
  railTabText: { fontFamily: fonts.ui, fontSize: 14, color: colors.inkSecondary, fontWeight: '600' },
  railTabTextActive: { color: colors.paperCream },
  chip: { paddingVertical: 6, paddingHorizontal: spacing.md, borderRadius: 999, backgroundColor: colors.paperMain, borderWidth: 1, borderColor: colors.paperDark },
  chipActive: { backgroundColor: colors.brick, borderColor: colors.brick },
  chipText: { fontFamily: fonts.ui, fontSize: 13, color: colors.inkSecondary },
  chipTextActive: { color: colors.paperCream, fontWeight: '600' },
  main: { flex: 1 },
  mainContent: { padding: spacing.xl, flexGrow: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: ipad.grid.gap },
  // R55: cell 统一高度 → 学习包卡大小一致(修 Frank"大小不一致")。SwipeablePackCard 内容撑满 cell。
  cell: { width: '31.5%', minWidth: ipad.grid.cellMinWidth, minHeight: 150 },
});

