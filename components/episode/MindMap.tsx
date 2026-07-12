// K0 单篇脑图 (#111 / R36 力导向重构) — 消费 buildMindGraph, 渲染委托给共享 ForceGraph。
// R36: 弃静态放射, 改力导向 (节点动态散开、可拖动、连线交叉大幅减少)。渐进披露(点核心观点展开概念/卡片)。
// UI 暖色纸质风见 graphTheme。详情底卡 + 图例保留在本页 (单篇专属)。
import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { colors, fonts } from '@/constants/theme';
import { buildMindGraph, type MindNode } from '@/lib/mindmap';
import { ForceGraph } from '@/components/graph/ForceGraph';
import type { PackObject } from '@/types/pack';

export function MindMap({
  pack,
  onPlay,
  onOpenCard,
}: {
  pack: PackObject;
  onPlay?: (sec: number) => void;
  onOpenCard?: (cardIndex: number) => void;
}) {
  const { width: winW } = useWindowDimensions();
  const viewW = winW - 32;
  const viewH = 470;

  const graph = useMemo(() => buildMindGraph(pack), [pack]);
  const [selected, setSelected] = useState<MindNode | null>(null);

  return (
    <View style={styles.wrap}>
      <ForceGraph
        graph={graph}
        width={viewW}
        height={viewH}
        base={0.5}
        radialFn="single"
        charge={-260}
        progressiveDisclosure
        onSelect={setSelected}
        hintText="点核心观点展开概念/卡片 · 拖动节点重排 · 点节点看详情"
      />

      {/* 图例 */}
      <View style={styles.legend}>
        <Legend color={colors.rose} label="主旨" />
        <Legend color={colors.olive} label="核心观点" />
        <Legend color={colors.paperCream} label="概念" ring />
        <Legend color={colors.paperMain} label="卡片" ring />
        <View style={styles.legendItem}><View style={styles.legendDash} /><Text style={styles.legendText}>概念关联</Text></View>
      </View>

      {selected ? (
        <View style={styles.detailSheet}>
          <View style={styles.detailHeaderRow}>
            <Text style={styles.detailKind}>
              {selected.kind === 'center' ? '本集主旨' : selected.kind === 'core' ? '核心观点' : selected.kind === 'concept' ? '关键概念' : '知识卡片'}
            </Text>
            <Pressable onPress={() => setSelected(null)} hitSlop={10}><Text style={styles.detailClose}>✕</Text></Pressable>
          </View>
          <Text style={styles.detailTitle}>{selected.label}</Text>
          {selected.detail ? <Text style={styles.detailBody}>{selected.detail}</Text> : null}
          {selected.kind === 'concept' && selected.linkedTerms && selected.linkedTerms.length > 0 ? (
            <View style={styles.relBox}>
              <Text style={styles.relLabel}>关联概念</Text>
              <Text style={styles.relText}>与「{selected.linkedTerms.join('」「')}」相关联（见上方延伸理解）</Text>
            </View>
          ) : null}
          <View style={styles.detailActions}>
            {typeof selected.timestamp === 'number' && selected.timestamp > 0 && onPlay ? (
              <Pressable style={styles.detailBtn} onPress={() => onPlay(selected.timestamp as number)}>
                <Text style={styles.detailBtnText}>▶ 听原文</Text>
              </Pressable>
            ) : null}
            {selected.kind === 'card' && typeof selected.cardIndex === 'number' && onOpenCard ? (
              <Pressable style={styles.detailBtn} onPress={() => onOpenCard(selected.cardIndex as number)}>
                <Text style={styles.detailBtnText}>看这张卡 →</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function Legend({ color, label, ring }: { color: string; label: string; ring?: boolean }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }, ring && { borderWidth: 1.5, borderColor: colors.brown }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 8 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 10, paddingHorizontal: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendDash: { width: 14, height: 0, borderTopWidth: 1.5, borderColor: colors.brick, borderStyle: 'dashed' },
  legendText: { fontFamily: fonts.ui, fontSize: 11, color: colors.inkSecondary },
  detailSheet: { marginTop: 12, backgroundColor: colors.paperCream, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.paperDark, gap: 6 },
  detailHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  detailKind: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 0.6, color: colors.inkSecondary, textTransform: 'uppercase', opacity: 0.7 },
  detailClose: { fontFamily: fonts.ui, fontSize: 16, color: colors.inkSecondary },
  detailTitle: { fontFamily: fonts.hero, fontSize: 17, lineHeight: 24, color: colors.inkPrimary },
  detailBody: { fontFamily: fonts.body, fontSize: 13, lineHeight: 20, color: colors.inkPrimary },
  relBox: { marginTop: 4, backgroundColor: colors.paperMain, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, borderLeftWidth: 2, borderLeftColor: colors.brick },
  relLabel: { fontFamily: fonts.ui, fontSize: 10, color: colors.inkSecondary, letterSpacing: 0.4, marginBottom: 2 },
  relText: { fontFamily: fonts.body, fontSize: 12, lineHeight: 18, color: colors.inkPrimary },
  detailActions: { flexDirection: 'row', gap: 10, marginTop: 6 },
  detailBtn: { backgroundColor: colors.paperMain, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1, borderColor: colors.paperDark },
  detailBtnText: { fontFamily: fonts.ui, fontSize: 13, color: colors.inkPrimary },
});
