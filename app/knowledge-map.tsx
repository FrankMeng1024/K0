// K0 跨集知识图谱 (#113 多篇脑图)
// 中心=我的知识库, 各 pack 为分支, 共享概念的 pack 之间虚线相连(粗细=共享概念数)。
// 点 pack 节点 → 弹详情(播客名+一句话)+"打开这个学习包"。数据: GET /api/library/knowledge-graph。
import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import Svg, { Line, Circle } from 'react-native-svg';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, spacing } from '@/constants/theme';
import { ScreenHeader } from '@/components/ScreenHeader';
import { apiGet } from '@/lib/api';
import { buildCrossPackGraph, layoutCrossPack, type CrossPackInput, type MindNode } from '@/lib/mindmap';

function truncate(s: string, n: number) { return s && s.length > n ? s.slice(0, n) + '…' : (s || ''); }

export default function KnowledgeMap() {
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const viewW = winW - 32;
  const viewH = 480;

  const [packs, setPacks] = useState<CrossPackInput[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<MindNode | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiGet<{ packs: CrossPackInput[] }>('/api/library/knowledge-graph')
      .then(r => { if (!cancelled) setPacks(r.packs || []); })
      .catch(e => { if (!cancelled) setError(e?.message || '加载失败'); });
    return () => { cancelled = true; };
  }, []);

  const graph = useMemo(() => packs ? buildCrossPackGraph(packs) : null, [packs]);
  const BASE = 0.62;
  const layout = useMemo(() => {
    if (!graph) return null;
    const l = layoutCrossPack(graph);
    const nodes = l.nodes.map(n => ({ ...n, x: (n.x ?? 0) * BASE, y: (n.y ?? 0) * BASE, _r: (n.kind === 'center' ? 30 : 22) * BASE + 6 }));
    return { nodes, edges: l.edges, w: l.w * BASE, h: l.h * BASE };
  }, [graph]);

  const initTx = layout ? viewW / 2 - layout.w / 2 : 0;
  const initTy = layout ? viewH / 2 - layout.h / 2 : 0;
  const tx = useSharedValue(0), ty = useSharedValue(0), scale = useSharedValue(1);
  const s0 = useSharedValue(0), s1 = useSharedValue(0), s2 = useSharedValue(1);
  useEffect(() => { tx.value = initTx; ty.value = initTy; }, [initTx, initTy]);

  const pan = Gesture.Pan().onStart(() => { s0.value = tx.value; s1.value = ty.value; })
    .onUpdate(e => { tx.value = s0.value + e.translationX; ty.value = s1.value + e.translationY; });
  const pinch = Gesture.Pinch().onStart(() => { s2.value = scale.value; })
    .onUpdate(e => { scale.value = Math.max(0.5, Math.min(3, s2.value * e.scale)); });
  const composed = Gesture.Simultaneous(pan, pinch);
  const canvasStyle = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }] }));
  const resetView = useCallback(() => { tx.value = withTiming(initTx); ty.value = withTiming(initTy); scale.value = withTiming(1); }, [initTx, initTy]);

  const nodeById = useMemo(() => layout ? new Map(layout.nodes.map(n => [n.id, n])) : new Map(), [layout]);
  const sharedEdge = graph?.edges.filter((e: any) => e.kind === 'semantic') || [];

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScreenHeader title="知识图谱" subtitle="你学过的每一集，在这里连成网" onBack={() => router.back()} />
      <View style={styles.body}>
        {error ? (
          <View style={styles.center}><Text style={styles.errText}>{error}</Text></View>
        ) : !layout ? (
          <View style={styles.center}><ActivityIndicator color={colors.brick} /></View>
        ) : packs && packs.length === 0 ? (
          <View style={styles.center}><Text style={styles.emptyText}>学完几集后，它们的知识就会在这里连起来</Text></View>
        ) : (
          <>
            <Text style={styles.intro}>
              {packs!.length} 个学习包{sharedEdge.length > 0 ? ` · ${sharedEdge.length} 处知识关联` : ' · 学更多集会浮现关联'}
            </Text>
            <View style={[styles.viewport, { width: viewW, height: viewH }]}>
              <GestureDetector gesture={composed}>
                <Animated.View style={[styles.canvas, canvasStyle, { width: layout.w, height: layout.h }]}>
                  <Svg width={layout.w} height={layout.h}>
                    {layout.edges.map((e: any, i: number) => {
                      const a = nodeById.get(e.from); const b = nodeById.get(e.to);
                      if (!a || !b || a.x == null || b.x == null) return null;
                      if (e.kind === 'semantic') {
                        return <Line key={`e${i}`} x1={a.x} y1={a.y!} x2={b.x} y2={b.y!}
                          stroke={colors.brick} strokeWidth={Math.min(4, 1 + (e.weight || 1))} strokeDasharray="5,5" opacity={0.6} />;
                      }
                      return <Line key={`e${i}`} x1={a.x} y1={a.y!} x2={b.x} y2={b.y!} stroke={colors.paperDark} strokeWidth={2} opacity={0.8} />;
                    })}
                    {layout.nodes.map((n: any) => (
                      <Circle key={`c${n.id}`} cx={n.x} cy={n.y} r={n._r}
                        fill={n.kind === 'center' ? colors.brick : colors.olive}
                        stroke={colors.inkPrimary} strokeWidth={n.kind === 'center' ? 2 : 1.2}
                        opacity={selected && selected.id !== n.id ? 0.4 : 1} />
                    ))}
                  </Svg>
                  {layout.nodes.map((n: any) => {
                    const boxW = n.kind === 'center' ? 120 : 128;
                    return (
                      <Pressable key={`t${n.id}`} onPress={() => setSelected(n)}
                        style={[styles.nodeLabel, { left: (n.x ?? 0) - boxW / 2, top: (n.y ?? 0) + n._r + 1, width: boxW }]} hitSlop={6}>
                        <Text style={[styles.nodeLabelText, n.kind === 'center' && styles.centerLabelText]} numberOfLines={3}>
                          {truncate(n.label, n.kind === 'center' ? 12 : 30)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </Animated.View>
              </GestureDetector>
              <Pressable style={styles.resetBtn} onPress={resetView}><Text style={styles.resetBtnText}>⟲ 复位</Text></Pressable>
              <Text style={styles.hint}>拖动/缩放探索 · 红虚线=共享概念 · 点学习包看详情</Text>
            </View>
          </>
        )}
      </View>

      {selected ? (
        <View style={styles.detailSheet}>
          <View style={styles.detailHeaderRow}>
            <Text style={styles.detailKind}>{selected.kind === 'center' ? '你的知识库' : '学习包'}</Text>
            <Pressable onPress={() => setSelected(null)} hitSlop={10}><Text style={styles.detailClose}>✕</Text></Pressable>
          </View>
          <Text style={styles.detailTitle}>{selected.label}</Text>
          {selected.detail ? <Text style={styles.detailBody}>{selected.detail}</Text> : null}
          {selected.kind === 'core' && typeof selected.cardIndex === 'number' ? (
            <Pressable style={styles.detailBtn} onPress={() => router.push({ pathname: '/episode/[id]', params: { id: String(selected.cardIndex), direct: '1', packId: String(selected.cardIndex) } })}>
              <Text style={styles.detailBtnText}>打开这个学习包 →</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paperMain },
  body: { flex: 1, paddingHorizontal: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  errText: { fontFamily: fonts.body, fontSize: 14, color: colors.brick, textAlign: 'center' },
  emptyText: { fontFamily: fonts.body, fontSize: 15, color: colors.inkSecondary, textAlign: 'center', lineHeight: 22 },
  intro: { fontFamily: fonts.ui, fontSize: 13, color: colors.inkSecondary, marginBottom: 10 },
  viewport: { backgroundColor: colors.paperCream, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: colors.paperDark },
  canvas: { position: 'absolute', left: 0, top: 0 },
  nodeLabel: { position: 'absolute', alignItems: 'center' },
  nodeLabelText: { fontFamily: fonts.ui, fontSize: 10, lineHeight: 13, color: colors.inkPrimary, textAlign: 'center' },
  centerLabelText: { fontFamily: fonts.hero, fontSize: 12, lineHeight: 15 },
  resetBtn: { position: 'absolute', top: 8, right: 8, backgroundColor: colors.paperMain, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: colors.paperDark },
  resetBtnText: { fontFamily: fonts.ui, fontSize: 11, color: colors.inkSecondary },
  hint: { position: 'absolute', bottom: 6, alignSelf: 'center', fontFamily: fonts.ui, fontSize: 10, color: colors.inkSecondary, opacity: 0.7 },
  detailSheet: { margin: 16, backgroundColor: colors.paperCream, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.paperDark, gap: 6 },
  detailHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  detailKind: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 0.6, color: colors.inkSecondary, textTransform: 'uppercase', opacity: 0.7 },
  detailClose: { fontFamily: fonts.ui, fontSize: 16, color: colors.inkSecondary },
  detailTitle: { fontFamily: fonts.hero, fontSize: 17, lineHeight: 24, color: colors.inkPrimary },
  detailBody: { fontFamily: fonts.body, fontSize: 13, lineHeight: 20, color: colors.inkPrimary },
  detailBtn: { alignSelf: 'flex-start', marginTop: 6, backgroundColor: colors.brick, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  detailBtnText: { fontFamily: fonts.ui, fontSize: 13, color: colors.paperCream },
});
