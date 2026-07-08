// K0 SwipeablePackCard — Sprint 16 R1-2
// 左滑露出删除按钮 —— 从 PanResponder+Animated 升级到 react-native-gesture-handler + Reanimated
// 手势在原生线程处理，动画在 UI 线程，60fps 丝滑
import React from 'react';
import { View, Text, Pressable, StyleSheet, Image } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { colors, fonts, spacing, radii } from '@/constants/theme';
import { TrashIconTorn } from '@/components/icons/TrashIconTorn';

const DELETE_BTN_WIDTH = 80;
const SPRING_CFG = { damping: 18, stiffness: 180, mass: 0.7 };

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
  const translateX = useSharedValue(0);
  const startX = useSharedValue(0);

  const modeLabel =
    props.mode === 'deep' ? '精学' :
    props.mode === 'quick' ? '速学' :
    props.mode === 'skip' ? '跳过' :
    props.goal === 'quick_understand' ? '快速' :
    props.goal === 'deep_learn' ? '深度' :
    props.goal === 'find_actions' ? '行动' :
    props.goal === 'critical_thinking' ? '批判' :
    props.goal === 'for_work' ? '工作' : (props.goal || '');

  // Sprint 16 R1-2: 原生手势 + UI 线程动画（Reanimated worklet）
  const pan = Gesture.Pan()
    .activeOffsetX([-10, 10]) // 只在水平滑动 >10px 才激活
    .failOffsetY([-15, 15])   // 垂直滑动 >15px 让位给 ScrollView
    .onStart(() => {
      startX.value = translateX.value;
    })
    .onUpdate((e) => {
      // 只允许左滑（负 x），最大 -DELETE_BTN_WIDTH
      const next = Math.max(-DELETE_BTN_WIDTH * 1.2, Math.min(0, startX.value + e.translationX));
      translateX.value = next;
    })
    .onEnd(() => {
      const shouldOpen = translateX.value < -DELETE_BTN_WIDTH / 2;
      translateX.value = withSpring(shouldOpen ? -DELETE_BTN_WIDTH : 0, SPRING_CFG);
    });

  const cardAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const closeAndCall = (cb: () => void) => {
    translateX.value = withSpring(0, SPRING_CFG, () => {
      runOnJS(cb)();
    });
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
      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.cardLayer, cardAnimStyle]}>
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
                {/* Sprint 16 R5: 按 mode 显示不同 meta
                    - deep: X/6 步骤 · Y 卡片
                    - quick: Y 卡片（无步骤）
                    - skip/null: "快照"标签（无步骤无卡片） */}
                {props.mode === 'deep' ? (
                  <>
                    <Text style={styles.packMetaText}>{props.stepsDoneCount ?? 0}/6 步骤</Text>
                    <Text style={styles.packMetaSep}>·</Text>
                    <Text style={styles.packMetaText}>{props.cardsCount ?? 0} 卡片</Text>
                    <Text style={styles.packMetaSep}>·</Text>
                    <Text style={styles.packMetaText}>精学</Text>
                  </>
                ) : props.mode === 'quick' ? (
                  <>
                    <Text style={styles.packMetaText}>{props.cardsCount ?? 0} 卡片</Text>
                    <Text style={styles.packMetaSep}>·</Text>
                    <Text style={styles.packMetaText}>速学</Text>
                  </>
                ) : (
                  <Text style={[styles.packMetaText, { color: colors.brick }]}>快照 · 可升级</Text>
                )}
              </View>
            </View>
          </Pressable>
        </Animated.View>
      </GestureDetector>
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
