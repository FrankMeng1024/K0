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
import { CARD_TYPE_COLORS, CARD_TYPE_LABELS } from '@/constants/cardTypes';
import { fmtTs } from '@/lib/format';
import { TrashIconTorn } from '@/components/icons/TrashIconTorn';
// Sprint 16 R1: 去太阳月亮，纯底色区分日夜（Frank 1B）

export type K0CardData = {
  quote?: string;
  quoteVerified?: boolean;  // R25: false=AI改写非逐字原话, 不打引号
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
  // R25 Bug#0: 只有经转录校验的逐字原话才打引号当"原话"; 未校验(AI改写)不打引号, 避免冒充嘉宾原话
  const quoteVerified = card.quoteVerified !== false;
  const quoteDisplay = quote ? (quoteVerified ? `\u201c${quote}\u201d` : quote) : '';
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
          {/* type 标签（Sprint 16: 无 dot，纯文字 uppercase） */}
          {typeKey && typeLabel ? (
            <View style={styles.typeDotRow}>
              <Text style={[styles.typeLabel, { color: typeColor }]}>{typeLabel}</Text>
            </View>
          ) : null}

          {/* Sprint 16 R1-4: 去太阳（Frank: 太丑 + 1B 纯底色区分日夜） */}

          {/* insight 主标题 */}
          <View style={styles.dayBody}>
            {insight ? (
              <Text style={styles.insight} numberOfLines={3}>
                {insight}
              </Text>
            ) : null}
            {quote ? (
              <Text style={styles.quoteTextDay} numberOfLines={variant === 'library' ? 6 : 4}>
                {quoteDisplay}
              </Text>
            ) : (
              // VU-c: 无 quote = 框架卡(AI 跨段提炼), 标记以区别于原话卡, 不让用户误以为漏打引号
              <View style={styles.aiChip}>
                <Text style={styles.aiChipText}>AI 提炼</Text>
              </View>
            )}
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
              <Text style={styles.flipHint}>↻ 翻面</Text>
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
          accessibilityLabel="翻回正面"
        >
          {/* Sprint 16 R1-4: 去月亮 + 星星（Frank 1B 纯底色区分日夜） */}

          {/* Body */}
          <View style={styles.nightBody}>
            {quote ? (
              <Text style={styles.quoteTextNight} numberOfLines={variant === 'library' ? 8 : 5}>
                {quoteDisplay}
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
                  {/* Sprint 16 R1-4: × → 撕纸垃圾桶（Frank 之前反馈过） */}
                  <TrashIconTorn size={18} color={colors.inkSecondary} />
                </Pressable>
              ) : null}
              {flippable ? (
                <Text style={styles.flipHintNight}>↺ 正面</Text>
              ) : null}
            </View>
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const CARD_MIN_HEIGHT = 320;

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
  // Type label（Sprint 16: 无 dot）
  typeDotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  typeLabel: {
    fontFamily: fonts.ui,
    fontSize: typography.uiTiny,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    fontWeight: '600' as const,
  },
  // Day body
  dayBody: {
    flex: 1,
    gap: spacing.sm,
  },
  aiChip: {
    alignSelf: 'flex-start',
    backgroundColor: colors.paperDark,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  aiChipText: {
    fontFamily: fonts.ui,
    fontSize: 10,
    color: colors.inkSecondary,
    letterSpacing: 0.3,
  },
  insight: {
    fontFamily: fonts.hero,
    fontSize: 19,
    lineHeight: 26,
    color: colors.inkPrimary,
    letterSpacing: -0.3,
  },
  quoteTextDay: {
    fontFamily: fonts.bodyItalic,
    fontStyle: 'italic',
    fontSize: typography.body,
    lineHeight: lineHeight.body,
    // Sprint 16 R1 iterate: quote 是主视觉不该灰，改回 inkPrimary
    color: colors.inkPrimary,
    marginTop: spacing.sm,
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
    // Sprint 16 R1: brick red → inkPrimary 中性色（Frank: 2A 时间戳去红）
    color: colors.inkPrimary,
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
  flipHintNight: {
    fontFamily: fonts.ui,
    fontSize: typography.uiSmall,
    color: colors.inkSecondary,
    opacity: 0.65,
    letterSpacing: 0.3,
  },
});
