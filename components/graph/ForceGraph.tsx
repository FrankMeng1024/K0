// #R36 ForceGraph — 单篇/多篇共享的力导向脑图组件。
// 内部: useMindForce (rAF 力松弛) + 画布 pan/pinch + 节点拖动 + 选中高亮(一跳邻居) + 渐进披露标签。
// 视觉: 暖色纸质风 (graphTheme), semantic 边贝塞尔虚线。
// 两页只传 graph + onSelect(弹各自详情) + 可选 progressiveDisclosure/expandable。
import React, { useMemo, useState, useCallback, useRef } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Svg, { Line, Circle, Path } from 'react-native-svg';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, runOnJS, useDerivedValue,
} from 'react-native-reanimated';
import { colors, fonts } from '@/constants/theme';
import { buildAdjacency, type MindNode } from '@/lib/mindmap';
import { useMindForce } from '@/hooks/useMindForce';
import {
  rOf, NODE_FILL, NODE_STROKE, strokeWidthOf, EDGE_STYLE, OPACITY, LABEL_SCALE_THRESHOLD,
} from './graphTheme';

function truncate(s: string, n: number) {
  return s && s.length > n ? s.slice(0, n) + '…' : (s || '');
}

// 二次贝塞尔控制点 = 中点沿法向偏移, 让 semantic 边弯曲避开交叉
function bezierPath(x1: number, y1: number, x2: number, y2: number, bow = 18) {
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = -dy / len, ny = dx / len; // 法向
  const cx = mx + nx * bow, cy = my + ny * bow;
  return `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
}

export interface ForceGraphProps {
  graph: { nodes: MindNode[]; edges: any[] };
  width: number;
  height: number;
  base?: number;
  radialFn?: 'single' | 'cross';
  charge?: number;
  onSelect?: (node: MindNode | null) => void;
  // 渐进披露: 默认只显 center/core, 点 core 展开其子节点 (单篇用)
  progressiveDisclosure?: boolean;
  labelFor?: (n: MindNode) => string;   // 标签文本 (默认用 n.label 截断)
  hintText?: string;
}

export function ForceGraph({
  graph, width, height, base = 0.5, radialFn = 'single', charge,
  onSelect, progressiveDisclosure = false, labelFor, hintText,
}: ForceGraphProps) {
  const { nodes, pinDrag, release, reheat } = useMindForce({
    graph, width, height, base, rOf, radialFn, charge,
  });
  const adjacency = useMemo(() => buildAdjacency(graph.edges), [graph.edges]);

  const [selected, setSelected] = useState<MindNode | null>(null);
  const [expandedCores, setExpandedCores] = useState<Set<string>>(new Set());

  // 画布 pan/pinch (整图平移缩放)
  const tx = useSharedValue(0), ty = useSharedValue(0), scale = useSharedValue(1);
  const s0 = useSharedValue(0), s1 = useSharedValue(0), s2 = useSharedValue(1);
  const [labelScale, setLabelScale] = useState(1);   // JS 侧镜像 scale, 控标签披露

  const canvasPan = Gesture.Pan()
    .onStart(() => { s0.value = tx.value; s1.value = ty.value; })
    .onUpdate(e => { tx.value = s0.value + e.translationX; ty.value = s1.value + e.translationY; });
  const pinch = Gesture.Pinch()
    .onStart(() => { s2.value = scale.value; })
    .onUpdate(e => {
      const ns = Math.max(0.4, Math.min(3, s2.value * e.scale));
      scale.value = ns;
    })
    .onEnd(() => { runOnJS(setLabelScale)(scale.value); });
  const canvasGesture = Gesture.Simultaneous(canvasPan, pinch);
  const canvasStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  const nodeById = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes]);

  // 可见性 (渐进披露): center/core 恒显; concept/card 仅当所属 core 展开
  const visibleIds = useMemo(() => {
    if (!progressiveDisclosure) return null; // null = 全显
    const vis = new Set<string>();
    for (const n of nodes) if (n.kind === 'center' || n.kind === 'core') vis.add(n.id);
    for (const e of graph.edges) {
      if (e.kind === 'belong' && expandedCores.has(e.from)) vis.add(e.to);
    }
    if (expandedCores.size > 0) {
      for (const e of graph.edges) if (e.kind === 'skeleton' && e.from === 'center') vis.add(e.to);
    }
    return vis;
  }, [progressiveDisclosure, nodes, graph.edges, expandedCores]);

  const isVisible = useCallback((id: string) => !visibleIds || visibleIds.has(id), [visibleIds]);

  // 高亮: 选中节点 + 一跳邻居
  const highlightSet = useMemo(() => {
    if (!selected) return null;
    const set = new Set<string>([selected.id]);
    (adjacency.get(selected.id) || new Set()).forEach(id => set.add(id));
    return set;
  }, [selected, adjacency]);

  const nodeOpacity = (id: string) => (!highlightSet ? 1 : highlightSet.has(id) ? 1 : OPACITY.dimNode);
  const edgeOpacity = (a: string, b: string, baseOp: number) =>
    !highlightSet ? baseOp : (highlightSet.has(a) && highlightSet.has(b) ? OPACITY.activeEdge : OPACITY.dimEdge);

  const doSelect = useCallback((n: MindNode | null) => {
    setSelected(n);
    onSelect?.(n);
  }, [onSelect]);

  const onNodePress = useCallback((n: MindNode) => {
    if (progressiveDisclosure && n.kind === 'core') {
      setExpandedCores(prev => {
        const next = new Set(prev);
        if (next.has(n.id)) next.delete(n.id); else next.add(n.id);
        return next;
      });
    }
    doSelect(n);
  }, [progressiveDisclosure, doSelect]);

  const resetView = useCallback(() => {
    tx.value = withTiming(0); ty.value = withTiming(0); scale.value = withTiming(1);
    setLabelScale(1);
  }, []);

  const expandAll = useCallback(() => {
    setExpandedCores(new Set(nodes.filter(n => n.kind === 'core').map(n => n.id)));
  }, [nodes]);

  // 标签是否显示 (渐进披露: 小节点需放大或选中才显)
  const showLabel = useCallback((n: MindNode) => {
    if (n.kind === 'center' || n.kind === 'core') return true;
    if (selected && (selected.id === n.id || (highlightSet?.has(n.id)))) return true;
    return labelScale >= LABEL_SCALE_THRESHOLD;
  }, [selected, highlightSet, labelScale]);

  return (
    <View style={styles.wrap}>
      <View style={[styles.viewport, { width, height }]}>
        <GestureDetector gesture={canvasGesture}>
          <Animated.View style={[styles.canvas, canvasStyle, { width, height }]}>
            <Svg width={width} height={height}>
              {graph.edges.map((e: any, i: number) => {
                const a = nodeById.get(e.from); const b = nodeById.get(e.to);
                if (!a || !b || a.x == null || b.x == null) return null;
                if (!isVisible(e.from) || !isVisible(e.to)) return null;
                const st = EDGE_STYLE[e.kind as keyof typeof EDGE_STYLE] || EDGE_STYLE.belong;
                const baseOp = e.kind === 'semantic' ? 0.55 : e.kind === 'skeleton' ? 0.55 : 0.4;
                const op = edgeOpacity(e.from, e.to, baseOp);
                const w = e.kind === 'semantic' ? Math.min(4, st.width + (e.weight ? e.weight - 1 : 0)) : st.width;
                if (st.curve) {
                  return (
                    <Path key={`e${i}`} d={bezierPath(a.x, a.y!, b.x, b.y!)}
                      stroke={st.stroke} strokeWidth={w} strokeDasharray={st.dash} fill="none" opacity={op} />
                  );
                }
                return (
                  <Line key={`e${i}`} x1={a.x} y1={a.y!} x2={b.x} y2={b.y!}
                    stroke={st.stroke} strokeWidth={w} strokeDasharray={st.dash} opacity={op} />
                );
              })}
              {nodes.filter(n => isVisible(n.id)).map((n: any) => {
                const sel = selected?.id === n.id;
                return (
                  <Circle key={`c${n.id}`} cx={n.x} cy={n.y} r={n._r ?? rOf(n.kind)}
                    fill={NODE_FILL[n.kind] || colors.olive}
                    stroke={sel ? colors.brick : (NODE_STROKE[n.kind] || colors.brown)}
                    strokeWidth={strokeWidthOf(n.kind, sel)}
                    opacity={nodeOpacity(n.id)} />
                );
              })}
            </Svg>
            {/* 标签 + 点击/拖动区 */}
            {nodes.filter(n => isVisible(n.id)).map((n: any) => (
              <DraggableLabel
                key={`t${n.id}`}
                node={n}
                label={labelFor ? labelFor(n) : truncate(n.label, n.kind === 'center' ? 40 : n.kind === 'core' ? 28 : 18)}
                show={showLabel(n)}
                opacity={nodeOpacity(n.id)}
                progressiveDisclosure={progressiveDisclosure}
                expanded={expandedCores.has(n.id)}
                hasKids={n.kind === 'core' && graph.edges.some((e: any) => e.from === n.id && e.kind === 'belong')}
                onPress={() => onNodePress(n)}
                onDrag={(x, y) => pinDrag(n.id, x, y)}
                onDragEnd={() => release(n.id)}
                scaleSV={scale}
              />
            ))}
          </Animated.View>
        </GestureDetector>

        <View style={styles.btnRow}>
          {progressiveDisclosure ? (
            <Pressable style={styles.mapBtn} onPress={expandAll}><Text style={styles.mapBtnText}>展开全部</Text></Pressable>
          ) : null}
          <Pressable style={styles.mapBtn} onPress={reheat}><Text style={styles.mapBtnText}>重排</Text></Pressable>
          <Pressable style={styles.mapBtn} onPress={resetView}><Text style={styles.mapBtnText}>复位</Text></Pressable>
        </View>
        <Text style={styles.hint}>{hintText || '拖动节点重排 · 点节点看详情 · 双指缩放'}</Text>
      </View>
    </View>
  );
}

// 单个节点的标签 + 拖动手势 (拖动 pin 该节点, 其余点力松弛重排)
function DraggableLabel({
  node, label, show, opacity, progressiveDisclosure, expanded, hasKids, onPress, onDrag, onDragEnd, scaleSV,
}: {
  node: any; label: string; show: boolean; opacity: number;
  progressiveDisclosure: boolean; expanded: boolean; hasKids: boolean;
  onPress: () => void; onDrag: (x: number, y: number) => void; onDragEnd: () => void;
  scaleSV: { value: number };
}) {
  const startX = useRef(0), startY = useRef(0);
  const moved = useRef(false);
  const r = node._r ?? rOf(node.kind);
  const boxW = node.kind === 'center' ? 160 : node.kind === 'core' ? 136 : 100;

  const drag = Gesture.Pan()
    .onStart(() => { startX.current = node.x; startY.current = node.y; moved.current = false; })
    .onUpdate(e => {
      if (Math.abs(e.translationX) > 3 || Math.abs(e.translationY) > 3) moved.current = true;
      // 画布缩放态下, 手势 translation 是屏幕像素; 除以 scale 才是画布坐标位移, 保证拖动跟手。
      const s = scaleSV.value || 1;
      runOnJS(onDrag)(startX.current + e.translationX / s, startY.current + e.translationY / s);
    })
    .onEnd(() => { runOnJS(onDragEnd)(); });
  const tap = Gesture.Tap().maxDistance(8).onEnd(() => { runOnJS(onPress)(); });
  const gesture = Gesture.Exclusive(drag, tap);

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        style={[
          styles.nodeHit,
          { left: (node.x ?? 0) - r, top: (node.y ?? 0) - r, width: r * 2, height: r * 2, opacity },
        ]}
      >
        {show ? (
          <View style={[styles.labelBox, { width: boxW, left: r - boxW / 2, top: r * 2 + 1 }]} pointerEvents="none">
            <Text
              style={[styles.nodeLabelText, node.kind === 'center' && styles.centerLabelText]}
              numberOfLines={node.kind === 'center' ? 3 : 2}
            >
              {label}{progressiveDisclosure && hasKids ? (expanded ? '  ▾' : '  ▸') : ''}
            </Text>
          </View>
        ) : null}
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 8 },
  viewport: {
    backgroundColor: colors.paperMain, borderRadius: 12, overflow: 'hidden',
    borderWidth: 1, borderColor: colors.paperDark,
  },
  canvas: { position: 'absolute', left: 0, top: 0 },
  nodeHit: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  labelBox: { position: 'absolute', alignItems: 'center' },
  nodeLabelText: { fontFamily: fonts.ui, fontSize: 10, lineHeight: 13, color: colors.inkPrimary, textAlign: 'center' },
  centerLabelText: { fontFamily: fonts.hero, fontSize: 12, lineHeight: 15 },
  btnRow: { position: 'absolute', top: 8, right: 8, flexDirection: 'row', gap: 6 },
  mapBtn: { backgroundColor: colors.paperCream, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5, borderWidth: 1, borderColor: colors.paperDark },
  mapBtnText: { fontFamily: fonts.ui, fontSize: 11, color: colors.inkSecondary },
  hint: { position: 'absolute', bottom: 6, alignSelf: 'center', fontFamily: fonts.ui, fontSize: 10, color: colors.inkSecondary, opacity: 0.75 },
});

export default ForceGraph;
