// Home — 3-entry landing (Learn / Review / Library)
// STORY-00003: Style F Cutout Illustrated, more refined + abstract per user CP1 note
import React, { useCallback } from 'react';
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
    subtitle: '今天只有 5 张，很快',
    tag: '今天有 5 张待复习',
    cardColor: colors.yolk,
    Illustration: ReviewIll,
  },
  {
    key: 'library',
    route: '/library',
    title: 'Library',
    subtitle: '你已经收集的知识',
    tag: '42 张卡片在库',
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
          {ENTRIES.map(entry => (
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
