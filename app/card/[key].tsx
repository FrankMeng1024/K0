// K0 Card Detail 页 — Sprint 15
// URL: /card/{packId}-{cardIdx}
// Library 卡片 tab 点击卡片 → 独立卡片详情页（D4 日夜翻面主视觉）
import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiFetch } from '@/lib/api';
import { queryClient } from '@/lib/queryClient';
import { colors, fonts, spacing, radii } from '@/constants/theme';
import { ScreenHeader } from '@/components/ScreenHeader';
import { K0Card } from '@/components/K0Card';
import { useAudioPlayer } from '@/lib/audioPlayer';
import { usePack } from '@/hooks/usePack';

type Card = {
  id?: number;
  type?: string;
  title?: string;
  quote?: string;
  insight?: string;
  context?: string;
  sourceTimestamp?: number;
  starred?: boolean;
  archived?: boolean;
};

export default function CardDetail() {
  const insets = useSafeAreaInsets();
  const audioPlayer = useAudioPlayer();

  // Bug1 (Sprint16 R23): 停音频改由 AudioPlayerBar root 级 pathname 监听统一处理 (v36 稳定方案)
  const params = useLocalSearchParams<{ key?: string; packId?: string; cardIdx?: string; goal?: string }>();
  const packId = Number(params.packId || (params.key || '').split('-')[0] || 0);
  const cardIdx = Number(params.cardIdx || (params.key || '').split('-')[1] || 0);

  // Sprint 16 R8: 音频停止改由 AudioPlayerBar 监听 pathname 变化统一处理

  // Phase 2.3: pack 数据走 usePack (React Query)
  const { data: packResp, isLoading, error: fetchError } = usePack(packId);
  // 本地 star overlay (乐观更新, 纯本地不 refetch 防闪烁)
  const [starOverride, setStarOverride] = useState<boolean | null>(null);

  const invalidPack = !Number.isFinite(packId) || packId <= 0;
  const rawCards: Card[] = Array.isArray(packResp?.pack?.cards) ? packResp!.pack.cards : [];
  // Sprint 16 R18: backend 返回过滤后数组, 用 cardIndex 字段匹配原始下标 (cards[cardIdx] 会越界)
  const foundCard = rawCards.find((x: any) => x.cardIndex === cardIdx) || rawCards[cardIdx];
  const card: Card | null = foundCard
    ? { ...foundCard, starred: starOverride !== null ? starOverride : foundCard.starred }
    : null;
  const podcastName = packResp?.podcastName || '';
  const audioUrl = packResp?.audioUrl || null;
  const loading = invalidPack ? false : isLoading;
  const error = invalidPack
    ? '无效的卡片链接'
    : (fetchError ? (fetchError.message || '加载失败') : (!loading && !card ? '卡片不存在' : null));

  const toggleStar = useCallback(async () => {
    if (!card) return;
    const newStarred = !card.starred;
    // Bug5 (Sprint16 R23): 乐观更新 UI (无闪), 成功后把新值写进 React Query 缓存,
    //   保证退出再进 (usePack ['pack',packId] 命中缓存) 显示的是新收藏态, 不回退旧值。
    //   之前只 invalidate library/review 不动 pack 缓存 → 再进卡片看到旧星。
    setStarOverride(newStarred);
    try {
      await apiFetch(`/api/packs/${packId}/cards/${cardIdx}`, {
        method: 'PATCH',
        body: JSON.stringify({ starred: newStarred }),
      });
      // 直接改缓存里这张卡的 starred (不 refetch → 不闪), 缓存与服务端一致
      queryClient.setQueryData(['pack', packId], (old: any) => {
        if (!old?.pack?.cards) return old;
        const cards = old.pack.cards.map((c: any) =>
          c.cardIndex === cardIdx ? { ...c, starred: newStarred } : c
        );
        return { ...old, pack: { ...old.pack, cards } };
      });
      // 跨页缓存失效: star 影响 Library 收藏筛选 + Review 队列
      queryClient.invalidateQueries({ queryKey: ['library'] });
      queryClient.invalidateQueries({ queryKey: ['review'] });
    } catch {
      setStarOverride(!newStarred);
    }
  }, [card, packId, cardIdx]);

  const goToPack = () => {
    // Sprint 16 R11: 跳转前 stop 音频
    try { audioPlayer.stop(); } catch {}
    // Bug6 (Sprint16 R23): 传 mode (服务端真值) + direct, 让 episode 页按真实
    //   深度渲染 (quick 只显示卡片+快照; deep 显示步骤/概念/行动)。
    //   direct='1' 表示"从已有内容打开", back 回上一页而非首页。
    const packMode = (packResp?.pack as any)?.mode;
    router.push({
      pathname: '/episode/[id]',
      params: {
        id: String(packId),
        goal: params.goal || 'quick_understand',
        direct: '1',
        packId: String(packId),
        ...(packMode ? { mode: packMode } : {}),
      },
    });
  };

  return (
    <View style={styles.root}>
      <ScreenHeader
        title="卡片"
        subtitle={podcastName || undefined}
        onBack={() => {
          // Sprint 16 R11: 返回前 stop 音频
          try { audioPlayer.stop(); } catch {}
          if (router.canGoBack()) router.back(); else router.replace('/');
        }}
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxxl }]}
      >
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.brick} />
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Text style={styles.errText}>{error}</Text>
            <Pressable style={styles.backHomeBtn} onPress={() => router.replace('/library')}>
              <Text style={styles.backHomeText}>回到 Library</Text>
            </Pressable>
          </View>
        ) : card ? (
          <>
            <View style={styles.cardWrap}>
              <K0Card
                card={{
                  quote: card.quote,
                  quoteVerified: (card as any).quoteVerified,
                  insight: card.insight || card.title,
                  context: card.context,
                  timestamp: card.sourceTimestamp,
                  type: card.type,
                  starred: card.starred,
                  podcastName: podcastName || undefined,
                }}
                variant="library"
                flippable
                onStar={toggleStar}
                onTimestampPress={() => {
                  if (audioUrl && (card.sourceTimestamp || 0) >= 0) {
                    audioPlayer.play(audioUrl, card.sourceTimestamp || 0);
                  }
                }}
              />
            </View>

            <Pressable style={styles.gotoPackBtn} onPress={goToPack}>
              <Text style={styles.gotoPackText}>去这个学习包看看 →</Text>
            </Pressable>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paperMain },
  scroll: { flex: 1 },
  content: { paddingHorizontal: spacing.xl, gap: spacing.lg, paddingTop: spacing.md },
  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xxxl, gap: spacing.md },
  errText: { fontFamily: fonts.body, fontSize: 14, color: colors.brick, textAlign: 'center' },
  cardWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.lg },
  gotoPackBtn: {
    alignSelf: 'center',
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    backgroundColor: colors.brick,
    borderRadius: radii.card,
  },
  gotoPackText: {
    fontFamily: fonts.ui,
    fontSize: 15,
    color: colors.paperCream,
    fontWeight: '600' as const,
  },
  backHomeBtn: {
    marginTop: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    backgroundColor: colors.paperCream,
    borderRadius: radii.card,
  },
  backHomeText: { fontFamily: fonts.ui, fontSize: 14, color: colors.inkPrimary },
});
