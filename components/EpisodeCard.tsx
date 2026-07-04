// EpisodeCard — Sprint 2 STORY-00010
// Torn-paper style card showing imported episode metadata
import React, { useEffect, useRef } from 'react';
import { View, Text, Image, Pressable, StyleSheet, Animated } from 'react-native';
import { colors, fonts, spacing, radii } from '@/constants/theme';
import type { EpisodeObject } from '@/lib/api';

type Props = {
  episode: EpisodeObject;
  onDismiss?: () => void;
};

/** Format seconds → "H:MM" or "MM:SS" */
function formatDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function languageLabel(lang: string): string {
  if (lang === 'en') return '英语';
  if (lang === 'zh') return '中文';
  return '未识别';
}

export function EpisodeCard({ episode, onDismiss }: Props) {
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  const dur = formatDuration(episode.duration);
  const langText = languageLabel(episode.language);

  return (
    <Animated.View style={[styles.card, { opacity: fadeAnim }]}>
      {/* Dismiss button */}
      <Pressable
        style={styles.dismissBtn}
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel="关闭卡片"
        hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
      >
        <Text style={styles.dismissText}>×</Text>
      </Pressable>

      <View style={styles.row}>
        {/* Cover thumbnail */}
        {episode.coverUrl ? (
          <Image
            source={{ uri: episode.coverUrl }}
            style={styles.cover}
            accessibilityLabel="封面"
          />
        ) : (
          <View style={[styles.cover, styles.coverFallback]}>
            <Text style={styles.coverFallbackText}>🎙</Text>
          </View>
        )}

        <View style={styles.meta}>
          {/* Title */}
          <Text style={styles.title} numberOfLines={2}>{episode.title}</Text>

          {/* Channel */}
          {episode.channel ? (
            <Text style={styles.channel} numberOfLines={1}>{episode.channel}</Text>
          ) : null}

          {/* Tags row: duration + language */}
          <View style={styles.tagsRow}>
            {dur ? (
              <View style={styles.tag}>
                <Text style={styles.tagText}>{dur}</Text>
              </View>
            ) : null}
            <View style={styles.tag}>
              <Text style={styles.tagText}>{langText}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Next step placeholder */}
      <Text style={styles.nextStep}>下一步：生成学习包（即将上线）</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.paperCream,
    borderRadius: radii.card,
    padding: spacing.lg,
    marginTop: spacing.lg,
    // Torn-paper shadow
    shadowColor: colors.inkPrimary,
    shadowOffset: { width: 2, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 0,
    elevation: 3,
    borderWidth: 1.5,
    borderColor: colors.paperDark,
    position: 'relative',
  },
  dismissBtn: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.paperDark,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  dismissText: {
    fontFamily: fonts.ui,
    fontSize: 16,
    color: colors.inkSecondary,
    lineHeight: 20,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    marginRight: spacing.xl, // avoid dismiss button
  },
  cover: {
    width: 72,
    height: 72,
    borderRadius: radii.card,
    flexShrink: 0,
  },
  coverFallback: {
    backgroundColor: colors.paperDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverFallbackText: {
    fontSize: 28,
  },
  meta: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 20,
    color: colors.inkPrimary,
    fontWeight: '600',
  },
  channel: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
    color: colors.inkSecondary,
  },
  tagsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
    flexWrap: 'wrap',
  },
  tag: {
    backgroundColor: colors.white,
    borderRadius: radii.bubble,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  tagText: {
    fontFamily: fonts.ui,
    fontSize: 11,
    color: colors.inkSecondary,
  },
  nextStep: {
    fontFamily: fonts.bodyItalic,
    fontStyle: 'italic',
    fontSize: 12,
    color: colors.inkSecondary,
    marginTop: spacing.md,
    textAlign: 'center',
    opacity: 0.7,
  },
});
