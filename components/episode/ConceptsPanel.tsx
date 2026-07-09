// ConceptsPanel — 关键概念解释器面板 (小白解释 + 原文语境 + 延伸理解)
// 原 episode 内联, Phase F 抽出。sectionTitle/conceptLabel/conceptText 从 episode 复制一份
// (episode 主组件仍各自使用同名样式, 此处 scoped 独立)。
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, fonts, spacing, radii } from '@/constants/theme';
import { fmtTs } from '@/lib/format';
import { PlayIconTorn } from '@/components/icons/PlayIconTorn';
import type { Concept } from '@/types/pack';

export function ConceptsPanel({
  concepts,
  audioUrl,
  onPlay,
}: {
  concepts: Concept[];
  audioUrl?: string | null;
  onPlay?: (sec: number) => void;
}) {
  return (
    <View style={styles.conceptsBlock}>
      <Text style={styles.sectionTitle}>关键概念 · {concepts.length}</Text>
      <View style={styles.conceptsList}>
        {concepts.map((c, i) => (
          <View key={i} style={styles.conceptItem}>
            <Text style={styles.conceptTerm}>{c.term}</Text>
            <View style={styles.conceptDetail}>
              <Text style={styles.conceptLabel}>小白解释</Text>
              <Text style={styles.conceptText}>{c.plain}</Text>
              {c.context?.text ? (
                <>
                  <Text style={styles.conceptLabel}>原文语境</Text>
                  {c.context.timestamp && c.context.timestamp > 0 ? (
                    <Pressable
                      onPress={() => { if (audioUrl && onPlay) onPlay(c.context!.timestamp!); }}
                      disabled={!audioUrl}
                      hitSlop={4}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}
                    >
                      <Text style={[styles.conceptText, audioUrl ? { color: colors.inkPrimary, fontWeight: '600' as const } : null]}>
                        [{fmtTs(c.context.timestamp)}]
                      </Text>
                      {audioUrl ? <PlayIconTorn size={11} color={colors.inkPrimary} /> : null}
                      <Text style={styles.conceptText}> 「{c.context.text}」</Text>
                    </Pressable>
                  ) : (
                    <Text style={styles.conceptText}>「{c.context.text}」</Text>
                  )}
                </>
              ) : null}
              {c.related ? (
                <>
                  <Text style={styles.conceptLabel}>延伸理解</Text>
                  <Text style={styles.conceptText}>{c.related}</Text>
                </>
              ) : null}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  conceptsBlock: { marginTop: spacing.lg, backgroundColor: colors.paperCream, borderRadius: radii.card, padding: spacing.md },
  sectionTitle: { fontFamily: fonts.hero, fontSize: 24, color: colors.inkPrimary, marginTop: spacing.sm },
  conceptsList: { marginTop: spacing.sm, gap: spacing.xs },
  conceptItem: { borderTopWidth: 1, borderTopColor: colors.paperDark, paddingTop: spacing.sm },
  conceptTerm: { fontFamily: fonts.ui, fontSize: 15, color: colors.inkPrimary, flex: 1 },
  conceptDetail: { marginTop: spacing.xs, gap: 4 },
  conceptLabel: { fontFamily: fonts.ui, fontSize: 10, color: colors.inkSecondary, letterSpacing: 0.6, marginTop: 6, textTransform: 'uppercase', opacity: 0.7 },
  conceptText: { fontFamily: fonts.body, fontSize: 13, color: colors.inkPrimary, lineHeight: 20 },
});
