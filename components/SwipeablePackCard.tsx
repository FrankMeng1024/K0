// K0 SwipeablePackCard — Sprint 14 R2
// 左滑露出删除按钮（纯 JS: Animated + PanResponder，无需 react-native-gesture-handler）
import React, { useRef } from 'react';
import { View, Text, Pressable, StyleSheet, Animated, PanResponder, Image } from 'react-native';
import { colors, fonts, spacing, radii } from '@/constants/theme';
import { TrashIconTorn } from '@/components/icons/TrashIconTorn';

const DELETE_BTN_WIDTH = 80;

export type SwipeablePackCardProps = {
  packId: number;
  podcastName?: string;
  episodeTitle?: string;
  oneSentence?: string;
  coverImageUrl?: string | null;
  stepsDoneCount?: number;
  cardsCount?: number;
  mode?: 'quick' | 'deep' | 'skip' | null;
  goal?: string;
  onPress: () => void;
  onDelete: () => void;
};

export function SwipeablePackCard(props: SwipeablePackCardProps) {
  const translateX = useRef(new Animated.Value(0)).current;
  const currentX = useRef(0);

  const modeLabel =
    props.mode === 'deep' ? '精学' :
    props.mode === 'quick' ? '速学' :
    props.mode === 'skip' ? '跳过' :
    props.goal === 'quick_understand' ? '快速' :
    props.goal === 'deep_learn' ? '深度' :
    props.goal === 'find_actions' ? '行动' :
    props.goal === 'critical_thinking' ? '批判' :
    props.goal === 'for_work' ? '工作' : (props.goal || '');

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dx) > 8 && Math.abs(gs.dx) > Math.abs(gs.dy),
      onPanResponderMove: (_, gs) => {
        // 只允许左滑（负 dx），最大 -DELETE_BTN_WIDTH
        const next = Math.max(-DELETE_BTN_WIDTH, Math.min(0, currentX.current + gs.dx));
        translateX.setValue(next);
      },
      onPanResponderRelease: (_, gs) => {
        const projected = currentX.current + gs.dx;
        // 超过一半 → 完全打开；否则回弹
        const shouldOpen = projected < -DELETE_BTN_WIDTH / 2;
        const to = shouldOpen ? -DELETE_BTN_WIDTH : 0;
        currentX.current = to;
        Animated.spring(translateX, { toValue: to, useNativeDriver: true, friction: 8 }).start();
      },
    })
  ).current;

  const closeAndCall = (cb: () => void) => {
    currentX.current = 0;
    Animated.spring(translateX, { toValue: 0, useNativeDriver: true, friction: 8 }).start();
    setTimeout(cb, 100);
  };

  return (
    <View style={styles.wrap}>
      {/* 删除按钮层（在下面）*/}
      <View style={styles.deleteLayer}>
        <Pressable
          style={styles.deleteBtn}
          onPress={() => closeAndCall(props.onDelete)}
          accessibilityLabel="删除学习包"
        >
          <TrashIconTorn size={24} color={colors.paperCream} />
          <Text style={styles.deleteText}>删除</Text>
        </Pressable>
      </View>

      {/* 卡片层（可滑动）*/}
      <Animated.View
        style={[styles.cardLayer, { transform: [{ translateX }] }]}
        {...panResponder.panHandlers}
      >
        <Pressable onPress={props.onPress} style={styles.packCard} accessibilityRole="button">
          {props.coverImageUrl ? (
            <Image source={{ uri: props.coverImageUrl }} style={styles.packCover} accessibilityIgnoresInvertColors />
          ) : (
            <View style={[styles.packCover, styles.packCoverPlaceholder]}>
              <Text style={styles.packCoverPlaceholderText}>K</Text>
            </View>
          )}
          <View style={styles.packInfo}>
            {props.podcastName ? <Text style={styles.packPodcast} numberOfLines={1}>{props.podcastName}</Text> : null}
            {props.episodeTitle ? <Text style={styles.packTitle} numberOfLines={2}>{props.episodeTitle}</Text> : null}
            {props.oneSentence ? <Text style={styles.packOneSentence} numberOfLines={2}>{props.oneSentence}</Text> : null}
            <View style={styles.packMeta}>
              <Text style={styles.packMetaText}>{props.stepsDoneCount ?? 0}/6 步骤</Text>
              <Text style={styles.packMetaSep}>·</Text>
              <Text style={styles.packMetaText}>{props.cardsCount ?? 0} 卡片</Text>
              {modeLabel ? (
                <>
                  <Text style={styles.packMetaSep}>·</Text>
                  <Text style={styles.packMetaText}>{modeLabel}</Text>
                </>
              ) : null}
            </View>
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
    marginBottom: spacing.md,
  },
  deleteLayer: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: DELETE_BTN_WIDTH,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteBtn: {
    flex: 1,
    width: '100%',
    backgroundColor: colors.brick,
    borderTopRightRadius: radii.card,
    borderBottomRightRadius: radii.card,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  deleteText: {
    fontFamily: fonts.ui,
    fontSize: 12,
    color: colors.paperCream,
    letterSpacing: 0.3,
  },
  cardLayer: {
    // 覆盖 delete 层
  },
  packCard: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.paperCream,
    borderRadius: radii.card,
    padding: spacing.md,
  },
  packCover: { width: 64, height: 64, borderRadius: radii.card },
  packCoverPlaceholder: { backgroundColor: colors.paperMain, alignItems: 'center', justifyContent: 'center' },
  packCoverPlaceholderText: { fontFamily: fonts.hero, fontSize: 28, color: colors.brick },
  packInfo: { flex: 1, gap: 2 },
  packPodcast: { fontFamily: fonts.ui, fontSize: 11, color: colors.inkSecondary, letterSpacing: 0.3 },
  packTitle: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.inkPrimary },
  packOneSentence: { fontFamily: fonts.bodyItalic, fontStyle: 'italic', fontSize: 12, lineHeight: 18, color: colors.inkSecondary, marginTop: 4 },
  packMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6, flexWrap: 'wrap' },
  packMetaText: { fontFamily: fonts.ui, fontSize: 11, color: colors.inkSecondary },
  packMetaSep: { fontFamily: fonts.ui, fontSize: 11, color: colors.paperDark },
});
