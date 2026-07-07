// K0 KnowledgeCard — Sprint 13 STORY-01301
// 撕纸手工风知识卡片（学习包页 + Review 页共用）
// v4 结构：quote (原文金句) + insight (AI 洞见) + timestamp + context (原文语境) + myNote (用户编辑)
// - 整卡可点击翻面（flip）
// - 撕纸风视觉：多色 tornEdge + kraft 背景 + 手写字体
// - 时间戳非红色（用 kraft 色）
import React, { useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, Animated } from 'react-native';
import { colors, fonts, spacing, radii } from '@/constants/theme';

export type CardData = {
  id: string | number;
  quote?: string;
  insight?: string;
  title?: string; // 老 pack 兼容
  context?: string;
  explanation?: string; // 老 pack 兼容
  timestamp?: number;
  sourceTimestamp?: number;
  myNote?: string;
  personalNote?: string;
  myApplication?: string;
  starred?: boolean;
};

export type KnowledgeCardProps = {
  card: CardData;
  variant?: 'default' | 'review'; // review 模式为翻面场景
  showActions?: boolean;
  onStar?: () => void;
  onDelete?: () => void;
  onFlip?: () => void;
  flipped?: boolean;
  /** override tint color for tornEdge, defaults yolk */
  tintColor?: string;
};

function fmtTs(sec?: number): string {
  if (!sec || sec <= 0) return '';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * 整卡可点翻面。翻到背面显示 context/insight/myNote 详情。
 */
export function KnowledgeCard({
  card,
  variant = 'default',
  showActions = true,
  onStar,
  onDelete,
  onFlip,
  flipped: externalFlipped,
  tintColor,
}: KnowledgeCardProps) {
  const [internalFlipped, setInternalFlipped] = useState(false);
  const flipped = externalFlipped !== undefined ? externalFlipped : internalFlipped;

  const handlePress = useCallback(() => {
    if (onFlip) onFlip();
    else setInternalFlipped(v => !v);
  }, [onFlip]);

  const quote = card.quote || '';
  const insight = card.insight || card.title || '';
  const ts = card.timestamp ?? card.sourceTimestamp ?? 0;
  const context = card.context || card.explanation || '';
  const myNote = card.myNote || card.personalNote || card.myApplication || '';
  const tint = tintColor || colors.yolk;

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.card,
        pressed && styles.cardPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={flipped ? '翻回正面' : '翻到背面'}
    >
      {/* 撕纸风顶部纹理条 */}
      <View style={[styles.tornEdgeTop, { backgroundColor: tint }]} />

      <View style={styles.body}>
        {!flipped ? (
          // 正面：quote 一等公民 + insight
          <>
            {quote ? (
              <View style={styles.quoteBlock}>
                <Text style={styles.quoteMark}>"</Text>
                <Text style={styles.quoteText}>{quote}</Text>
              </View>
            ) : null}
            {insight ? (
              <Text style={styles.insight}>{insight}</Text>
            ) : null}
            <View style={styles.metaRow}>
              {ts > 0 ? (
                <Text style={styles.timestamp}>{fmtTs(ts)}</Text>
              ) : <View />}
              <Text style={styles.flipHint}>翻面 →</Text>
            </View>
          </>
        ) : (
          // 背面：context + myNote
          <>
            {context ? (
              <View>
                <Text style={styles.sectionLabel}>原文语境</Text>
                <Text style={styles.contextText}>{context}</Text>
              </View>
            ) : null}
            {myNote ? (
              <View>
                <Text style={styles.sectionLabel}>我的笔记</Text>
                <Text style={styles.myNoteText}>{myNote}</Text>
              </View>
            ) : null}
            {!context && !myNote ? (
              <Text style={styles.emptyBack}>暂无更多内容</Text>
            ) : null}
            <View style={styles.metaRow}>
              {ts > 0 ? <Text style={styles.timestamp}>{fmtTs(ts)}</Text> : <View />}
              <Text style={styles.flipHint}>← 翻回</Text>
            </View>
          </>
        )}
      </View>

      {/* 右上角 star/delete */}
      {showActions ? (
        <View style={styles.actionsRow}>
          {onStar ? (
            <Pressable
              onPress={(e) => { e.stopPropagation(); onStar(); }}
              hitSlop={8}
              style={styles.actionBtn}
              accessibilityRole="button"
              accessibilityLabel={card.starred ? '取消收藏' : '收藏'}
            >
              <Text style={styles.starIcon}>{card.starred ? '★' : '☆'}</Text>
            </Pressable>
          ) : null}
          {onDelete ? (
            <Pressable
              onPress={(e) => { e.stopPropagation(); onDelete(); }}
              hitSlop={8}
              style={styles.actionBtn}
              accessibilityRole="button"
              accessibilityLabel="删除"
            >
              <Text style={styles.deleteIcon}>×</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.paperCream,
    borderRadius: radii.card,
    marginBottom: spacing.md,
    overflow: 'hidden',
    // Sprint 13 R2: 撕纸风阴影零偏移（对齐首页 UI_SPEC §chosen-style）
    shadowColor: colors.inkPrimary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.10,
    shadowRadius: 8,
    elevation: 3,
    position: 'relative',
  },
  cardPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.98 }],
  },
  tornEdgeTop: {
    height: 6,
  },
  body: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  quoteBlock: {
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
    position: 'relative',
  },
  quoteMark: {
    fontFamily: fonts.hero,
    fontSize: 36,
    lineHeight: 20,
    color: colors.brick,
    position: 'absolute',
    top: -4,
    left: -2,
    opacity: 0.3,
  },
  quoteText: {
    fontFamily: fonts.bodyItalic,
    fontStyle: 'italic',
    fontSize: 15,
    lineHeight: 24,
    color: colors.inkPrimary,
    paddingLeft: spacing.sm,
  },
  insight: {
    fontFamily: fonts.hero,
    fontSize: 16,
    lineHeight: 22,
    color: colors.inkPrimary,
    marginTop: spacing.xs,
    letterSpacing: -0.2,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  timestamp: {
    fontFamily: fonts.ui,
    fontSize: 11,
    // Sprint 13 #7: 时间戳非红色，用 inkSecondary 保持中性；未来接入播放才用强调色
    color: colors.inkSecondary,
    letterSpacing: 0.4,
    backgroundColor: colors.paperMain,
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.paperDark,
  },
  flipHint: {
    fontFamily: fonts.ui,
    fontSize: 11,
    color: colors.inkSecondary,
    opacity: 0.6,
    letterSpacing: 0.3,
  },
  sectionLabel: {
    fontFamily: fonts.ui,
    fontSize: 10,
    color: colors.inkSecondary,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    opacity: 0.7,
    marginBottom: 4,
  },
  contextText: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 22,
    color: colors.inkPrimary,
  },
  myNoteText: {
    fontFamily: fonts.bodyItalic,
    fontStyle: 'italic',
    fontSize: 13,
    lineHeight: 20,
    color: colors.inkSecondary,
    marginTop: spacing.xs,
  },
  emptyBack: {
    fontFamily: fonts.bodyItalic,
    fontStyle: 'italic',
    fontSize: 13,
    color: colors.inkSecondary,
    textAlign: 'center',
    opacity: 0.6,
    paddingVertical: spacing.md,
  },
  actionsRow: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    flexDirection: 'row',
    gap: 4,
  },
  actionBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  starIcon: {
    fontSize: 16,
    color: colors.brick,
    lineHeight: 18,
  },
  deleteIcon: {
    fontSize: 18,
    color: colors.inkSecondary,
    lineHeight: 18,
  },
});
