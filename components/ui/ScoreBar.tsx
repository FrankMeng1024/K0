// 统一价值分进度条 — 原 snapshot(function ScoreBar) + episode(内联 scoreBar*) 两套 (Phase B 统一)
// 采用 snapshot 版为准视觉 (track 高 8 / 亮底 cream / label body 13 / num ui 12 / rationale 斜体)
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts, spacing } from '@/constants/theme';

export function ScoreBar({
  label,
  score,
  color,
  rationale,
}: {
  label: string;
  score: number;
  color: string;
  rationale?: string;
}) {
  const pct = Math.max(0, Math.min(10, score)) * 10;
  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Text style={styles.label}>{label}</Text>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${pct}%`, backgroundColor: color }]} />
        </View>
        <Text style={styles.score}>{score}</Text>
      </View>
      {rationale ? <Text style={styles.rationale}>{rationale}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  label: { fontFamily: fonts.body, fontSize: 13, color: colors.inkPrimary, width: 72 },
  track: { flex: 1, height: 8, backgroundColor: colors.paperCream, borderRadius: 4, overflow: 'hidden' },
  fill: { height: '100%' },
  score: { fontFamily: fonts.ui, fontSize: 12, color: colors.inkSecondary, width: 22, textAlign: 'right' },
  rationale: {
    fontFamily: fonts.bodyItalic,
    fontStyle: 'italic',
    fontSize: 11,
    color: colors.inkSecondary,
    marginTop: 4,
    marginLeft: 80,
    opacity: 0.8,
  },
});
