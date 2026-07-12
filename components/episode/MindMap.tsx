// K0 脑图 UI (#111 / v2 #116) — 单篇学习包知识脑图。
// 纸质手作风(撕纸节点 + 墨色描边 + 暖色, 非技术拓扑图); react-native-svg 画, gesture pan/zoom;
// v2: ①动态高亮(点节点→相连边/邻居呼吸高亮, 其余淡到几乎隐身, 解决"连线乱")
//     ②渐进披露(默认只显主旨+核心观点, 点核心观点才展开它挂的概念/卡片, 解决拥挤; NotebookLM 做法)
//     ③UI 对齐 K0 纸质风(暖色系, 墨边, 去技术感)
// (横屏/全屏需 expo-screen-orientation = 原生模块, 留下次 build)
import React, { useMemo, useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import Svg, { Line, Circle } from 'react-native-svg';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { colors, fonts } from '@/constants/theme';
import { buildMindGraph, layoutRadial, buildAdjacency, type MindNode } from '@/lib/mindmap';
import type { PackObject } from '@/types/pack';

// 纸质暖色系 (对齐 K0: paperCream/paperMain 底 + 弱饱和品牌色 + 墨边), 不再是生硬纯色技术圆
const KIND_FILL: Record<string, string> = {
  center: colors.brick,
  core: colors.yolk,
  concept: colors.olive,
  card: colors.paperCream,
};
const KIND_R: Record<string, number> = { center: 26, core: 18, concept: 14, card: 12 };

function truncate(s: string, n: number) {
  return s && s.length > n ? s.slice(0, n) + '…' : (s || '');
}

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
  const adjacency = useMemo(() => buildAdjacency(graph.edges), [graph]);
  const rawLayout = useMemo(() => layoutRadial(graph), [graph]);
  const [selected, setSelected] = useState<MindNode | null>(null);
  // #116 渐进披露: 展开了哪些 core 的子节点 (概念/卡片默认收起)
  const [expandedCores, setExpandedCores] = useState<Set<string>>(new Set());

  const BASE = 0.5;
  const layout = useMemo(() => {
    const nodes = rawLayout.nodes.map(n => ({
      ...n,
      x: (n.x ?? 0) * BASE,
      y: (n.y ?? 0) * BASE,
      _r: KIND_R[n.kind] * BASE + 5,
    }));
    return { nodes, edges: rawLayout.edges, w: rawLayout.width * BASE, h: rawLayout.height * BASE };
  }, [rawLayout]);

  // 哪些节点可见: center/core 恒显; concept/card 仅当其所属 core 被展开
  //   (belong 边: core→concept/card; center→concept/card 也算根挂)
  const visibleIds = useMemo(() => {
    const vis = new Set<string>();
    for (const n of layout.nodes) if (n.kind === 'center' || n.kind === 'core') vis.add(n.id);
    for (const e of layout.edges) {
      if (e.kind === 'belong' || (e.kind === 'skeleton' && e.from === 'center')) {
        // 子节点归属的 core (from) 被展开 → 显示子节点
        if (e.from === 'center') { /* 挂中心的概念/卡片: 任一 core 展开就显? 简化: 有展开就显 */ }
        if (expandedCores.has(e.from)) vis.add(e.to);
      }
    }
    // 挂中心的概念/卡片(无 core 归属): 只要有任意 core 展开就一并显示 (避免它们永远藏)
    if (expandedCores.size > 0) {
      for (const e of layout.edges) {
        if (e.kind === 'skeleton' && e.from === 'center') vis.add(e.to);
      }
    }
    return vis;
  }, [layout, expandedCores]);

  const initTx = viewW / 2 - layout.w / 2;
  const initTy = viewH / 2 - layout.h / 2;
  const tx = useSharedValue(initTx);
  const ty = useSharedValue(initTy);
  const scale = useSharedValue(1);
  const s0 = useSharedValue(0), s1 = useSharedValue(0), s2 = useSharedValue(1);

  const pan = Gesture.Pan()
    .onStart(() => { s0.value = tx.value; s1.value = ty.value; })
    .onUpdate(e => { tx.value = s0.value + e.translationX; ty.value = s1.value + e.translationY; });
  const pinch = Gesture.Pinch()
    .onStart(() => { s2.value = scale.value; })
    .onUpdate(e => { scale.value = Math.max(0.5, Math.min(3, s2.value * e.scale)); });
  const composed = Gesture.Simultaneous(pan, pinch);
  const canvasStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  const resetView = useCallback(() => {
    tx.value = withTiming(initTx); ty.value = withTiming(initTy); scale.value = withTiming(1);
  }, [initTx, initTy]);
  const fitAll = useCallback(() => {
    const fs = Math.min(viewW / layout.w, viewH / layout.h) * 0.92;
    scale.value = withTiming(fs); tx.value = withTiming(viewW / 2 - layout.w / 2); ty.value = withTiming(viewH / 2 - layout.h / 2);
  }, [viewW, viewH, layout.w, layout.h]);
  const expandAll = useCallback(() => {
    setExpandedCores(new Set(layout.nodes.filter(n => n.kind === 'core').map(n => n.id)));
  }, [layout]);

  const nodeById = useMemo(() => new Map(layout.nodes.map(n => [n.id, n])), [layout]);

  // 点节点: core → 切换展开; 任何节点 → 选中(高亮邻居) + 弹详情
  const onNodePress = useCallback((n: MindNode) => {
    if (n.kind === 'core') {
      setExpandedCores(prev => {
        const next = new Set(prev);
        if (next.has(n.id)) next.delete(n.id); else next.add(n.id);
        return next;
      });
    }
    setSelected(n);
  }, []);

  // 高亮: 选中节点的一跳邻居集合
  const highlightSet = useMemo(() => {
    if (!selected) return null;
    const set = new Set<string>([selected.id]);
    (adjacency.get(selected.id) || new Set()).forEach(id => set.add(id));
    return set;
  }, [selected, adjacency]);

  const nodeOpacity = (id: string) => {
    if (!highlightSet) return 1;
    return highlightSet.has(id) ? 1 : 0.12;   // 非邻居淡到几乎隐身
  };
  const edgeOpacity = (a: string, b: string, base: number) => {
    if (!highlightSet) return base;
    return (highlightSet.has(a) && highlightSet.has(b)) ? 0.95 : 0.06;
  };

  return (
    <View style={styles.wrap}>
      <View style={[styles.viewport, { width: viewW, height: viewH }]}>
        <GestureDetector gesture={composed}>
          <Animated.View style={[styles.canvas, canvasStyle, { width: layout.w, height: layout.h }]}>
            <Svg width={layout.w} height={layout.h}>
              {/* 边 (只画两端都可见的) */}
              {layout.edges.map((e, i) => {
                const a = nodeById.get(e.from); const b = nodeById.get(e.to);
                if (!a || !b || a.x == null || b.x == null) return null;
                if (!visibleIds.has(e.from) || !visibleIds.has(e.to)) return null;
                const semantic = e.kind === 'semantic';
                const base = semantic ? 0.5 : e.kind === 'skeleton' ? 0.55 : 0.4;
                return (
                  <Line key={`e-${i}`} x1={a.x} y1={a.y!} x2={b.x} y2={b.y!}
                    stroke={semantic ? colors.brick : colors.brown}
                    strokeWidth={semantic ? 1.5 : e.kind === 'skeleton' ? 2 : 1.2}
                    strokeDasharray={semantic ? '5,4' : undefined}
                    opacity={edgeOpacity(e.from, e.to, base)} />
                );
              })}
              {/* 节点 (仅可见) */}
              {layout.nodes.filter(n => visibleIds.has(n.id)).map((n: any) => {
                const isCore = n.kind === 'core';
                const expanded = isCore && expandedCores.has(n.id);
                return (
                  <Circle key={`c-${n.id}`} cx={n.x} cy={n.y} r={n._r}
                    fill={KIND_FILL[n.kind] || colors.olive}
                    stroke={colors.brown} strokeWidth={n.kind === 'center' ? 2 : expanded ? 2 : 1.3}
                    opacity={nodeOpacity(n.id)} />
                );
              })}
            </Svg>
            {/* 标签 + 点击区 */}
            {layout.nodes.filter(n => visibleIds.has(n.id)).map((n: any) => {
              const boxW = n.kind === 'center' ? 164 : n.kind === 'core' ? 138 : 100;
              const lines = n.kind === 'center' ? 3 : n.kind === 'core' ? 2 : 2;
              const isCore = n.kind === 'core';
              const hasKids = isCore && layout.edges.some(e => e.from === n.id && (e.kind === 'belong'));
              return (
                <Pressable
                  key={`t-${n.id}`}
                  onPress={() => onNodePress(n)}
                  style={[styles.nodeLabel, { left: (n.x ?? 0) - boxW / 2, top: (n.y ?? 0) + n._r + 1, width: boxW, opacity: nodeOpacity(n.id) }]}
                  hitSlop={6}
                >
                  <Text
                    style={[styles.nodeLabelText, { fontSize: n.kind === 'center' ? 11 : 10 }, n.kind === 'center' && styles.centerLabelText]}
                    numberOfLines={lines}
                  >
                    {truncate(n.label, n.kind === 'center' ? 48 : n.kind === 'core' ? 30 : 18)}
                    {hasKids ? (expandedCores.has(n.id) ? '  ▾' : '  ▸') : ''}
                  </Text>
                </Pressable>
              );
            })}
          </Animated.View>
        </GestureDetector>

        <View style={styles.btnRow}>
          <Pressable style={styles.mapBtn} onPress={expandAll}><Text style={styles.mapBtnText}>展开全部</Text></Pressable>
          <Pressable style={styles.mapBtn} onPress={fitAll}><Text style={styles.mapBtnText}>看全部</Text></Pressable>
          <Pressable style={styles.mapBtn} onPress={resetView}><Text style={styles.mapBtnText}>复位</Text></Pressable>
        </View>
        <Text style={styles.hint}>点核心观点展开概念/卡片 · 点节点高亮关联 · 拖动缩放</Text>
      </View>

      {/* 图例 */}
      <View style={styles.legend}>
        <Legend color={colors.brick} label="主旨" />
        <Legend color={colors.yolk} label="核心观点" />
        <Legend color={colors.olive} label="概念" />
        <Legend color={colors.paperCream} label="卡片" ring />
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
  viewport: {
    backgroundColor: colors.paperMain,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.paperDark,
  },
  canvas: { position: 'absolute', left: 0, top: 0 },
  nodeLabel: { position: 'absolute', alignItems: 'center' },
  nodeLabelText: { fontFamily: fonts.ui, fontSize: 10, lineHeight: 13, color: colors.inkPrimary, textAlign: 'center' },
  centerLabelText: { fontFamily: fonts.hero, fontSize: 12, lineHeight: 15 },
  btnRow: { position: 'absolute', top: 8, right: 8, flexDirection: 'row', gap: 6 },
  mapBtn: { backgroundColor: colors.paperCream, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5, borderWidth: 1, borderColor: colors.paperDark },
  mapBtnText: { fontFamily: fonts.ui, fontSize: 11, color: colors.inkSecondary },
  hint: { position: 'absolute', bottom: 6, alignSelf: 'center', fontFamily: fonts.ui, fontSize: 10, color: colors.inkSecondary, opacity: 0.75 },
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
