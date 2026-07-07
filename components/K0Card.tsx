// K0Card — D4 day/night flip card (Sprint 15+).
// Fuses D4 demo (day sun / night moon flip) into K0 拼布撕纸风.
// - Front (day): paperCream + torn sun + insight (Bagel Fat One) + quote (Fraunces italic) + timestamp
// - Back (night): paperDark + torn moon + torn stars + quote 大字 + context + podcast source + ★
// - Flip: react-native-reanimated rotateY spring + expo-haptics medium impact
// - Used by: Review (variant=review), Episode (variant=episode), Library detail (variant=library)
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolate,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { colors, fonts, spacing, radii, typography, lineHeight } from '@/constants/theme';
import { TornSun } from '@/components/illustrations/TornSun';
import { TornMoon } from '@/components/illustrations/TornMoon';
import { TornStar } from '@/components/illustrations/TornStar';

export type K0CardData = {
  quote?: string;
  insight?: string;
  title?: string;      // 老 pack 兜底
  context?: string;
  explanation?: string; // 老 pack 兜底
  timestamp?: number;
  sourceTimestamp?: number;
  type?: string;
  starred?: boolean;
  podcastName?: string;
};

export type K0CardVariant = 'review' | 'episode' | 'library';

export type K0CardProps = {
  card: K0CardData;
  variant?: K0CardVariant;
  flippable?: boolean;
  /** external flip control (Review 页 rating 联动) */
  flipped?: boolean;
  onFlip?: (isBack: boolean) => void;
  onStar?: () => void;
  onDelete?: () => void;
  onTimestampPress?: () => void;
};

const CARD_TYPE_COLORS: Record<string, string> = {
  opinion: colors.brick,
  method: colors.sapphire,
  case: colors.brown,
  reflection: colors.rose,
  action: colors.olive,
};

const CARD_TYPE_LABELS: Record<string, string> = {
  opinion: '观点',
  method: '方法',
  case: '案例',
  reflection: '洞察',
  action: '行动',
};

function fmtTs(sec?: number): string {
  if (!sec || sec <= 0) return '';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function K0Card({
  card,
  variant = 'episode',
  flippable = true,
  flipped: externalFlipped,
  onFlip,
  onStar,
  onDelete,
  onTimestampPress,
}: K0CardProps) {
  const [internalFlipped, setInternalFlipped] = useState(false);
  const controlled = externalFlipped !== undefined;
  const isFlipped = controlled ? !!externalFlipped : internalFlipped;

  const progress = useSharedValue(isFlipped ? 1 : 0);

  useEffect(() => {
    progress.value = withSpring(isFlipped ? 1 : 0, {
      damping: 14,
      stiffness: 110,
      mass: 0.9,
    });
  }, [isFlipped, progress]);

  const handleFlip = useCallback(() => {
    if (!flippable) return;
    // haptic
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {
      // web / unsupported — silently ignore
    }
    const next = !isFlipped;
    if (!controlled) setInternalFlipped(next);
    if (onFlip) onFlip(next);
  }, [flippable, isFlipped, controlled, onFlip]);

  const frontAnimStyle = useAnimatedStyle(() => {
    const rotate = interpolate(progress.value, [0, 1], [0, 180]);
    const opacity = progress.value < 0.5 ? 1 : 0;
    return {
      transform: [{ perspective: 1000 }, { rotateY: `${rotate}deg` }],
      opacity,
    };
  });

  const backAnimStyle = useAnimatedStyle(() => {
    const rotate = interpolate(progress.value, [0, 1], [180, 360]);
    const opacity = progress.value >= 0.5 ? 1 : 0;
    return {
      transform: [{ perspective: 1000 }, { rotateY: `${rotate}deg` }],
      opacity,
    };
  });

  const quote = card.quote || '';
  const insight = card.insight || card.title || '';
  const context = card.context || card.explanation || '';
  const ts = card.timestamp ?? card.sourceTimestamp ?? 0;
  const typeKey = card.type || '';
  const typeColor = CARD_TYPE_COLORS[typeKey] || colors.olive;
  const typeLabel = CARD_TYPE_LABELS[typeKey] || '';

  // 微旋转手工感（不同 variant 微调）
  const frontRotation = variant === 'library' ? '-0.4deg' : '-0.5deg';
  const backRotation = variant === 'library' ? '0.6deg' : '0.8deg';

  return (
    <View style={styles.wrap}>
      {/* Front — 白天面 */}
      <Animated.View
        style={[
          styles.face,
          styles.faceDay,
          { transform: [{ rotate: frontRotation }] },
          frontAnimStyle,
        ]}
        pointerEvents={isFlipped ? 'none' : 'auto'}
      >
        <Pressable
          onPress={handleFlip}
          style={styles.pressArea}
          accessibilityRole="button"
          accessibilityLabel={flippable ? '翻到夜晚' : '卡片正面'}
        >
          {/* type dot 左上角 */}
          {typeKey ? (
            <View style={styles.typeDotRow}>
              <View style={[styles.typeDot, { backgroundColor: typeColor }]} />
              {typeLabel ? <Text style={styles.typeLabel}>{typeLabel}</Text> : null}
            </View>
          ) : null}

          {/* torn sun 右上角 */}
          <View style={styles.sunAnchor} pointerEvents="none">
            <TornSun size={64} />
          </View>

          {/* insight 主标题 */}
          <View style={styles.dayBody}>
            {insight ? (
              <Text style={styles.insight} numberOfLines={3}>
                {insight}
              </Text>
            ) : null}
            {quote ? (
              <View style={styles.quoteBlockDay}>
                <View style={styles.quoteBar} />
                <Text style={styles.quoteTextDay} numberOfLines={variant === 'library' ? 6 : 4}>
                  {quote}
                </Text>
              </View>
            ) : null}
          </View>

          {/* 底部：timestamp + flip hint */}
          <View style={styles.dayFooter}>
            {ts > 0 ? (
              <Pressable
                onPress={(e) => {
                  e.stopPropagation();
                  onTimestampPress?.();
                }}
                disabled={!onTimestampPress}
                hitSlop={6}
                style={styles.timestampPill}
                accessibilityRole="button"
                accessibilityLabel={`从 ${fmtTs(ts)} 播放`}
              >
                <Text style={styles.timestampText}>{fmtTs(ts)} ▶</Text>
              </Pressable>
            ) : <View />}
            {flippable ? (
              <Text style={styles.flipHint}>↻ 翻到夜晚</Text>
            ) : null}
          </View>
        </Pressable>
      </Animated.View>

      {/* Back — 夜晚面 */}
      <Animated.View
        style={[
          styles.face,
          styles.faceNight,
          styles.faceAbsolute,
          { transform: [{ rotate: backRotation }] },
          backAnimStyle,
        ]}
        pointerEvents={isFlipped ? 'auto' : 'none'}
      >
        <Pressable
          onPress={handleFlip}
          style={styles.pressArea}
          accessibilityRole="button"
          accessibilityLabel="翻回白天"
        >
          {/* torn moon 右上 */}
          <View style={styles.moonAnchor} pointerEvents="none">
            <TornMoon size={68} />
          </View>

          {/* torn stars 散布 */}
          <View style={[styles.starAnchor, { top: 18, left: 22 }]} pointerEvents="none">
            <TornStar size={14} color={colors.yolk} />
          </View>
          <View style={[styles.starAnchor, { top: 58, left: 100 }]} pointerEvents="none">
            <TornStar size={10} color={colors.olive} />
          </View>
          <View style={[styles.starAnchor, { bottom: 90, left: 42 }]} pointerEvents="none">
            <TornStar size={11} color={colors.rose} />
          </View>
          <View style={[styles.starAnchor, { bottom: 70, right: 20 }]} pointerEvents="none">
            <TornStar size={9} color={colors.yolk} />
          </View>

          {/* Body */}
          <View style={styles.nightBody}>
            {quote ? (
              <Text style={styles.quoteTextNight} numberOfLines={variant === 'library' ? 8 : 5}>
                “{quote}”
              </Text>
            ) : null}
            {context ? (
              <Text style={styles.contextNight} numberOfLines={variant === 'library' ? 8 : 4}>
                {context}
              </Text>
            ) : null}
          </View>

          {/* 底部：podcast 源 + star + flip hint */}
          <View style={styles.nightFooter}>
            <Text style={styles.podcastSource} numberOfLines={1}>
              {card.podcastName ? `来自 ${card.podcastName}` : ''}
            </Text>
            <View style={styles.nightFooterActions}>
              {onStar ? (
                <Pressable
                  onPress={(e) => {
                    e.stopPropagation();
                    onStar();
                  }}
                  hitSlop={8}
                  style={styles.starBtn}
                  accessibilityRole="button"
                  accessibilityLabel={card.starred ? '取消收藏' : '收藏'}
                >
                  <Text style={[styles.starIcon, card.starred && styles.starIconOn]}>
                    {card.starred ? '★' : '☆'}
                  </Text>
                </Pressable>
              ) : null}
              {onDelete ? (
                <Pressable
                  onPress={(e) => {
                    e.stopPropagation();
                    onDelete();
                  }}
                  hitSlop={8}
                  style={styles.starBtn}
                  accessibilityRole="button"
                  accessibilityLabel="删除卡片"
                >
                  <Text style={styles.deleteIcon}>×</Text>
                </Pressable>
              ) : null}
              {flippable ? (
                <Text style={styles.flipHintNight}>↺ 白天</Text>
              ) : null}
            </View>
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const CARD_MIN_HEIGHT = 260;

const styles = StyleSheet.create({
  wrap: {
    minHeight: CARD_MIN_HEIGHT,
    marginBottom: spacing.md,
  },
  face: {
    borderRadius: radii.card,
    overflow: 'hidden',
    minHeight: CARD_MIN_HEIGHT,
    // 撕纸阴影零偏移
    shadowColor: colors.inkPrimary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 3,
    backfaceVisibility: 'hidden',
  },
  faceAbsolute: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  faceDay: {
    backgroundColor: colors.paperCream,
  },
  faceNight: {
    backgroundColor: colors.paperDark,
  },
  pressArea: {
    flex: 1,
    padding: spacing.lg,
    minHeight: CARD_MIN_HEIGHT,
    justifyContent: 'space-between',
  },
  // Type dot
  typeDotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  typeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  typeLabel: {
    fontFamily: fonts.ui,
    fontSize: typography.uiTiny,
    color: colors.inkSecondary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  // Sun/Moon anchors
  sunAnchor: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  moonAnchor: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  starAnchor: {
    position: 'absolute',
  },
  // Day body
  dayBody: {
    flex: 1,
    paddingRight: 60, // avoid sun
    gap: spacing.sm,
  },
  insight: {
    fontFamily: fonts.hero,
    fontSize: 19,
    lineHeight: 26,
    color: colors.inkPrimary,
    letterSpacing: -0.3,
  },
  quoteBlockDay: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  quoteBar: {
    width: 3,
    backgroundColor: colors.brick,
    borderRadius: 2,
  },
  quoteTextDay: {
    flex: 1,
    fontFamily: fonts.bodyItalic,
    fontStyle: 'italic',
    fontSize: typography.body,
    lineHeight: lineHeight.body,
    color: colors.inkPrimary,
  },
  dayFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  timestampPill: {
    backgroundColor: colors.paperMain,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: 999,
  },
  timestampText: {
    fontFamily: fonts.ui,
    fontSize: typography.uiSmall,
    color: colors.brick,
    letterSpacing: 0.4,
  },
  flipHint: {
    fontFamily: fonts.ui,
    fontSize: typography.uiSmall,
    color: colors.inkSecondary,
    opacity: 0.65,
    letterSpacing: 0.3,
  },
  // Night
  nightBody: {
    flex: 1,
    paddingRight: 60,
    paddingTop: spacing.sm,
    gap: spacing.md,
  },
  quoteTextNight: {
    fontFamily: fonts.bodyItalic,
    fontStyle: 'italic',
    fontSize: 17,
    lineHeight: 26,
    color: colors.inkPrimary,
    letterSpacing: -0.1,
  },
  contextNight: {
    fontFamily: fonts.body,
    fontSize: typography.bodySmall,
    lineHeight: lineHeight.bodySmall,
    color: colors.inkSecondary,
  },
  nightFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  podcastSource: {
    flex: 1,
    fontFamily: fonts.ui,
    fontSize: typography.uiTiny,
    color: colors.inkSecondary,
    letterSpacing: 0.4,
    opacity: 0.8,
  },
  nightFooterActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  starBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: 'rgba(245, 235, 211, 0.6)',
  },
  starIcon: {
    fontSize: 18,
    color: colors.inkSecondary,
    lineHeight: 20,
  },
  starIconOn: {
    color: colors.brick,
  },
  deleteIcon: {
    fontSize: 20,
    color: colors.inkSecondary,
    lineHeight: 20,
  },
  flipHintNight: {
    fontFamily: fonts.ui,
    fontSize: typography.uiSmall,
    color: colors.inkSecondary,
    opacity: 0.65,
    letterSpacing: 0.3,
  },
});
