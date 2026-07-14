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
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { colors, fonts, spacing, radii } from '@/constants/theme';

import { HeadphoneListener } from '@/components/illustrations/HeadphoneListener';
import { LearnIll, ReviewIll, LibraryIll } from '@/components/illustrations/EntryIcons';
import { BubbleTag } from '@/components/BubbleTag';
import { WovenDivider } from '@/components/WovenDivider';
import { OtaBadge } from '@/components/OtaBadge';
import { DebugUploadZone } from '@/components/DebugUploadZone';
import { apiGet } from '@/lib/api';
import { getSession, clearSession } from '@/lib/auth';
import { readPendingJob, clearPendingJob, JOB_STALENESS_MS } from '@/lib/pendingJob';
import { useResponsive } from '@/hooks/useResponsive';
import { ipad } from '@/constants/ipadTheme';


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
    // Sprint 13 R6 #2: 从"收藏卡片的复习节奏"→"陪你温故"（更简洁 + 与"不催不评分"语气一致）
    subtitle: '陪你温故',
    tag: '即将上线',
    cardColor: colors.yolk,
    textColor: colors.inkPrimary, // Sprint 13 #3: yolk 黄底 → inkPrimary 深字，WCAG AA+
    Illustration: ReviewIll,
  },
  {
    key: 'library',
    route: '/library',
    title: 'Library',
    // Sprint 13 R6 #2: 从"你已经收集的知识"（空态时言过其实）→"你的知识收藏"（中性）
    subtitle: '你的知识收藏',
    tag: '即将上线',
    cardColor: colors.sapphire,
    textColor: colors.paperCream, // sapphire 蓝底 → paperCream 白字 OK
    Illustration: LibraryIll,
  },
];

export default function Home() {
  const insets = useSafeAreaInsets();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const { isWide } = useResponsive();   // iPad 横屏 → 走宽屏布局(方案B)
  // Sprint 4 STORY-00104: 小屏 (iPhone SE 高度 667) 上压缩尺寸
  const isSmallHeight = windowHeight <= 700;
  const heroSize = isSmallHeight ? 88 : 120;
  const cardMinHeight = isSmallHeight ? 76 : 92;
  const iconWrap = isSmallHeight ? 56 : 70;
  const illSize = isSmallHeight ? 48 : 60;
  const cardWidth = Math.max(280, Math.min(windowWidth - spacing.xl * 2, 380));

  // Sprint 16 R2: 登录状态守卫
  const [sessionChecked, setSessionChecked] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  useEffect(() => {
    (async () => {
      const s = await getSession();
      if (!s) {
        router.replace('/login');
      } else {
        setUsername(s.username);
        setSessionChecked(true);
      }
    })();
  }, []);

  // Sprint 8 Loop 30/29: 动态从 stats API 拿 Review / Library 数量
  const [reviewDue, setReviewDue] = useState<number | null>(null);
  const [libraryCards, setLibraryCards] = useState<number | null>(null);
  const [libraryPacks, setLibraryPacks] = useState<number | null>(null);

  // Sprint 9 STORY-00902: 冷启动/杀 App 重开时，检查是否有未完成的 job
  // 有则直接跳回 import 进度屏，用户体验：好像 App 从没被杀过一样
  // Sprint 11 v16: 支持 Step 2 (pack-generate) job 恢复
  useEffect(() => {
    (async () => {
      try {
        const saved = await readPendingJob();
        if (!saved) return;
        // 陈旧记录（超过 24h）直接清掉
        if (saved.savedAt && Date.now() - saved.savedAt > JOB_STALENESS_MS) {
          await clearPendingJob();
          return;
        }
        const isStep2 = saved.targetType === 'pack-generate' && saved.packId && saved.mode;
        try {
          const s = await apiGet<{ status: string; packId: number | null }>(`/api/jobs/${saved.jobId}`);
          if (s.status === 'ready') {
            await clearPendingJob();
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
            await clearPendingJob();
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

  // Sprint 16 R21 (B1): stats 拉取改 useFocusEffect —
  // 之前 useEffect([]) 只 mount 拉一次，用户从 Review/Episode 删/评分卡回 Home，
  // "今天有 N 张待复习" tag 永远显示挂载时的旧值 → Home 4 张 vs Review 1 张矛盾。
  // useFocusEffect 让每次页面 focus 都重新拉服务端真值。
  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const q = ``;
          const [reviewStats, libraryStats] = await Promise.all([
            apiGet<{ dueToday: number }>(`/api/review/stats${q}`).catch(() => null),
            apiGet<{ cardsCount: number; packsCount: number }>(`/api/library/stats${q}`).catch(() => null),
          ]);
          if (reviewStats) setReviewDue(reviewStats.dueToday || 0);
          if (libraryStats) {
            setLibraryCards(Number(libraryStats.cardsCount) || 0);
            setLibraryPacks(Number(libraryStats.packsCount) || 0);
          }
        } catch {}
      })();
    }, [])
  );

  const dynamicEntries: EntryDef[] = ENTRIES.map(e => {
    if (e.key === 'review') {
      return {
        ...e,
        // Sprint 13 R6 #2: 空态 tag 从"还没有 xx"改行动引导（跟 subtitle 语气匹配）
        // Sprint 15+ 修 "..." 困惑：null（加载中/失败）也显示引导语，不要 "..."
        tag: reviewDue && reviewDue > 0 ? `今天有 ${reviewDue} 张待复习` : '从 Learn 开始学一集',
      };
    }
    if (e.key === 'library') {
      const packs = libraryPacks ?? 0;
      const cards = libraryCards ?? 0;
      let tag = '粘贴一条播客链接开始';
      if (packs > 0 || cards > 0) {
        tag = `${packs} 学习包 · ${cards} 卡片`;
      }
      return { ...e, tag };
    }
    return e;
  });

  const onPressEntry = useCallback((route: EntryDef['route']) => {
    if (Platform.OS !== 'web') {
      Haptics.selectionAsync().catch(() => {});
    }
    router.push(route);
  }, []);

  // Sprint 16 R2: 3-tap hero → upload debug modal（version popup 挪到 login 页）
  const tapCountRef = useRef(0);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onHeroTap = useCallback(() => {
    tapCountRef.current += 1;
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    if (tapCountRef.current >= 3) {
      tapCountRef.current = 0;
      setUploadModalOpen(true);
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } else {
      // 1.2s 内累计 3 击才算 —— 单击/双击忽略，不干扰正常用户
      tapTimerRef.current = setTimeout(() => { tapCountRef.current = 0; }, 1200);
    }
  }, []);
  useEffect(() => () => { if (tapTimerRef.current) clearTimeout(tapTimerRef.current); }, []);

  const onLogout = useCallback(async () => {
    await clearSession();
    router.replace('/login');
  }, []);

  if (!sessionChecked) {
    return <View style={{ flex: 1, backgroundColor: colors.paperMain }} />;
  }

  // ── iPad 横屏 (isWide): 方案 B —— 顶部 hero 横排 + 分割线 + 底部 3 卡横排 (图左字右, 卡高适中留呼吸) ──
  if (isWide) {
    return (
      <View style={[stylesWide.root, { paddingTop: insets.top + ipad.padTop, paddingBottom: insets.bottom + ipad.padBottom, paddingHorizontal: ipad.gutter }]}>
        <View style={stylesWide.container}>
          {/* 顶部: 标题左 + 耳机图右 */}
          <View style={stylesWide.topRow}>
            <View style={stylesWide.topTitleCol}>
              <Text style={stylesWide.hero} accessibilityRole="header">Listen. Learn.</Text>
              <Text style={stylesWide.lead}>粘贴一条播客链接，我把它变成你今天能学完的一节课。</Text>
            </View>
            <Pressable onPress={onHeroTap} style={stylesWide.topIll} accessibilityRole="image" accessibilityLabel="K0 listener illustration">
              <HeadphoneListener size={132} />
            </Pressable>
          </View>

          {/* 分割线 (编织织带, 宽度=内容区宽, 与 iPad 规范一致, 不再 hardcode) */}
          <View style={stylesWide.dividerBlock}>
            <WovenDivider width={ipad.dividerWidth} height={ipad.header.dividerHeight} />
          </View>

          {/* 3 卡横排 (图左字右, 卡高适中) */}
          <View style={stylesWide.row}>
            {dynamicEntries.map(entry => (
              <Pressable
                key={entry.key}
                onPress={() => onPressEntry(entry.route)}
                // @ts-ignore web-only dataSet for Playwright testid
                dataSet={{ testid: `entry-${entry.key}` }}
                accessibilityRole="button"
                accessibilityLabel={`${entry.title}: ${entry.subtitle}`}
                style={({ pressed }) => [stylesWide.card, { backgroundColor: entry.cardColor }, pressed && styles.entryCardPressed]}
              >
                <View style={stylesWide.cardText}>
                  <Text style={[stylesWide.cardTitle, { color: entry.textColor }]}>{entry.title}</Text>
                  <Text style={[stylesWide.cardSub, { color: entry.textColor, opacity: 0.9 }]}>{entry.subtitle}</Text>
                  <View style={{ marginTop: spacing.md }}>
                    <BubbleTag dotColor={entry.cardColor}>{entry.tag}</BubbleTag>
                  </View>
                </View>
                <View style={stylesWide.cardIll}>
                  <entry.Illustration size={56} />
                </View>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Upload debug modal (与竖屏共用) */}
        <Modal visible={uploadModalOpen} transparent animationType="fade" onRequestClose={() => setUploadModalOpen(false)}>
          <Pressable style={styles.modalBackdrop} onPress={() => setUploadModalOpen(false)}>
            <View style={styles.versionCard}>
              <Text style={styles.versionCardTitle}>Upload Debug</Text>
              <Text style={styles.versionCardBody}>上传截图/日志给 Frank</Text>
              <DebugUploadZone />
              {username ? (
                <>
                  <Text style={styles.versionCardHint}>当前登录：{username}</Text>
                  <Pressable onPress={onLogout} style={styles.logoutBtn}><Text style={styles.logoutText}>退出登录</Text></Pressable>
                </>
              ) : null}
              <Text style={styles.versionCardHint}>点任意处关闭</Text>
            </View>
          </Pressable>
        </Modal>
        <OtaBadge invisible />
      </View>
    );
  }

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

      {/* Sprint 16 R2: Upload debug modal —— 3-tap 耳机图触发（原为 version popup，version popup 已挪到登录页） */}
      <Modal
        visible={uploadModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setUploadModalOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setUploadModalOpen(false)}>
          <View style={styles.versionCard}>
            <Text style={styles.versionCardTitle}>Upload Debug</Text>
            <Text style={styles.versionCardBody}>上传截图/日志给 Frank</Text>
            <DebugUploadZone />
            {username ? (
              <>
                <Text style={styles.versionCardHint}>当前登录：{username}</Text>
                <Pressable onPress={onLogout} style={styles.logoutBtn}>
                  <Text style={styles.logoutText}>退出登录</Text>
                </Pressable>
              </>
            ) : null}
            <Text style={styles.versionCardHint}>点任意处关闭</Text>
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
    // Sprint 14 R1 #1: 视觉对齐（BagelFatOne 字符盒顶部约有 8-10px 空 padding），
    // 用 marginTop:-8 让文字视觉顶端与耳机图头顶对齐
    justifyContent: 'center',
    marginTop: -8,
  },
  topIllustration: {
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  // Sprint 13 R4: headerRow/headerText/illustrationInline/illustrationBlock 死代码删除
  hero: {
    fontFamily: fonts.hero,
    // Sprint 14 R1 #1: 视觉对齐（不是代码对齐）—— BagelFatOne 字体本身 topInset ~15%，
    // 用 includeFontPadding:false 去掉字体内 padding，两行 hero 视觉重心才能与右侧图片重心一致
    fontSize: 56,
    lineHeight: 60,
    color: colors.inkPrimary,
    letterSpacing: -1.5,
    includeFontPadding: false,
  },
  lead: {
    fontFamily: fonts.bodyItalic,
    fontStyle: 'italic',
    fontSize: 14,
    lineHeight: 20,
    color: colors.inkSecondary,
    marginTop: spacing.md,
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
  // Sprint 13 R4: entryArrow 死代码删除（撕纸风已弃箭头）
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
  logoutBtn: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.card,
    backgroundColor: colors.paperMain,
  },
  logoutText: {
    fontFamily: fonts.ui,
    fontSize: 12,
    color: colors.brick,
    letterSpacing: 0.3,
  },
});

// ── iPad 横屏 (方案 B) 专属样式 ──
const stylesWide = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paperMain },
  // R55: 内容限宽 980 居中(左右适度留白, 不空太多); 顶部对齐 + 受控间距, 不再垂直居中导致大片空白。
  container: { flex: 1, justifyContent: 'flex-start', gap: spacing.xl, maxWidth: ipad.maxContentWidth, width: '100%', alignSelf: 'center', paddingTop: spacing.sm },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  topTitleCol: { flex: 1, justifyContent: 'center', paddingRight: spacing.xxl },
  hero: { fontFamily: fonts.hero, fontSize: 64, lineHeight: 72, color: colors.inkPrimary, letterSpacing: -2, includeFontPadding: false },
  lead: { fontFamily: fonts.bodyItalic, fontStyle: 'italic', fontSize: 18, lineHeight: 26, color: colors.inkSecondary, marginTop: spacing.sm, maxWidth: 560 },
  topIll: { width: 120, height: 120, flexShrink: 0, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  dividerBlock: { alignItems: 'center' },
  // 3 卡横排填满剩余高度(flex:1), 卡内图左字右; 不再固定 210 导致下方大片空白。
  row: { flex: 1, flexDirection: 'row', gap: ipad.grid.gap },
  card: { flex: 1, flexDirection: 'row', alignItems: 'center', borderRadius: ipad.card.radius, paddingVertical: ipad.card.padV, paddingHorizontal: ipad.card.padH, gap: spacing.lg, maxHeight: 260 },
  cardText: { flex: 1 },
  cardTitle: { fontFamily: fonts.hero, fontSize: ipad.card.titleSize, lineHeight: ipad.card.titleSize + 4 },
  cardSub: { fontFamily: fonts.body, fontSize: ipad.card.subSize, marginTop: spacing.xs },
  cardIll: { width: ipad.card.illBox, height: ipad.card.illBox, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paperCream, borderRadius: 10, flexShrink: 0 },
});

