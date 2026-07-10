// SnapshotCard — 学习包快照区 (one-sentence + core points + 价值分 + 成本 + 适合谁 + 值得听/跳过)
// Frank: 学习包共有部分 = 快照页。原 episode 内联 (~140 行), Phase F 抽出。
// 唯一源, 未来 snapshot 页也可 import 复用。
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, fonts, spacing, radii } from '@/constants/theme';
import { fmtTs } from '@/lib/format';
import { ScoreBar } from '@/components/ui/ScoreBar';
import { PlayIconTorn } from '@/components/icons/PlayIconTorn';
import type { SnapshotObject } from '@/types/pack';

export function SnapshotCard({
  snapshot,
  audioUrl,
  onPlay,
}: {
  snapshot: SnapshotObject;
  audioUrl?: string | null;
  onPlay?: (sec: number) => void;
}) {
  const [expandedIdx, setExpandedIdx] = React.useState<number | null>(null);
  return (
    <View testID="snapshot-card">
      {/* one-sentence 独立 paperCream 卡 */}
      <View style={styles.oneSentenceBlock}>
        <Text style={styles.oneSentenceText} testID="snapshot-one-sentence">
          {snapshot.oneSentence}
        </Text>
      </View>

      {/* Core points */}
      <View style={styles.corePointsBlock}>
        {snapshot.corePoints.map((cp, i) => (
          <View key={i} style={styles.corePointRow}>
            <Text style={styles.corePointBullet}>{i + 1}</Text>
            <Text style={styles.corePointText}>{cp.point}</Text>
          </View>
        ))}
      </View>

      {/* Value scores — 共享 ScoreBar */}
      <View style={styles.scoresBlock}>
        {(['density', 'novelty', 'actionability'] as const).map((k) => {
          const val = snapshot.valueScore[k];
          const label = k === 'density' ? '信息密度' : k === 'novelty' ? '新鲜程度' : '可行动性';
          const barColor = k === 'density' ? colors.brick : k === 'novelty' ? colors.olive : colors.yolk;
          return (
            <ScoreBar
              key={k}
              label={label}
              score={val}
              color={barColor}
              rationale={snapshot.valueScoreRationale?.[k]}
            />
          );
        })}
      </View>

      {/* 学习成本 */}
      <View style={styles.costBlock}>
        <Text style={styles.costLabel}>预估</Text>
        <Text style={styles.costMinutes}>{snapshot.estimatedCostMinutes}</Text>
        <Text style={styles.costLabel}>分钟能学完</Text>
      </View>

      {/* 适合谁学 */}
      {snapshot.audience && snapshot.audience.length > 0 ? (
        <View style={styles.audSectionCard}>
          <View style={styles.audSectionLabelRow}>
            <View style={[styles.audSectionDot, { backgroundColor: colors.yolk }]} />
            <Text style={styles.audSectionLabelText}>适合谁学</Text>
          </View>
          <View style={styles.audChipRow}>
            {snapshot.audience.slice(0, 4).map((a, i) => (
              <View key={i} style={styles.audChip}>
                <Text style={styles.audChipText}>{a}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {/* 值得听 */}
      {Array.isArray(snapshot.worthListening) && snapshot.worthListening.length > 0 && (
        <View style={styles.wlSectionCard}>
          <View style={styles.wlSectionLabelRow}>
            <View style={[styles.wlSectionDot, { backgroundColor: colors.olive }]} />
            <Text style={styles.wlSectionLabelText}>值得听的 {snapshot.worthListening.length} 段</Text>
          </View>
          {snapshot.worthListening.map((w: any, i: number) => {
            const startSec = typeof w.startSec === 'number' ? w.startSec : (typeof w.start === 'number' ? w.start : 0);
            const endSec = typeof w.endSec === 'number' ? w.endSec : (typeof w.end === 'number' ? w.end : 0);
            return (
              <Pressable
                key={i}
                style={styles.wlItemBox}
                onPress={() => setExpandedIdx(expandedIdx === i ? null : i)}
              >
                <View style={styles.wlHeadBox}>
                  <Pressable
                    onPress={(e) => {
                      (e as any).stopPropagation?.();
                      if (audioUrl && onPlay) onPlay(startSec);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`从 ${fmtTs(startSec)} 播放`}
                    disabled={!audioUrl}
                    hitSlop={6}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
                  >
                    <Text style={styles.wlTsText}>{fmtTs(startSec)} — {fmtTs(endSec)}</Text>
                    {audioUrl ? <PlayIconTorn size={12} color={colors.inkPrimary} /> : null}
                  </Pressable>
                  <Text style={styles.wlChevText}>{expandedIdx === i ? '▲' : '▼'}</Text>
                </View>
                <Text style={styles.wlReasonText}>{w?.reason || ''}</Text>
                {expandedIdx === i ? (
                  (w.quoteParagraph || w.quote)
                    ? <Text style={styles.wlQuoteText}>{w.quoteParagraph || w.quote}</Text>
                    : <Text style={[styles.wlQuoteText, { opacity: 0.5, fontStyle: 'italic' }]}>（这段原文暂未生成，点上方时间从音频听）</Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      )}

      {/* 可以跳过 */}
      {Array.isArray(snapshot.skippable) && snapshot.skippable.length > 0 && (
        <View style={styles.wlSectionCard}>
          <View style={styles.wlSectionLabelRow}>
            <View style={[styles.wlSectionDot, { backgroundColor: colors.rose }]} />
            <Text style={styles.wlSectionLabelText}>可以跳过 {snapshot.skippable.length} 段</Text>
          </View>
          {snapshot.skippable.map((s: any, i: number) => {
            const startSec = typeof s.startSec === 'number' ? s.startSec : (typeof s.start === 'number' ? s.start : 0);
            const endSec = typeof s.endSec === 'number' ? s.endSec : (typeof s.end === 'number' ? s.end : 0);
            return (
              <View key={i} style={styles.skipItemBox}>
                <Pressable
                  onPress={() => { if (audioUrl && onPlay) onPlay(startSec); }}
                  disabled={!audioUrl}
                  hitSlop={6}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 84 }}
                >
                  <Text style={styles.skipTsText}>{fmtTs(startSec)}—{fmtTs(endSec)}</Text>
                  {audioUrl ? <PlayIconTorn size={11} color={colors.inkSecondary} /> : null}
                </Pressable>
                <Text style={styles.skipReasonText}>{s?.reason || ''}</Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  oneSentenceBlock: {
    backgroundColor: colors.paperCream,
    borderRadius: radii.card,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  oneSentenceText: {
    fontFamily: fonts.hero,
    fontSize: 22,
    lineHeight: 30,
    color: colors.inkPrimary,
    letterSpacing: -0.3,
  },
  corePointsBlock: { gap: spacing.sm },
  corePointRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  corePointBullet: { fontFamily: fonts.ui, fontSize: 13, color: colors.brick, width: 18, textAlign: 'center', marginTop: 2 },
  corePointText: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.inkPrimary, flex: 1 },
  scoresBlock: { gap: spacing.sm },
  costBlock: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  costLabel: { fontFamily: fonts.body, fontSize: 14, color: colors.inkSecondary },
  costMinutes: { fontFamily: fonts.hero, fontSize: 28, color: colors.brick, letterSpacing: -0.3 },
  audSectionCard: {
    backgroundColor: colors.paperCream,
    borderRadius: radii.card,
    padding: spacing.md,
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  audSectionLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  audSectionDot: { width: 10, height: 10, borderRadius: 5 },
  audSectionLabelText: { fontFamily: fonts.ui, fontSize: 13, color: colors.inkPrimary, fontWeight: '600' as const, letterSpacing: 0.3 },
  audChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  audChip: {
    backgroundColor: colors.paperMain,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.paperDark,
  },
  audChipText: { fontFamily: fonts.ui, fontSize: 12, color: colors.inkPrimary },
  wlSectionCard: {
    backgroundColor: colors.paperCream,
    borderRadius: radii.card,
    padding: spacing.md,
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  wlSectionLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  wlSectionDot: { width: 10, height: 10, borderRadius: 5 },
  wlSectionLabelText: { fontFamily: fonts.ui, fontSize: 13, color: colors.inkPrimary, fontWeight: '600' as const, letterSpacing: 0.3 },
  wlItemBox: {
    backgroundColor: colors.paperMain,
    borderRadius: 10,
    padding: spacing.sm,
    marginBottom: 4,
    gap: 4,
  },
  wlHeadBox: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  wlTsText: { fontFamily: fonts.ui, fontSize: 11, color: colors.inkSecondary, letterSpacing: 0.3 },
  wlChevText: { fontFamily: fonts.ui, fontSize: 12, color: colors.inkSecondary },
  wlReasonText: { fontFamily: fonts.body, fontSize: 14, color: colors.inkPrimary, lineHeight: 20 },
  wlQuoteText: {
    fontFamily: fonts.bodyItalic,
    fontStyle: 'italic',
    fontSize: 13,
    color: colors.inkSecondary,
    lineHeight: 20,
    marginTop: 4,
  },
  skipItemBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginBottom: 2,
  },
  skipTsText: { fontFamily: fonts.ui, fontSize: 11, color: colors.inkSecondary, minWidth: 84, letterSpacing: 0.3 },
  skipReasonText: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.inkPrimary,
    flex: 1,
    lineHeight: 19,
    textDecorationLine: 'line-through',
    opacity: 0.55,
  },
});
