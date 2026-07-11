// RecallPanel — #77 主动回忆 · 带问题进入 · 费曼复述
// 学习科学: 回忆(retrieval)比重读记得更牢。合上原文自己答, 再对照参考答案, 最后自评。
// 费曼: 用一句话给朋友讲清楚 = 检验真懂。
// 作答/自评/复述都持久化 (POST /api/packs/:id/recall)，退出再进能看到自己上次写的。
import React, { useState } from 'react';
import { View, Text, Pressable, TextInput, StyleSheet } from 'react-native';
import { colors, fonts, spacing, radii } from '@/constants/theme';
import { apiFetch } from '@/lib/api';
import type { RecallQuestion } from '@/types/pack';

type Rating = 'got' | 'fuzzy' | 'blank';
const RATINGS: { key: Rating; label: string; color: string }[] = [
  { key: 'got', label: '记得', color: colors.olive },
  { key: 'fuzzy', label: '模糊', color: colors.yolk },
  { key: 'blank', label: '不记得', color: colors.brick },
];

function QuestionItem({ packId, q }: { packId: number; q: RecallQuestion }) {
  const [answer, setAnswer] = useState(q.userAnswer || '');
  const [rating, setRating] = useState<Rating | null>((q.selfRating as Rating) || null);
  const [revealed, setRevealed] = useState(!!q.userAnswer);   // 之前答过就默认展开参考

  const save = (nextAnswer: string, nextRating: Rating | null) => {
    apiFetch(`/api/packs/${packId}/recall`, {
      method: 'POST',
      body: JSON.stringify({ kind: 'question', refKey: String(q.position), answer: nextAnswer, selfRating: nextRating }),
    }).catch(() => {});
  };

  return (
    <View style={styles.qItem}>
      <Text style={styles.qText}>{q.question}</Text>
      <TextInput
        style={styles.input}
        value={answer}
        onChangeText={setAnswer}
        onBlur={() => save(answer, rating)}
        placeholder="先自己回忆着答，别翻原文…"
        placeholderTextColor={colors.inkSecondary}
        multiline
        testID={`recall-answer-${q.position}`}
      />
      {!revealed ? (
        <Pressable
          onPress={() => setRevealed(true)}
          style={styles.revealBtn}
          testID={`recall-reveal-${q.position}`}
        >
          <Text style={styles.revealBtnText}>看参考答案</Text>
        </Pressable>
      ) : (
        <View style={styles.modelBox}>
          <Text style={styles.modelLabel}>参考答案</Text>
          <Text style={styles.modelText}>{q.modelAnswer || '（本题暂无参考）'}</Text>
          <View style={styles.ratingRow}>
            {RATINGS.map(r => {
              const active = rating === r.key;
              return (
                <Pressable
                  key={r.key}
                  onPress={() => { const nr = active ? null : r.key; setRating(nr); save(answer, nr); }}
                  style={[styles.ratingBtn, active && { backgroundColor: r.color }]}
                  testID={`recall-rate-${q.position}-${r.key}`}
                >
                  <Text style={[styles.ratingText, active && { color: colors.paperCream }]}>{r.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
}

export function RecallPanel({
  packId,
  questions,
  feynmanSummary,
}: {
  packId: number;
  questions: RecallQuestion[];
  feynmanSummary?: string;
}) {
  const [feynman, setFeynman] = useState(feynmanSummary || '');
  const saveFeynman = () => {
    apiFetch(`/api/packs/${packId}/recall`, {
      method: 'POST',
      body: JSON.stringify({ kind: 'feynman', refKey: 'summary', answer: feynman }),
    }).catch(() => {});
  };

  // VU-d 闭环: 统计上次自评"不记得/模糊"的题, 提示用户再练 (回忆是持续的, 不是一次性)
  const weak = questions.filter(q => q.selfRating === 'blank' || q.selfRating === 'fuzzy').length;
  const mastered = questions.filter(q => q.selfRating === 'got').length;

  return (
    <View style={styles.block}>
      <Text style={styles.sectionTitle}>主动回忆 · {questions.length}</Text>
      <Text style={styles.intro}>合上原文，先自己答一遍——回忆比重读记得更牢。</Text>
      {weak > 0 ? (
        <View style={styles.weakBanner}>
          <Text style={styles.weakBannerText}>上次还有 {weak} 题没答稳，先从它们练起 →</Text>
        </View>
      ) : mastered === questions.length && questions.length > 0 ? (
        <View style={styles.weakBanner}>
          <Text style={styles.weakBannerText}>这集你都答稳了 ✓ 隔几天再回来测一次会记得更牢</Text>
        </View>
      ) : null}
      <View style={styles.list}>
        {/* 待巩固(blank/fuzzy)排前, 已掌握(got)排后, 未答保持原序 */}
        {[...questions]
          .map((q, i) => ({ q, i }))
          .sort((a, b) => {
            const rank = (r?: string | null) => (r === 'blank' ? 0 : r === 'fuzzy' ? 1 : r == null ? 2 : 3);
            return rank(a.q.selfRating) - rank(b.q.selfRating);
          })
          .map(({ q, i }) => (
            <QuestionItem key={q.id ?? i} packId={packId} q={q} />
          ))}
      </View>

      {/* 费曼复述 */}
      <View style={styles.feynmanBox}>
        <Text style={styles.feynmanLabel}>费曼复述</Text>
        <Text style={styles.feynmanHint}>用一句话给朋友讲清楚这集，讲得出才是真懂。</Text>
        <TextInput
          style={styles.input}
          value={feynman}
          onChangeText={setFeynman}
          onBlur={saveFeynman}
          placeholder="这集其实在讲……"
          placeholderTextColor={colors.inkSecondary}
          multiline
          testID="recall-feynman"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { marginTop: spacing.lg, backgroundColor: colors.paperCream, borderRadius: radii.card, padding: spacing.md },
  sectionTitle: { fontFamily: fonts.hero, fontSize: 24, color: colors.inkPrimary, marginTop: spacing.sm },
  intro: { fontFamily: fonts.body, fontSize: 13, color: colors.inkSecondary, lineHeight: 20, marginTop: 4 },
  weakBanner: { marginTop: spacing.sm, backgroundColor: colors.paperMain, borderRadius: radii.card, paddingHorizontal: spacing.sm, paddingVertical: 8 },
  weakBannerText: { fontFamily: fonts.ui, fontSize: 12, color: colors.inkPrimary, letterSpacing: 0.2 },
  list: { marginTop: spacing.sm, gap: spacing.md },
  qItem: { borderTopWidth: 1, borderTopColor: colors.paperDark, paddingTop: spacing.sm, gap: 8 },
  qText: { fontFamily: fonts.ui, fontSize: 15, color: colors.inkPrimary, lineHeight: 22 },
  input: {
    fontFamily: fonts.body, fontSize: 14, color: colors.inkPrimary, lineHeight: 21,
    backgroundColor: colors.paperMain, borderRadius: radii.card, borderWidth: 1, borderColor: colors.paperDark,
    paddingHorizontal: spacing.sm, paddingVertical: 8, minHeight: 60, textAlignVertical: 'top',
  },
  revealBtn: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: colors.paperDark },
  revealBtnText: { fontFamily: fonts.ui, fontSize: 12, color: colors.inkSecondary, letterSpacing: 0.2 },
  modelBox: { backgroundColor: colors.paperMain, borderRadius: radii.card, padding: spacing.sm, gap: 6 },
  modelLabel: { fontFamily: fonts.ui, fontSize: 10, color: colors.inkSecondary, letterSpacing: 0.6, textTransform: 'uppercase', opacity: 0.7 },
  modelText: { fontFamily: fonts.body, fontSize: 13, color: colors.inkPrimary, lineHeight: 20 },
  ratingRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  ratingBtn: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: colors.paperDark },
  ratingText: { fontFamily: fonts.ui, fontSize: 13, color: colors.inkPrimary },
  feynmanBox: { marginTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.paperDark, paddingTop: spacing.md, gap: 6 },
  feynmanLabel: { fontFamily: fonts.ui, fontSize: 13, color: colors.inkPrimary, fontWeight: '600' as const, letterSpacing: 0.3 },
  feynmanHint: { fontFamily: fonts.body, fontSize: 12, color: colors.inkSecondary, lineHeight: 18 },
});
