// K0 脑图 UI (#111) — 单篇学习包知识脑图。
// react-native-svg 画节点+连线 (贴 paper 手作风, 无冷技术感); gesture-handler+reanimated 做 平移/缩放;
// 点节点弹底部详情 (跳音频/跳卡片)。全部用 build 里已有的原生模块 → 可 OTA, 无需重新 build。
//
// 布局来自 lib/mindmap (buildMindGraph + layoutRadial)。中心=一句话, 环1=核心观点, 环2=概念/卡片,
// 概念间语义连线(网状)是 K0 脑图区别于普通大纲的核心。
import React, { useMemo, useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import Svg, { Line, Circle, Path as SvgPath } from 'react-native-svg';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { colors, fonts } from '@/constants/theme';
import { buildMindGraph, layoutRadial, type MindNode } from '@/lib/mindmap';
import type { PackObject } from '@/types/pack';

const KIND_COLOR: Record<string, string> = {
  center: colors.brick,
  core: colors.olive,
  concept: colors.sapphire,
  card: colors.yolk,
};
const KIND_R: Record<string, number> = { center: 30, core: 20, concept: 15, card: 13 };

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
  const viewH = 460;

  const rawLayout = useMemo(() => layoutRadial(buildMindGraph(pack)), [pack]);
  const [selected, setSelected] = useState<MindNode | null>(null);

  // 关键修: 把整张图坐标一次性"缩放平移"到 viewport 空间 (fitted), 让 SVG/标签直接用 viewport 坐标。
  //   之前用 Animated transform scale 大画布, RN scale 以视图中心为原点, 与手算 translate 组合错位 → 画布飞出视口空白。
  //   现在: 坐标预 fit 进 viewport, 手势只是在已 fit 的坐标上再叠一层 pan/zoom (scale 从 1 起), 原点问题消失。
  const layout = useMemo(() => {
    const pad = 40;
    const fit = Math.min((viewW - pad * 2) / rawLayout.width, (viewH - pad * 2) / rawLayout.height);
    const offX = (viewW - rawLayout.width * fit) / 2;
    const offY = (viewH - rawLayout.height * fit) / 2;
    const nodes = rawLayout.nodes.map(n => ({
      ...n,
      x: (n.x ?? 0) * fit + offX,
      y: (n.y ?? 0) * fit + offY,
      _r: KIND_R[n.kind] * Math.max(0.75, fit),   // 半径也按 fit 缩 (别让节点比图还大)
    }));
    return { nodes, edges: rawLayout.edges, fit };
  }, [rawLayout, viewW, viewH]);

  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const scale = useSharedValue(1);
  const startTx = useSharedValue(0);
  const startTy = useSharedValue(0);
  const startScale = useSharedValue(1);

  const pan = Gesture.Pan()
    .onStart(() => { startTx.value = tx.value; startTy.value = ty.value; })
    .onUpdate((e) => { tx.value = startTx.value + e.translationX; ty.value = startTy.value + e.translationY; });
  const pinch = Gesture.Pinch()
    .onStart(() => { startScale.value = scale.value; })
    .onUpdate((e) => { scale.value = Math.max(0.6, Math.min(3, startScale.value * e.scale)); });
  const composed = Gesture.Simultaneous(pan, pinch);

  const canvasStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: scale.value },
    ],
  }));

  const resetView = useCallback(() => {
    tx.value = withTiming(0); ty.value = withTiming(0); scale.value = withTiming(1);
  }, []);

  const nodeById = useMemo(() => new Map(layout.nodes.map(n => [n.id, n])), [layout]);
  const fontScale = Math.max(0.85, Math.min(1.15, layout.fit));

  return (
    <View style={styles.wrap}>
      <View style={[styles.viewport, { width: viewW, height: viewH }]}>
        <GestureDetector gesture={composed}>
          {/* canvas 与 viewport 同尺寸, 坐标已 fit 进去; scale 从 1 起, 中心原点不再错位 */}
          <Animated.View style={[styles.canvas, canvasStyle, { width: viewW, height: viewH }]}>
            <Svg width={viewW} height={viewH}>
              {/* 边 */}
              {layout.edges.map((e, i) => {
                const a = nodeById.get(e.from); const b = nodeById.get(e.to);
                if (!a || !b || a.x == null || b.x == null) return null;
                if (e.kind === 'semantic') {
                  return (
                    <Line key={`e-${i}`} x1={a.x} y1={a.y!} x2={b.x} y2={b.y!}
                      stroke={colors.brick} strokeWidth={1.5} strokeDasharray="5,5" opacity={0.6} />
                  );
                }
                return (
                  <Line key={`e-${i}`} x1={a.x} y1={a.y!} x2={b.x} y2={b.y!}
                    stroke={colors.paperDark} strokeWidth={e.kind === 'skeleton' ? 2.5 : 1.5} opacity={0.85} />
                );
              })}
              {/* 节点圆 */}
              {layout.nodes.map((n: any) => (
                <Circle key={`c-${n.id}`} cx={n.x} cy={n.y} r={n._r}
                  fill={n.kind === 'card' && n.quote && n.quoteVerified === false ? colors.paperCream : (KIND_COLOR[n.kind] || colors.olive)}
                  stroke={colors.inkPrimary} strokeWidth={n.kind === 'center' ? 2 : 1.2}
                  opacity={selected && selected.id !== n.id ? 0.4 : 1} />
              ))}
            </Svg>
            {/* 节点文字 + 点击区 (绝对定位叠在 SVG 上) */}
            {layout.nodes.map((n: any) => {
              const boxW = n.kind === 'center' ? 130 : n.kind === 'core' ? 108 : 88;
              return (
                <Pressable
                  key={`t-${n.id}`}
                  onPress={() => setSelected(n)}
                  style={[styles.nodeLabel, { left: (n.x ?? 0) - boxW / 2, top: (n.y ?? 0) + n._r + 1, width: boxW }]}
                  hitSlop={8}
                >
                  <Text
                    style={[
                      styles.nodeLabelText,
                      { fontSize: (n.kind === 'center' ? 11 : 10) * fontScale },
                      n.kind === 'center' && styles.centerLabelText,
                      n.kind === 'core' && styles.coreLabelText,
                    ]}
                    numberOfLines={2}
                  >
                    {truncate(n.label, n.kind === 'center' ? 32 : n.kind === 'core' ? 22 : 14)}
                  </Text>
                </Pressable>
              );
            })}
          </Animated.View>
        </GestureDetector>

        {/* 复位按钮 */}
        <Pressable style={styles.resetBtn} onPress={resetView} accessibilityLabel="复位脑图">
          <Text style={styles.resetBtnText}>⟲ 复位</Text>
        </Pressable>
        <Text style={styles.hint}>双指缩放 · 拖动平移 · 点节点看详情</Text>
      </View>

      {/* 图例 */}
      <View style={styles.legend}>
        <Legend color={colors.brick} label="主旨" />
        <Legend color={colors.olive} label="核心观点" />
        <Legend color={KIND_COLOR.concept} label="概念" />
        <Legend color={colors.yolk} label="卡片" />
        <View style={styles.legendItem}>
          <View style={styles.legendDash} />
          <Text style={styles.legendText}>概念关联</Text>
        </View>
      </View>

      {/* 详情底卡 */}
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

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 8 },
  viewport: {
    backgroundColor: colors.paperCream,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.paperDark,
  },
  canvas: { position: 'absolute', left: 0, top: 0 },
  nodeLabel: { position: 'absolute', alignItems: 'center' },
  nodeLabelText: { fontFamily: fonts.ui, fontSize: 10, lineHeight: 13, color: colors.inkPrimary, textAlign: 'center' },
  centerLabelText: { fontFamily: fonts.hero, fontSize: 12, lineHeight: 15 },
  coreLabelText: { fontSize: 11, lineHeight: 14 },
  resetBtn: { position: 'absolute', top: 8, right: 8, backgroundColor: colors.paperMain, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: colors.paperDark },
  resetBtnText: { fontFamily: fonts.ui, fontSize: 11, color: colors.inkSecondary },
  hint: { position: 'absolute', bottom: 6, alignSelf: 'center', fontFamily: fonts.ui, fontSize: 10, color: colors.inkSecondary, opacity: 0.7 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 10, paddingHorizontal: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1, borderColor: colors.inkPrimary },
  legendDash: { width: 14, height: 0, borderTopWidth: 1.5, borderColor: colors.brick, borderStyle: 'dashed' },
  legendText: { fontFamily: fonts.ui, fontSize: 11, color: colors.inkSecondary },
  detailSheet: { marginTop: 12, backgroundColor: colors.paperMain, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.paperDark, gap: 6 },
  detailHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  detailKind: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 0.6, color: colors.inkSecondary, textTransform: 'uppercase', opacity: 0.7 },
  detailClose: { fontFamily: fonts.ui, fontSize: 16, color: colors.inkSecondary },
  detailTitle: { fontFamily: fonts.hero, fontSize: 17, lineHeight: 24, color: colors.inkPrimary },
  detailBody: { fontFamily: fonts.body, fontSize: 13, lineHeight: 20, color: colors.inkPrimary },
  detailActions: { flexDirection: 'row', gap: 10, marginTop: 6 },
  detailBtn: { backgroundColor: colors.paperCream, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1, borderColor: colors.paperDark },
  detailBtnText: { fontFamily: fonts.ui, fontSize: 13, color: colors.inkPrimary },
});
