// #R36 ForceGraph — 单篇/多篇共享的力导向脑图组件。
// 内部: useMindForce (rAF 力松弛) + 画布 pan/pinch + 节点拖动 + 选中高亮(一跳邻居) + 渐进披露标签。
// 视觉: 暖色纸质风 (graphTheme), semantic 边贝塞尔虚线。
// 两页只传 graph + onSelect(弹各自详情) + 可选 progressiveDisclosure/expandable。
import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, Modal, useWindowDimensions, ScrollView } from 'react-native';
import Svg, { Line, Circle, Path } from 'react-native-svg';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, runOnJS, useDerivedValue,
} from 'react-native-reanimated';
import * as ScreenOrientation from 'expo-screen-orientation';
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
  // R40: 竖屏只给一个"全屏查看"按钮, 不内嵌渲染脑图 (Frank: 竖屏不需要展开, 直接切全屏看)
  entryOnly?: boolean;
  entryLabel?: string;
  // R40: 全屏内详情面板的跳转动作 (跳转前会先退全屏回竖屏)
  onPlay?: (sec: number) => void;
  onOpenCard?: (cardIndex: number) => void;
  // R40: concept 节点点开 → 该概念被哪些学习包讲到 (library 用, 一行一个)
  conceptPacks?: (node: MindNode) => { title: string; aspect?: string; onOpen?: () => void }[];
}

export function ForceGraph(props: ForceGraphProps) {
  // R39/R40: 真横屏全屏。竖屏(entryOnly)只显"全屏查看"按钮; 点击 → 锁横屏 + Modal 独占全屏渲染脑图。
  //   全屏默认全部节点展开 + 标签一律显示(不靠缩放); 点节点只显它+连接节点。跳转前先退全屏回竖屏。
  const [fullscreen, setFullscreen] = useState(false);
  const fsRef = useRef(false);
  const win = useWindowDimensions();

  const enterFullscreen = useCallback(async () => {
    try { await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE); } catch {}
    fsRef.current = true;
    setFullscreen(true);
  }, []);
  const exitFullscreen = useCallback(async () => {
    fsRef.current = false;
    setFullscreen(false);
    try { await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP); } catch {}
  }, []);

  // 安全兜底: 仅当卸载时仍处于全屏(横屏)才恢复竖屏, 避免误锁非全屏页面
  useEffect(() => {
    return () => { if (fsRef.current) ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {}); };
  }, []);

  // 竖屏入口态: 只渲染一个按钮, 点击进全屏
  if (props.entryOnly && !fullscreen) {
    return (
      <Pressable style={styles.entryBtn} onPress={enterFullscreen}>
        <Text style={styles.entryIcon}>⤢</Text>
        <Text style={styles.entryText}>{props.entryLabel || '全屏查看知识脑图'}</Text>
      </Pressable>
    );
  }

  if (fullscreen) {
    // 横屏后 useWindowDimensions 会返回横向尺寸 (宽>高)。画布用满, 留右上角关闭按钮位置。
    const fsW = win.width;
    const fsH = win.height;
    return (
      <Modal visible animationType="fade" onRequestClose={exitFullscreen} supportedOrientations={['landscape', 'landscape-left', 'landscape-right']}>
        <View style={styles.fsRoot}>
          <GraphCanvas {...props} width={fsW} height={fsH} fullscreen onToggleFullscreen={exitFullscreen} onRequestExitFullscreen={exitFullscreen} />
          <Pressable onPress={exitFullscreen} hitSlop={14} style={styles.fsCloseFloat}>
            <Text style={styles.fsCloseText}>✕</Text>
          </Pressable>
        </View>
      </Modal>
    );
  }
  return <GraphCanvas {...props} onToggleFullscreen={enterFullscreen} />;
}

function GraphCanvas({
  graph, width, height, base = 0.5, radialFn = 'single', charge,
  onSelect, progressiveDisclosure = false, labelFor, hintText,
  onPlay, onOpenCard, conceptPacks,
  fullscreen = false, onToggleFullscreen, onRequestExitFullscreen,
}: ForceGraphProps & { fullscreen?: boolean; onToggleFullscreen?: () => void; onRequestExitFullscreen?: () => void }) {
  // R40: 全屏默认全部展开(不再渐进披露要点 core 才展开)。渐进披露只在"非全屏内嵌"时有意义,
  //   而现在竖屏走 entryOnly 按钮不内嵌 → 实际进到 GraphCanvas 渲染的几乎都是全屏, 一律全展示。
  const showAll = fullscreen || !progressiveDisclosure;
  // 全屏横屏大画布铺更开; base 放大 + charge 更负, 配合尺寸重新 seed, 不重叠不挤压。
  const effBase = fullscreen ? Math.min(0.9, (base ?? 0.5) + 0.3) : base;
  const effCharge = fullscreen ? (charge ?? -260) * 1.7 : charge;
  const { nodes, pinDrag, release, reheat } = useMindForce({
    graph, width, height, base: effBase, rOf, radialFn, charge: effCharge,
  });
  const adjacency = useMemo(() => buildAdjacency(graph.edges), [graph.edges]);

  const [selected, setSelected] = useState<MindNode | null>(null);
  const [expandedCores, setExpandedCores] = useState<Set<string>>(new Set());

  // 画布 pan/pinch (整图平移缩放)
  const tx = useSharedValue(0), ty = useSharedValue(0), scale = useSharedValue(1);
  const s0 = useSharedValue(0), s1 = useSharedValue(0), s2 = useSharedValue(1);
  const [labelScale, setLabelScale] = useState(1);   // JS 侧镜像 scale, 控标签披露

  const canvasPan = Gesture.Pan()
    // R39: 仅全屏态启用整图平移。内嵌态(在 ScrollView 里)禁用画布 pan —— 否则单指拖画布
    //   会和页面竖直滚动打架, 表现为"拖脑图把整页往下拽"。内嵌只允许拖单个节点(DraggableLabel)。
    .enabled(fullscreen)
    .onStart(() => { s0.value = tx.value; s1.value = ty.value; })
    .onUpdate(e => { tx.value = s0.value + e.translationX; ty.value = s1.value + e.translationY; });
  const pinch = Gesture.Pinch()
    .enabled(fullscreen)   // 缩放同理, 内嵌不缩放(小图无意义 + 避免与页面手势冲突)
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

  // 高亮集: 选中节点 + 一跳邻居 (所有连接节点)
  const highlightSet = useMemo(() => {
    if (!selected) return null;
    const set = new Set<string>([selected.id]);
    (adjacency.get(selected.id) || new Set()).forEach(id => set.add(id));
    return set;
  }, [selected, adjacency]);

  // R40 可见性:
  //   - showAll(全屏/非渐进) 且无选中 → 全部节点可见 (一律全展示, 不靠缩放)
  //   - 有选中 → 只显选中节点 + 它的所有连接节点, 其余隐掉 (Frank: 点节点显所有连接, 其他隐掉)
  //   - 非 showAll 的旧渐进披露(理论上不再走到, 保留兜底)
  const visibleIds = useMemo(() => {
    if (selected && highlightSet) return highlightSet;   // 选中 → 只显它+连接
    if (showAll) return null;                            // null = 全显
    // 兜底: 旧渐进披露
    const vis = new Set<string>();
    for (const n of nodes) if (n.kind === 'center' || n.kind === 'core') vis.add(n.id);
    for (const e of graph.edges) if (e.kind === 'belong' && expandedCores.has(e.from)) vis.add(e.to);
    if (expandedCores.size > 0) for (const e of graph.edges) if (e.kind === 'skeleton' && e.from === 'center') vis.add(e.to);
    return vis;
  }, [selected, highlightSet, showAll, nodes, graph.edges, expandedCores]);

  const isVisible = useCallback((id: string) => !visibleIds || visibleIds.has(id), [visibleIds]);

  const nodeOpacity = (id: string) => 1;   // 可见的都全不透明 (不可见的已被 isVisible 过滤掉)
  const edgeOpacity = (a: string, b: string, baseOp: number) => baseOp;

  const doSelect = useCallback((n: MindNode | null) => {
    setSelected(n);
    onSelect?.(n);
  }, [onSelect]);

  // R40: 点节点 = 选中(→只显它+连接节点)。不再有"点 core 展开子节点"的两段式(已全展示)。
  const onNodePress = useCallback((n: MindNode) => {
    // 再点同一节点 → 取消选中回到全图
    setSelected(prev => (prev && prev.id === n.id ? null : n));
    onSelect?.(selected && selected.id === n.id ? null : n);
  }, [onSelect, selected]);

  const resetView = useCallback(() => {
    tx.value = withTiming(0); ty.value = withTiming(0); scale.value = withTiming(1);
    setLabelScale(1);
    setSelected(null);
    onSelect?.(null);
  }, [onSelect]);

  // R40: 标签一律显示 (可见节点都显, 不再靠 labelScale 阈值 → 修"展示不全/缩放才出来")
  const showLabel = useCallback((_n: MindNode) => true, []);

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
                progressiveDisclosure={false}
                expanded={false}
                hasKids={false}
                onPress={() => onNodePress(n)}
                onDrag={(x, y) => pinDrag(n.id, x, y)}
                onDragEnd={() => release(n.id)}
                scaleSV={scale}
              />
            ))}
          </Animated.View>
        </GestureDetector>

        {/* R40: 去掉"展开全部"(全屏已默认全展示); 留重排/复位; 位置往左挪不贴右边(避开右上角✕) */}
        <View style={styles.btnRow}>
          <Pressable style={styles.mapBtn} onPress={reheat}><Text style={styles.mapBtnText}>重排</Text></Pressable>
          <Pressable style={styles.mapBtn} onPress={resetView}><Text style={styles.mapBtnText}>复位</Text></Pressable>
        </View>
        {/* 右下角全屏 icon, 仅内嵌态(非全屏且非 entryOnly)显示 */}
        {onToggleFullscreen && !fullscreen ? (
          <Pressable style={styles.fsIconBtn} onPress={onToggleFullscreen} hitSlop={10}>
            <Text style={styles.fsIcon}>⤢</Text>
          </Pressable>
        ) : null}
        <Text style={styles.hint}>{hintText || '点节点看连接 · 拖动重排 · 双指缩放'}</Text>

        {/* R40: 全屏内点节点 → 底部详情面板 (label + detail + 跳转)。跳转前先退全屏回竖屏。
            concept 若有 conceptPacks → 一行一个学习包 + 哪方面, 多了内部滚动。 */}
        {fullscreen && selected ? (
          <View style={styles.fsDetail} pointerEvents="box-none">
            <View style={styles.fsDetailCard}>
              <View style={styles.fsDetailHead}>
                <Text style={styles.fsDetailKind}>
                  {selected.kind === 'center' ? '主旨' : selected.kind === 'core' ? '核心观点' : selected.kind === 'concept' ? '关键概念' : '知识卡片'}
                </Text>
                <Pressable onPress={() => { setSelected(null); onSelect?.(null); }} hitSlop={10}><Text style={styles.fsDetailClose}>✕</Text></Pressable>
              </View>
              <Text style={styles.fsDetailTitle}>{selected.label}</Text>
              <ScrollView style={styles.fsDetailScroll} showsVerticalScrollIndicator>
                {selected.detail ? <Text style={styles.fsDetailBody}>{selected.detail}</Text> : null}
                {/* library: 这个概念被哪些学习包讲到 — 一行一个 + 哪方面 + 跳转 */}
                {conceptPacks ? conceptPacks(selected).map((p, i) => (
                  <Pressable key={i} style={styles.fsPackRow} onPress={() => { onRequestExitFullscreen?.(); setTimeout(() => p.onOpen?.(), 350); }}>
                    <Text style={styles.fsPackTitle} numberOfLines={1}>{p.title}</Text>
                    {p.aspect ? <Text style={styles.fsPackAspect} numberOfLines={2}>{p.aspect}</Text> : null}
                    {p.onOpen ? <Text style={styles.fsPackGo}>打开 →</Text> : null}
                  </Pressable>
                )) : null}
              </ScrollView>
              <View style={styles.fsDetailActions}>
                {typeof selected.timestamp === 'number' && selected.timestamp > 0 && onPlay ? (
                  <Pressable style={styles.fsActBtn} onPress={() => { onRequestExitFullscreen?.(); const s = selected.timestamp as number; setTimeout(() => onPlay(s), 350); }}>
                    <Text style={styles.fsActBtnText}>▶ 听原文</Text>
                  </Pressable>
                ) : null}
                {selected.kind === 'card' && typeof selected.cardIndex === 'number' && onOpenCard ? (
                  <Pressable style={styles.fsActBtn} onPress={() => { onRequestExitFullscreen?.(); const ci = selected.cardIndex as number; setTimeout(() => onOpenCard(ci), 350); }}>
                    <Text style={styles.fsActBtnText}>看这张卡 →</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          </View>
        ) : null}
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
  fsRoot: { flex: 1, backgroundColor: colors.paperMain },
  fsCloseFloat: { position: 'absolute', top: 44, right: 20, width: 40, height: 40, borderRadius: 20, backgroundColor: colors.paperCream, borderWidth: 1, borderColor: colors.paperDark, alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  fsCloseText: { fontFamily: fonts.ui, fontSize: 18, color: colors.brick },
  fsIconBtn: { position: 'absolute', bottom: 8, right: 8, width: 34, height: 34, borderRadius: 17, backgroundColor: colors.paperCream, borderWidth: 1, borderColor: colors.paperDark, alignItems: 'center', justifyContent: 'center' },
  fsIcon: { fontFamily: fonts.ui, fontSize: 18, color: colors.inkSecondary, lineHeight: 22 },
  viewport: {
    backgroundColor: colors.paperMain, borderRadius: 12, overflow: 'hidden',
    borderWidth: 1, borderColor: colors.paperDark,
  },
  canvas: { position: 'absolute', left: 0, top: 0 },
  nodeHit: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  labelBox: { position: 'absolute', alignItems: 'center' },
  nodeLabelText: { fontFamily: fonts.ui, fontSize: 10, lineHeight: 13, color: colors.inkPrimary, textAlign: 'center' },
  centerLabelText: { fontFamily: fonts.hero, fontSize: 12, lineHeight: 15 },
  btnRow: { position: 'absolute', top: 10, left: 12, flexDirection: 'row', gap: 8 },
  mapBtn: { backgroundColor: colors.paperCream, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: colors.paperDark },
  mapBtnText: { fontFamily: fonts.ui, fontSize: 12, color: colors.inkSecondary },
  hint: { position: 'absolute', bottom: 6, alignSelf: 'center', fontFamily: fonts.ui, fontSize: 10, color: colors.inkSecondary, opacity: 0.75 },
  // R40 竖屏入口按钮 (点了进全屏)
  entryBtn: { marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.paperCream, borderRadius: 12, paddingVertical: 16, borderWidth: 1, borderColor: colors.paperDark },
  entryIcon: { fontFamily: fonts.ui, fontSize: 20, color: colors.brick },
  entryText: { fontFamily: fonts.ui, fontSize: 15, color: colors.inkPrimary },
  // R40 全屏详情面板 (底部, 右侧, 不挡脑图中心)
  fsDetail: { position: 'absolute', right: 16, bottom: 16, top: 70, width: 320, alignItems: 'flex-end', justifyContent: 'flex-end' },
  fsDetailCard: { backgroundColor: colors.paperCream, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.paperDark, maxHeight: '100%', width: '100%' },
  fsDetailHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  fsDetailKind: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 0.6, color: colors.inkSecondary, textTransform: 'uppercase', opacity: 0.7 },
  fsDetailClose: { fontFamily: fonts.ui, fontSize: 16, color: colors.inkSecondary },
  fsDetailTitle: { fontFamily: fonts.hero, fontSize: 16, lineHeight: 22, color: colors.inkPrimary, marginBottom: 6 },
  fsDetailScroll: { maxHeight: 220 },
  fsDetailBody: { fontFamily: fonts.body, fontSize: 13, lineHeight: 20, color: colors.inkPrimary, marginBottom: 8 },
  fsPackRow: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.paperDark, gap: 2 },
  fsPackTitle: { fontFamily: fonts.ui, fontSize: 13, color: colors.inkPrimary },
  fsPackAspect: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: colors.inkSecondary },
  fsPackGo: { fontFamily: fonts.ui, fontSize: 12, color: colors.brick, marginTop: 2 },
  fsDetailActions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  fsActBtn: { backgroundColor: colors.paperMain, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1, borderColor: colors.paperDark },
  fsActBtnText: { fontFamily: fonts.ui, fontSize: 13, color: colors.inkPrimary },
});

export default ForceGraph;
