// K0 Card Detail 页 — Sprint 15
// URL: /card/{packId}-{cardIdx}
// Library 卡片 tab 点击卡片 → 独立卡片详情页（D4 日夜翻面主视觉）
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiGet, apiFetch } from '@/lib/api';
import { getAnonymousId } from '@/lib/urlDetector';
import { colors, fonts, spacing, radii } from '@/constants/theme';
import { ScreenHeader } from '@/components/ScreenHeader';
import { K0Card } from '@/components/K0Card';
import { useAudioPlayer } from '@/lib/audioPlayer';

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

type PackResp = {
  pack?: any;
  audioUrl?: string;
  episodeTitle?: string;
  podcastName?: string;
};

export default function CardDetail() {
  const insets = useSafeAreaInsets();
  const audioPlayer = useAudioPlayer();
  const params = useLocalSearchParams<{ key?: string; packId?: string; cardIdx?: string; goal?: string }>();
  const packId = Number(params.packId || (params.key || '').split('-')[0] || 0);
  const cardIdx = Number(params.cardIdx || (params.key || '').split('-')[1] || 0);

  // Sprint 16 R8: 音频停止改由 AudioPlayerBar 监听 pathname 变化统一处理

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [card, setCard] = useState<Card | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [podcastName, setPodcastName] = useState<string>('');

  useEffect(() => {
    (async () => {
      if (!Number.isFinite(packId) || packId <= 0) {
        setError('无效的卡片链接');
        setLoading(false);
        return;
      }
      try {
        const aid = await getAnonymousId();
        const res = await apiGet<PackResp>(`/api/packs/${packId}?anonymousId=${encodeURIComponent(aid)}`);
        const pack = res.pack || {};
        const cards: Card[] = Array.isArray(pack.cards) ? pack.cards : [];
        const c = cards[cardIdx];
        if (!c) {
          setError('卡片不存在');
        } else {
          setCard(c);
          setPodcastName(res.podcastName || '');
          setAudioUrl(res.audioUrl || null);
        }
      } catch (e: any) {
        setError(e?.message || '加载失败');
      } finally {
        setLoading(false);
      }
    })();
  }, [packId, cardIdx]);

  const toggleStar = useCallback(async () => {
    if (!card) return;
    const newStarred = !card.starred;
    setCard({ ...card, starred: newStarred });
    try {
      const aid = await getAnonymousId();
      await apiFetch(`/api/packs/${packId}/cards/${cardIdx}?anonymousId=${encodeURIComponent(aid)}`, {
        method: 'PATCH',
        body: JSON.stringify({ starred: newStarred, anonymousId: aid }),
      });
    } catch {
      setCard(c => c ? { ...c, starred: !newStarred } : c);
    }
  }, [card, packId, cardIdx]);

  const goToPack = () => {
    // Sprint 16 R11: 跳转前 stop 音频
    try { audioPlayer.stop(); } catch {}
    router.push({
      pathname: '/episode/[id]',
      params: {
        id: String(packId),
        goal: params.goal || 'quick_understand',
        direct: '1',
        packId: String(packId),
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
