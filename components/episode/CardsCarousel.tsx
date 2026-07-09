// CardsCarousel — 学习包卡片横向轮播 (K0Card 翻面卡 + 页码点 + star/删除/note)
// 原 episode 内联, Phase F 抽出。所有依赖经 props 传入 (pack/setPack/refetch 等)。
import React, { useState, useEffect, useCallback } from 'react';
import { View, ScrollView, Platform, StyleSheet } from 'react-native';
import { colors, spacing } from '@/constants/theme';
import { apiFetch } from '@/lib/api';
import { K0Card } from '@/components/K0Card';
import { MyApplicationBlock } from '@/components/episode/MyApplicationBlock';

export function CardsCarousel({
  pack,
  setPack,
  audioUrl,
  audioPlayer,
  podcastName,
  setDeleteConfirmCard,
  refetch,
}: {
  pack: any;
  setPack: React.Dispatch<React.SetStateAction<any>>;
  audioUrl: string | null;
  audioPlayer: any;
  podcastName: string | null;
  setDeleteConfirmCard: React.Dispatch<React.SetStateAction<any>>;
  refetch: () => void;
}) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const visibleCards = pack.cards.filter((c: any) => !c.archived);

  // 删卡后 visibleCards 变短，activeIdx 若越界 clamp 到最后一张
  useEffect(() => {
    if (visibleCards.length === 0) return;
    if (activeIdx >= visibleCards.length) {
      setActiveIdx(Math.max(0, visibleCards.length - 1));
    }
  }, [visibleCards.length, activeIdx]);

  const PEEK = 24;
  const CARD_GAP = 12;
  const cardWidth = containerWidth > 0 ? containerWidth - PEEK : 0;
  const snapInterval = cardWidth + CARD_GAP;

  const onScroll = useCallback((e: any) => {
    if (snapInterval <= 0) return;
    const x = e.nativeEvent.contentOffset.x;
    const idx = Math.round(x / snapInterval);
    if (idx !== activeIdx && idx >= 0 && idx < visibleCards.length) {
      setActiveIdx(idx);
    }
  }, [snapInterval, activeIdx, visibleCards.length]);

  const onLayout = useCallback((e: any) => {
    setContainerWidth(e.nativeEvent.layout.width);
  }, []);

  return (
    <View onLayout={onLayout} testID="cards-list">
      {containerWidth > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={snapInterval}
          snapToAlignment="start"
          decelerationRate="fast"
          onScroll={onScroll}
          scrollEventThrottle={16}
          contentContainerStyle={{ paddingRight: PEEK }}
        >
          {visibleCards.map((card: any, i: number) => {
            // 用 backend 返回的稳定 cardIndex（原始下标），而不是 findIndex（过滤后下标会删错行）
            const realIdx = typeof card.cardIndex === 'number'
              ? card.cardIndex
              : pack.cards.findIndex((c: any) => c.id === card.id);
            const toggleStar = async () => {
              const newStarred = !card.starred;
              setPack((prev: any) => {
                if (!prev) return prev;
                const newCards = [...prev.cards];
                const targetIdx = newCards.findIndex((c: any) => c.cardIndex === realIdx);
                if (targetIdx < 0) return prev;
                newCards[targetIdx] = { ...newCards[targetIdx], starred: newStarred };
                return { ...prev, cards: newCards };
              });
              try {
                await apiFetch(`/api/packs/${pack.id}/cards/${realIdx}`, {
                  method: 'PATCH',
                  body: JSON.stringify({ starred: newStarred }),
                });
              } catch {
                setPack((prev: any) => {
                  if (!prev) return prev;
                  const newCards = [...prev.cards];
                  const targetIdx = newCards.findIndex((c: any) => c.cardIndex === realIdx);
                  if (targetIdx < 0) return prev;
                  newCards[targetIdx] = { ...newCards[targetIdx], starred: !newStarred };
                  return { ...prev, cards: newCards };
                });
              }
            };
            const askDelete = () => {
              const doDelete = async () => {
                setPack((prev: any) => {
                  if (!prev) return prev;
                  const newCards = [...prev.cards];
                  const targetIdx = newCards.findIndex((c: any) => c.cardIndex === realIdx);
                  if (targetIdx < 0) return prev;
                  newCards[targetIdx] = { ...newCards[targetIdx], archived: true };
                  return { ...prev, cards: newCards };
                });
                try {
                  await apiFetch(`/api/packs/${pack.id}/cards/${realIdx}`, {
                    method: 'DELETE',
                    body: JSON.stringify({}),
                  });
                  // DELETE 成功后 refetch 拿服务端真值 (避免乐观更新写错位置 + Home/Review 不刷)
                  refetch();
                } catch {
                  setPack((prev: any) => {
                    if (!prev) return prev;
                    const newCards = [...prev.cards];
                    const targetIdx = newCards.findIndex((c: any) => c.cardIndex === realIdx);
                    if (targetIdx < 0) return prev;
                    newCards[targetIdx] = { ...newCards[targetIdx], archived: false };
                    return { ...prev, cards: newCards };
                  });
                }
              };
              if (Platform.OS === 'web') {
                if (typeof window !== 'undefined' && window.confirm && window.confirm('删除这张卡片？')) {
                  doDelete();
                }
              } else {
                setDeleteConfirmCard({ realIdx, doDelete });
              }
            };
            return (
              <View
                // key 用 cardIndex (稳定原始下标), 删卡后新卡 key 不同 → K0Card unmount+remount → flipped 复位
                key={`card-${card.cardIndex}`}
                style={{ width: cardWidth, marginRight: CARD_GAP }}
                testID={`card-${card.type}`}
              >
                <K0Card
                  card={{
                    quote: card.quote,
                    insight: card.insight || card.title,
                    context: card.context || card.explanation,
                    timestamp: card.sourceTimestamp,
                    type: card.type,
                    starred: card.starred,
                    podcastName: podcastName || undefined,
                  }}
                  variant="episode"
                  flippable
                  onStar={toggleStar}
                  onDelete={askDelete}
                  onTimestampPress={() => {
                    if (audioUrl && card.sourceTimestamp > 0) {
                      audioPlayer.play(audioUrl, card.sourceTimestamp);
                    }
                  }}
                />
                {(card.myApplication || card.personalNote) ? (
                  <MyApplicationBlock
                    packId={pack.id}
                    cardIdx={realIdx}
                    myApplication={card.myApplication || ''}
                    personalNote={card.personalNote || ''}
                    onSave={(newNote) => {
                      setPack((prev: any) => {
                        if (!prev) return prev;
                        const newCards = [...prev.cards];
                        const targetIdx = newCards.findIndex((c: any) => c.cardIndex === realIdx);
                        if (targetIdx < 0) return prev;
                        newCards[targetIdx] = { ...newCards[targetIdx], personalNote: newNote };
                        return { ...prev, cards: newCards };
                      });
                    }}
                  />
                ) : null}
              </View>
            );
          })}
        </ScrollView>
      ) : null}

      {/* 底部页码点 */}
      {visibleCards.length > 1 ? (
        <View style={styles.dotsRow}>
          {visibleCards.map((_: any, i: number) => (
            <View
              key={i}
              style={[styles.dot, i === activeIdx && styles.dotActive]}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.md,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.paperDark,
    opacity: 0.5,
  },
  dotActive: {
    width: 18,
    backgroundColor: colors.brick,
    opacity: 1,
  },
});
