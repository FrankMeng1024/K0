// StepRow — 学习路径单步行 (勾选 + 序号 + 标题 + 内容 + 引用)
// 原 episode 内联, Phase F 抽出。stepCitation 从 episode 复制一份 (scoped)。
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, fonts, spacing, radii } from '@/constants/theme';
import { TornCheck } from '@/components/TornCheck';
import type { LearningStep } from '@/types/pack';

// stepIndex 用于左侧彩色条 (6 色轮换)
const STEP_ACCENT_COLORS = [colors.brick, colors.yolk, colors.olive, colors.rose, colors.brown, colors.inkSecondary];

export function StepRow({ step, stepIndex, onToggle }: { step: LearningStep; stepIndex: number; onToggle: () => void }) {
  const accent = STEP_ACCENT_COLORS[stepIndex % STEP_ACCENT_COLORS.length];
  return (
    <Pressable
      style={[styles.stepCard, step.completed && styles.stepCardDone]}
      testID={`step-${step.stepNumber}`}
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityLabel={step.completed ? '标为未完成' : '标为已完成'}
    >
      <View style={[styles.stepAccentBar, { backgroundColor: accent }]} />
      <View style={styles.stepInner}>
        <View style={styles.stepHeader}>
          <TornCheck size={20} checked={step.completed} />
          <Text style={styles.stepNum}>{step.stepNumber}</Text>
          <Text style={[styles.stepTitle, step.completed && styles.stepTitleDone]}>
            {step.title}
          </Text>
        </View>
        <View style={styles.stepBody}>
          <Text style={styles.stepContent}>{step.content}</Text>
          {(step.citations ?? []).length > 0 ? (
            (step.citations ?? []).map((c, i) => {
              if (!c.text && typeof c.timestamp === 'number') {
                const mm = String(Math.floor(c.timestamp / 60)).padStart(2, '0');
                const ss = String(c.timestamp % 60).padStart(2, '0');
                return (
                  <Text key={i} style={styles.stepCitation}>
                    原文 {mm}:{ss} 附近
                  </Text>
                );
              }
              if (!c.text) return null;
              return (
                <Text key={i} style={styles.stepCitation}>「{c.text}」</Text>
              );
            })
          ) : step.aiSynthesized ? (
            // #88: 无真实原文引用 → 明确标注为 AI 综合归纳, 不冒充权威事实
            <View style={styles.aiTag}>
              <Text style={styles.aiTagText}>AI 归纳</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stepCard: {
    flexDirection: 'row',
    backgroundColor: colors.paperCream,
    borderRadius: radii.card,
    overflow: 'hidden',
    alignItems: 'stretch',
  },
  stepAccentBar: { width: 4 },
  stepInner: { flex: 1 },
  stepCardDone: { opacity: 0.75 },
  stepHeader: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, gap: spacing.sm, minHeight: 56 },
  stepNum: { fontFamily: fonts.ui, fontSize: 14, color: colors.brick, width: 18, textAlign: 'center' },
  stepTitle: { fontFamily: fonts.ui, fontSize: 15, color: colors.inkPrimary, flex: 1 },
  stepTitleDone: { color: colors.inkSecondary, textDecorationLine: 'line-through' },
  stepBody: { paddingHorizontal: spacing.md, paddingBottom: spacing.md, gap: spacing.sm },
  stepContent: { fontFamily: fonts.body, fontSize: 14, lineHeight: 22, color: colors.inkPrimary },
  stepCitation: { fontFamily: fonts.bodyItalic, fontStyle: 'italic', fontSize: 13, lineHeight: 20, color: colors.inkSecondary, paddingLeft: spacing.sm, borderLeftWidth: 2, borderLeftColor: colors.paperDark },
  aiTag: { alignSelf: 'flex-start', backgroundColor: colors.paperDark, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  aiTagText: { fontFamily: fonts.ui, fontSize: 10, color: colors.inkSecondary, letterSpacing: 0.3 },
});
