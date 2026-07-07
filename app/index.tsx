// Home — 3-entry landing (Learn / Review / Library)
// STORY-00003: Style F Cutout Illustrated, more refined + abstract per user CP1 note
// Sprint 10 v10: 首页美学重构
//   - 删除 "Hello, learner" bubble
//   - 删除 footer "今天的学习，不消费。"
//   - 删除 PasteBar（Learn 卡本身就是粘贴入口）
//   - OtaBadge → 3-tap logo egg（默认不可见，点击 hero 3 次显示版本 popup）
//   - iPhone SE 一屏完成，去 ScrollView
//   - 空态文案改成动词引导（Review 空 / Library 空）
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Platform, useWindowDimensions, Modal } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { colors, fonts, spacing, radii } from '@/constants/theme';
import { HeadphoneListener } from '@/components/illustrations/HeadphoneListener';
import { LearnIll, ReviewIll, LibraryIll } from '@/components/illustrations/EntryIcons';
import { BubbleTag } from '@/components/BubbleTag';
import { WovenDivider } from '@/components/WovenDivider';
import { OtaBadge, OTA_VERSION, OTA_VERSION_MESSAGE } from '@/components/OtaBadge';
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
  textColor: string; // Sprint 13 #3: 每卡自定义字色，Review 黄底改 inkPrimary 提对比
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
    textColor: colors.paperCream, // brick 红底 → paperCream 白字 OK
    Illustration: LearnIll,
  },
  {
    key: 'review',
    route: '/review',
    title: 'Review',
    subtitle: '收藏卡片的复习节奏',
    tag: '即将上线',
    cardColor: colors.yolk,
    textColor: colors.inkPrimary, // Sprint 13 #3: yolk 黄底 → inkPrimary 深字，WCAG AA+
    Illustration: ReviewIll,
  },
  {
    key: 'library',
    route: '/library',
    title: 'Library',
    subtitle: '你已经收集的知识',
    tag: '即将上线',
    cardColor: colors.sapphire,
    textColor: colors.paperCream, // sapphire 蓝底 → paperCream 白字 OK
    Illustration: LibraryIll,
  },
];

export default function Home() {
  const insets = useSafeAreaInsets();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  // Sprint 4 STORY-00104: 小屏 (iPhone SE 高度 667) 上压缩尺寸
  const isSmallHeight = windowHeight <= 700;
  const heroSize = isSmallHeight ? 88 : 120;
  const cardMinHeight = isSmallHeight ? 76 : 92;
  const iconWrap = isSmallHeight ? 56 : 70;
  const illSize = isSmallHeight ? 48 : 60;
  const cardWidth = Math.max(280, Math.min(windowWidth - spacing.xl * 2, 380));

  // Sprint 8 Loop 30/29: 动态从 stats API 拿 Review / Library 数量
  const [reviewDue, setReviewDue] = useState<number | null>(null);
  const [libraryCards, setLibraryCards] = useState<number | null>(null);

  // Sprint 9 STORY-00902: 冷启动/杀 App 重开时，检查是否有未完成的 job
  // 有则直接跳回 import 进度屏，用户体验：好像 App 从没被杀过一样
  // Sprint 11 v16: 支持 Step 2 (pack-generate) job 恢复
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(JOB_STORAGE_KEY);
        if (!raw) return;
        const saved = JSON.parse(raw) as {
          jobId?: string; url?: string; savedAt?: number;
          packId?: number; mode?: string; targetType?: string;
        };
        if (!saved?.jobId) return;
        // 陈旧记录（超过 24h）直接清掉
        if (saved.savedAt && Date.now() - saved.savedAt > JOB_STALENESS_MS) {
          await AsyncStorage.removeItem(JOB_STORAGE_KEY);
          return;
        }
        const isStep2 = saved.targetType === 'pack-generate' && saved.packId && saved.mode;
        try {
          const s = await apiGet<{ status: string; packId: number | null }>(`/api/jobs/${saved.jobId}`);
          if (s.status === 'ready') {
            await AsyncStorage.removeItem(JOB_STORAGE_KEY);
            if (isStep2) {
              // Step 2 完成 → 跳 episode
              router.replace({
                pathname: '/episode/[id]',
                params: { id: String(saved.packId), mode: String(saved.mode) },
              });
            } else if (s.packId) {
              // Step 1 完成 → 跳快照
              router.replace({
                pathname: '/snapshot/[packId]',
                params: { packId: String(s.packId), jobId: saved.jobId },
              });
            }
            return;
          }
          if (s.status === 'failed' || s.status === 'cancelled') {
            await AsyncStorage.removeItem(JOB_STORAGE_KEY);
            return;
          }
          // 还在进行中：跳回进度屏继续轮询
          router.replace({
            pathname: '/import/[jobId]',
            params: isStep2
              ? { jobId: saved.jobId, targetPackId: String(saved.packId), targetMode: String(saved.mode) }
              : { jobId: saved.jobId, url: saved.url || '' },
          });
        } catch {
          // 探测失败（网络问题等）：仍然跳去进度屏，让进度屏自己重试
          router.replace({
            pathname: '/import/[jobId]',
            params: isStep2
              ? { jobId: saved.jobId, targetPackId: String(saved.packId), targetMode: String(saved.mode) }
              : { jobId: saved.jobId, url: saved.url || '' },
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
        tag: reviewDue === null ? '…' : reviewDue === 0 ? '还没有要复习的卡片' : `今天有 ${reviewDue} 张待复习`,
      };
    }
    if (e.key === 'library') {
      return {
        ...e,
        tag: libraryCards === null ? '…' : libraryCards === 0 ? '还没有卡片' : `${libraryCards} 张卡片`,
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

  // Sprint 10 v10: 3-tap hero 显示版本 popup（隐藏 debug 入口）
  const [versionModalOpen, setVersionModalOpen] = useState(false);
  const tapCountRef = useRef(0);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onHeroTap = useCallback(() => {
    tapCountRef.current += 1;
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    if (tapCountRef.current >= 3) {
      tapCountRef.current = 0;
      setVersionModalOpen(true);
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } else {
      // 1.2s 内累计 3 击才算 —— 单击/双击忽略，不干扰正常用户
      tapTimerRef.current = setTimeout(() => { tapCountRef.current = 0; }, 1200);
    }
  }, []);
  useEffect(() => () => { if (tapTimerRef.current) clearTimeout(tapTimerRef.current); }, []);

  return (
    <View style={[styles.root, { paddingTop: insets.top + (isSmallHeight ? 12 : 20), paddingBottom: insets.bottom + spacing.lg }]}>
      <View
        // @ts-ignore web-only dataSet for Playwright testid
        dataSet={{ testid: 'home-root' }}
        style={styles.container}
      >
        {/* Top block: Listen./Learn. 两行左 + 耳机图右（同一行，等高对齐） */}
        <View style={[styles.topRow, { height: heroSize }]}>
          <View style={[styles.topTitleCol, { height: heroSize }]}>
            <Text
              style={styles.hero}
              // @ts-ignore
              dataSet={{ testid: 'hero-title' }}
              accessibilityRole="header"
            >
              Listen.
            </Text>
            <Text style={styles.hero}>Learn.</Text>
          </View>

          <Pressable
            onPress={onHeroTap}
            style={[styles.topIllustration, { width: heroSize, height: heroSize }]}
            accessibilityRole="image"
            accessibilityLabel="K0 listener illustration"
          >
            <HeadphoneListener size={heroSize} />
          </Pressable>
        </View>

        {/* 粘贴引导句 —— 独立一行完整展示 */}
        <Text style={styles.lead}>
          粘贴一条播客链接，我把它变成你今天能学完的一节课。
        </Text>

        {/* Woven divider — full-width to match cards */}
        <View style={styles.dividerBlock}>
          <WovenDivider width={cardWidth} height={12} />
        </View>

        {/* 3 entries — 文字左 icon 右同行 */}
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
              <View style={styles.entryTextBlock}>
                <Text style={[styles.entryTitle, { color: entry.textColor }]}>{entry.title}</Text>
                <Text style={[styles.entrySubtitle, { color: entry.textColor, opacity: 0.85 }]}>{entry.subtitle}</Text>
                <View style={{ marginTop: spacing.sm }}>
                  <BubbleTag dotColor={entry.cardColor}>{entry.tag}</BubbleTag>
                </View>
              </View>
              <View style={[styles.entryIllWrap, { width: iconWrap, height: iconWrap }]}>
                <entry.Illustration size={illSize} />
              </View>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Version popup — triggered by 3-tap on hero title (hidden debug entry) */}
      <Modal
        visible={versionModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setVersionModalOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setVersionModalOpen(false)}>
          <View style={styles.versionCard}>
            <Text style={styles.versionCardTitle}>K0 · v{OTA_VERSION}</Text>
            <Text style={styles.versionCardBody}>{OTA_VERSION_MESSAGE}</Text>
            <Text style={styles.versionCardHint}>点任意处关闭</Text>
            <View style={{ marginTop: spacing.md }}>
              <OtaBadge inline />
            </View>
          </View>
        </Pressable>
      </Modal>

      {/* Sprint 10 v10: 隐藏 OTA 自动检查 —— UI 不可见，仅保留自动下载/reload 逻辑 */}
      <OtaBadge invisible />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.paperMain,
  },
  container: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    // 从上到下自然 flow，用 gap 控节奏；不用 space-between（会留巨大死空白）
    gap: spacing.lg,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topTitleCol: {
    flexShrink: 0,
    justifyContent: 'space-between', // Sprint 13 #1: Listen 顶部 / Learn 底部 → 撑满 heroSize 与耳机图等高
  },
  topIllustration: {
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  headerText: {
    flex: 1,
    gap: spacing.xs,
  },
  illustrationInline: {},
  hero: {
    fontFamily: fonts.hero,
    fontSize: 44,
    lineHeight: 46,
    color: colors.inkPrimary,
    letterSpacing: -1,
  },
  lead: {
    fontFamily: fonts.bodyItalic,
    fontStyle: 'italic',
    fontSize: 14,
    lineHeight: 20,
    color: colors.inkSecondary,
    marginTop: spacing.md,
  },
  illustrationBlock: {
    alignItems: 'center',
  },
  dividerBlock: {
    alignItems: 'center',
    marginVertical: spacing.xs,
  },
  entriesBlock: {
    flex: 1,
    gap: spacing.md,
    justifyContent: 'space-between', // 3 卡均匀分布填满剩余空间
  },
  entryCard: {
    flex: 1, // 3 卡等高，一起吃满 entriesBlock
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.card,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.lg,
    minHeight: 92,
  },
  entryCardPressed: {
    opacity: 0.88,
    // Sprint 4 STORY-00105: 撕纸翻起感
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
    fontSize: 30,
    lineHeight: 34,
    color: colors.paperCream,
  },
  entrySubtitle: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.paperMain,
    marginTop: spacing.xs / 2,
  },
  entryArrow: {
    fontFamily: fonts.ui,
    fontSize: 28,
    color: colors.paperCream,
  },
  // Sprint 10 v10: 版本 popup（3-tap hero 触发）
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(26, 22, 19, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  versionCard: {
    backgroundColor: colors.paperCream,
    borderRadius: radii.card,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.xl,
    minWidth: 260,
    alignItems: 'center',
    gap: spacing.xs,
  },
  versionCardTitle: {
    fontFamily: fonts.hero,
    fontSize: 24,
    color: colors.inkPrimary,
  },
  versionCardBody: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.inkSecondary,
    textAlign: 'center',
  },
  versionCardHint: {
    fontFamily: fonts.bodyItalic,
    fontStyle: 'italic',
    fontSize: 11,
    color: colors.inkSecondary,
    marginTop: spacing.sm,
    opacity: 0.6,
  },
});
