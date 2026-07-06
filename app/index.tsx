// Home — 3-entry landing (Learn / Review / Library)
// STORY-00003: Style F Cutout Illustrated, more refined + abstract per user CP1 note
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Platform, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { colors, fonts, spacing, radii } from '@/constants/theme';
import { HeadphoneListener } from '@/components/illustrations/HeadphoneListener';
import { LearnIll, ReviewIll, LibraryIll } from '@/components/illustrations/EntryIcons';
import { BubbleTag } from '@/components/BubbleTag';
import { WovenDivider } from '@/components/WovenDivider';
import { PasteBar } from '@/components/PasteBar';
import { OtaBadge } from '@/components/OtaBadge';
import { apiGet } from '@/lib/api';
import { getAnonymousId } from '@/lib/urlDetector';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Sprint 9 STORY-00902: pending job 恢复用的 AsyncStorage key
const JOB_STORAGE_KEY = 'k0.pendingJob';
// pending job 有效期：24 小时后视为陈旧，直接清掉
const JOB_STALENESS_MS = 24 * 60 * 60 * 1000;

type EntryDef = {
  key: 'learn' | 'review' | 'library';
  route: '/learn' | '/review' | '/library';
  title: string;
  subtitle: string;
  tag: string;
  cardColor: string;
  Illustration: (props: { size?: number }) => React.ReactElement;
};

const ENTRIES: EntryDef[] = [
  {
    key: 'learn',
    route: '/learn',
    title: 'Learn',
    subtitle: '把一集播客变成一节课',
    tag: '今天可以开始一集',
    cardColor: colors.brick,
    Illustration: LearnIll,
  },
  {
    key: 'review',
    route: '/review',
    title: 'Review',
    subtitle: '收藏卡片的复习节奏',
    tag: '即将上线',
    cardColor: colors.yolk,
    Illustration: ReviewIll,
  },
  {
    key: 'library',
    route: '/library',
    title: 'Library',
    subtitle: '你已经收集的知识',
    tag: '即将上线',
    cardColor: colors.sapphire,
    Illustration: LibraryIll,
  },
];

export default function Home() {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  // Sprint 4 STORY-00104: 小屏 (iPhone SE 高度 667) 上压缩尺寸
  const isSmallHeight = windowHeight <= 700;
  const heroSize = isSmallHeight ? 100 : 130;
  const cardMinHeight = isSmallHeight ? 80 : 96;
  const iconWrap = isSmallHeight ? 60 : 72;
  const illSize = isSmallHeight ? 52 : 64;
  const vertGap = isSmallHeight ? 14 : 24;

  // Sprint 8 Loop 30/29: 动态从 stats API 拿 Review / Library 数量
  const [reviewDue, setReviewDue] = useState<number | null>(null);
  const [libraryCards, setLibraryCards] = useState<number | null>(null);

  // Sprint 9 STORY-00902: 冷启动/杀 App 重开时，检查是否有未完成的 job
  // 有则直接跳回 import 进度屏，用户体验：好像 App 从没被杀过一样
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(JOB_STORAGE_KEY);
        if (!raw) return;
        const saved = JSON.parse(raw) as { jobId?: string; url?: string; savedAt?: number };
        if (!saved?.jobId) return;
        // 陈旧记录（超过 24h）直接清掉，避免死循环恢复失败的 job
        if (saved.savedAt && Date.now() - saved.savedAt > JOB_STALENESS_MS) {
          await AsyncStorage.removeItem(JOB_STORAGE_KEY);
          return;
        }
        // 快速探测 job 是否还活着；如已完成/失败也清掉记录，避免用户被跳到无效进度屏
        try {
          const s = await apiGet<{ status: string; packId: number | null }>(`/api/jobs/${saved.jobId}`);
          if (s.status === 'ready' && s.packId) {
            // 已经跑完：直接进 Episode，同时清 pending
            await AsyncStorage.removeItem(JOB_STORAGE_KEY);
            router.replace({
              pathname: '/episode/[id]',
              params: { id: String(s.packId), goal: 'quick_understand', jobId: saved.jobId },
            });
            return;
          }
          if (s.status === 'failed' || s.status === 'cancelled') {
            await AsyncStorage.removeItem(JOB_STORAGE_KEY);
            return;
          }
          // 还在进行中：跳回进度屏继续轮询
          router.replace({
            pathname: '/import/[jobId]',
            params: { jobId: saved.jobId, url: saved.url || '' },
          });
        } catch {
          // 探测失败（网络问题等）：仍然跳去进度屏，让进度屏自己重试
          router.replace({
            pathname: '/import/[jobId]',
            params: { jobId: saved.jobId, url: saved.url || '' },
          });
        }
      } catch {
        // ignore
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const aid = await getAnonymousId();
        const q = `?anonymousId=${encodeURIComponent(aid)}`;
        const [reviewStats, libraryStats] = await Promise.all([
          apiGet<{ dueToday: number }>(`/api/review/stats${q}`).catch(() => null),
          apiGet<{ cardsCount: number }>(`/api/library/stats${q}`).catch(() => null),
        ]);
        if (reviewStats) setReviewDue(reviewStats.dueToday || 0);
        if (libraryStats) setLibraryCards(Number(libraryStats.cardsCount) || 0);
      } catch {}
    })();
  }, []);

  const dynamicEntries: EntryDef[] = ENTRIES.map(e => {
    if (e.key === 'review') {
      return {
        ...e,
        // Sprint 9 UX Medium fix: 骨架态用 "…" 而不是 "即将上线"，避免 flicker
        tag: reviewDue === null ? '…' : reviewDue === 0 ? '今日无待复习' : `今天有 ${reviewDue} 张待复习`,
      };
    }
    if (e.key === 'library') {
      return {
        ...e,
        tag: libraryCards === null ? '…' : libraryCards === 0 ? '空的' : `${libraryCards} 张卡片`,
      };
    }
    return e;
  });

  const onPressEntry = useCallback((route: EntryDef['route']) => {
    if (Platform.OS !== 'web') {
      Haptics.selectionAsync().catch(() => {});
    }
    router.push(route);
  }, []);

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.contentInner,
          { paddingTop: insets.top + (isSmallHeight ? 16 : 32), paddingBottom: insets.bottom + 120 /* PasteBar space */, gap: vertGap },
        ]}
        testID="home-scroll"
      >
      <View
        // @ts-ignore web-only dataSet for Playwright testid
        dataSet={{ testid: 'home-root' }}
        style={styles.container}
      >
        {/* Header block: bubble + hero title */}
        <View style={styles.headerBlock}>
          <BubbleTag testID="hello-tag">Hello, learner.</BubbleTag>
          <Text
            style={styles.hero}
            // @ts-ignore
            dataSet={{ testid: 'hero-title' }}
            accessibilityRole="header"
          >
            Listen.{"\n"}Learn.
          </Text>
          <Text style={styles.lead}>
            粘贴一条播客链接，我把它变成你今天能学完的一节课。
          </Text>
        </View>

        {/* Headphone listener silhouette — dynamic size for small viewports */}
        <View style={styles.illustrationBlock}>
          <HeadphoneListener size={heroSize} />
        </View>

        {/* Woven divider */}
        <View style={styles.dividerBlock}>
          <WovenDivider width={320} height={12} />
        </View>

        {/* 3 entries */}
        <View style={styles.entriesBlock}>
          {dynamicEntries.map(entry => (
            <Pressable
              key={entry.key}
              onPress={() => onPressEntry(entry.route)}
              // @ts-ignore
              dataSet={{ testid: `entry-${entry.key}` }}
              accessibilityRole="button"
              accessibilityLabel={`${entry.title}: ${entry.subtitle}`}
              style={({ pressed }) => [
                styles.entryCard,
                { backgroundColor: entry.cardColor, minHeight: cardMinHeight },
                pressed && styles.entryCardPressed,
              ]}
            >
              <View style={[styles.entryIllWrap, { width: iconWrap, height: iconWrap }]}>
                <entry.Illustration size={illSize} />
              </View>
              <View style={styles.entryTextBlock}>
                <Text style={styles.entryTitle}>{entry.title}</Text>
                <Text style={styles.entrySubtitle}>{entry.subtitle}</Text>
                <View style={{ marginTop: spacing.sm }}>
                  <BubbleTag dotColor={entry.cardColor}>{entry.tag}</BubbleTag>
                </View>
              </View>
              <Text style={styles.entryArrow}>→</Text>
            </Pressable>
          ))}
        </View>

        {/* Footer note */}
        <Text style={styles.footNote} testID="foot-note">
          今天的学习，不消费。
        </Text>
      </View>
    </ScrollView>

    {/* Sprint 4 STORY-00101: Home 底部固定 primary CTA — 拇指区直达 Learn */}
    <PasteBar bottomInset={insets.bottom} />

    {/* Sprint 7: OTA 版本 pill — 右上角浮动 */}
    <OtaBadge />
  </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.paperMain,
  },
  scroll: {
    flex: 1,
  },
  contentInner: {
    flexGrow: 1,
  },
  container: {
    paddingHorizontal: spacing.xl,
    gap: spacing.xl,
  },
  headerBlock: {
    gap: spacing.md,
  },
  hero: {
    fontFamily: fonts.hero,
    fontSize: 52,
    lineHeight: 54,
    color: colors.inkPrimary,
    letterSpacing: -1,
  },
  lead: {
    fontFamily: fonts.bodyItalic,
    fontStyle: 'italic',
    fontSize: 15,
    lineHeight: 22,
    color: colors.inkSecondary,
    maxWidth: 320,
  },
  illustrationBlock: {
    alignItems: 'center',
    marginTop: -spacing.sm,
    marginBottom: -spacing.sm,
  },
  dividerBlock: {
    alignItems: 'center',
    marginVertical: spacing.sm,
  },
  entriesBlock: {
    gap: spacing.lg,
  },
  entryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.card,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    gap: spacing.lg,
    minHeight: 96, // ≥ 44 touch target well above HIG
  },
  entryCardPressed: {
    opacity: 0.88,
    // Sprint 4 STORY-00105: 撕纸翻起感 — 轻微 scale + rotate
    transform: [{ scale: 0.97 }, { rotate: '0.5deg' }],
  },
  entryIllWrap: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.paperCream,
    borderRadius: 8,
  },
  entryTextBlock: {
    flex: 1,
  },
  entryTitle: {
    fontFamily: fonts.hero,
    fontSize: 32,
    lineHeight: 36,
    color: colors.paperCream,
  },
  entrySubtitle: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.paperMain,
    marginTop: spacing.xs / 2,
  },
  entryArrow: {
    fontFamily: fonts.ui,
    fontSize: 28,
    color: colors.paperCream,
  },
  footNote: {
    fontFamily: fonts.bodyItalic,
    fontStyle: 'italic',
    fontSize: 13,
    color: colors.inkSecondary,
    alignSelf: 'center',
    marginTop: spacing.xl,
  },
});
