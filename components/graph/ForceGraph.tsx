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

// R42(#4): 节点层级序 (center 最内 → concept/card 叶子)。用于"点节点只显相邻一个层级"。
function levelOf(kind: string): number {
  if (kind === 'center') return 0;
  if (kind === 'core') return 1;
  return 2; // concept / card 同为叶子层
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
  // R44: library 绿点(pack, kind=core, cardIndex=packId)点击 → 打开这一集
  onOpenPack?: (packId: number) => void;
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
  onPlay, onOpenCard, onOpenPack, conceptPacks,
  fullscreen = false, onToggleFullscreen, onRequestExitFullscreen,
}: ForceGraphProps & { fullscreen?: boolean; onToggleFullscreen?: () => void; onRequestExitFullscreen?: () => void }) {
  const win = useWindowDimensions();   // R43 诊断: 对比 window 尺寸 vs 传入的 canvas width/height, 查真机锁横屏时序
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

  const nodeById = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes]);

  // R42(#4)/R43: 高亮集 = 选中节点 + 一跳邻居中"相邻层级"的节点。用于"变亮", 非"可见性"。
  //   层级: center=0 core=1 concept/card=2。点 center 只亮 core(层级差≤1), 不跨级亮 concept。
  //   library 二分图 me(0)→pack(1)→concept(2) 全相邻, 行为不变。
  const highlightSet = useMemo(() => {
    if (!selected) return null;
    const set = new Set<string>([selected.id]);
    const selLv = levelOf(selected.kind);
    (adjacency.get(selected.id) || new Set()).forEach(id => {
      const nb = nodeById.get(id);
      if (nb && Math.abs(levelOf(nb.kind) - selLv) <= 1) set.add(id);
    });
    return set;
  }, [selected, adjacency, nodeById]);

  // R43: 可见性只由 showAll 决定, 选中不隐藏任何节点 (Frank: 要 library 那种"其他变暗淡", 不是隐藏)。
  //   全屏/非渐进 → 全显; 旧渐进披露兜底 (实际不再走到)。
  const visibleIds = useMemo(() => {
    if (showAll) return null;                            // null = 全显
    const vis = new Set<string>();
    for (const n of nodes) if (n.kind === 'center' || n.kind === 'core') vis.add(n.id);
    for (const e of graph.edges) if (e.kind === 'belong' && expandedCores.has(e.from)) vis.add(e.to);
    if (expandedCores.size > 0) for (const e of graph.edges) if (e.kind === 'skeleton' && e.from === 'center') vis.add(e.to);
    return vis;
  }, [showAll, nodes, graph.edges, expandedCores]);

  const isVisible = useCallback((id: string) => !visibleIds || visibleIds.has(id), [visibleIds]);

  // R43: 选中时 —— 高亮集(选中+相邻层)保持不透明, 其余节点/边变暗淡(留原位, 不隐藏不放大)。对齐 library。
  const nodeOpacity = useCallback((id: string) => {
    if (!highlightSet) return 1;
    return highlightSet.has(id) ? 1 : OPACITY.dimNode;
  }, [highlightSet]);
  const edgeOpacity = useCallback((a: string, b: string, baseOp: number) => {
    if (!highlightSet) return baseOp;
    return (highlightSet.has(a) && highlightSet.has(b)) ? OPACITY.activeEdge : OPACITY.dimEdge;
  }, [highlightSet]);

  // R42(#3): fit-to-viewport —— 力导向收敛后节点常聚成一团(尤其横屏大画布左右留白)。
  //   算可见节点 bounding box → 基础缩放+平移让整团居中铺满画布(留 padding)。
  //   R43: fit 不依赖 selected (只看全部可见节点) → 点节点不会重新缩放, 视图稳定, 只暗淡其他。
  //   用户 pan/pinch 在此基础变换之上叠加。仅全屏启用。上限 1.8 防标签放太大糊/失真。
  const fit = useMemo(() => {
    if (!fullscreen || !width || !height) return { s: 1, tx: 0, ty: 0 };
    const vis = nodes.filter(n => isVisible(n.id) && n.x != null && n.y != null);
    if (vis.length === 0) return { s: 1, tx: 0, ty: 0 };
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of vis) {
      const r = (n._cr ?? n._r ?? rOf(n.kind)) + 8;   // 含标签足迹半径, 别让边缘节点被裁
      minX = Math.min(minX, n.x! - r); maxX = Math.max(maxX, n.x! + r);
      minY = Math.min(minY, n.y! - r); maxY = Math.max(maxY, n.y! + r);
    }
    const PAD = 40;
    const bw = Math.max(1, maxX - minX), bh = Math.max(1, maxY - minY);
    // 放大填满画布(受较紧的一维约束); 上限 1.8 防标签放太大糊/失真。收敛团比画布小很多时也能铺开。
    const s = Math.min((width - PAD * 2) / bw, (height - PAD * 2) / bh, 1.8);
    // RN transform 的 scale 以 View 中心 C=(width/2,height/2) 为基准, 且 translate 不被 scale 缩放。
    //   要让节点 p 渲染到 s*p + tDesired (tDesired 使 bbox 中心落到画布中心):
    //     render = C + s*(p-C) + translate  ⟹  translate = tDesired - C*(1-s)
    //   其中 tDesired = 画布中心 - s*bbox中心。合并得 translate = (C - s*bcx) - C*(1-s) = s*(C - bcx)。
    const bcx = (minX + maxX) / 2, bcy = (minY + maxY) / 2;
    const cx = width / 2, cy = height / 2;
    const tx = s * (cx - bcx);
    const ty = s * (cy - bcy);
    return { s, tx, ty, bw, bh, bcx, bcy, n: vis.length };
  }, [fullscreen, width, height, nodes, isVisible]);

  // R43 诊断: 全屏后延迟 3.5s(等力导向收敛)上传一次尺寸/fit 快照到后端 client_logs, 供分析真机"展示不全"。
  //   web 测不出此 bug, 只能靠真机数据。仅全屏、每次进全屏上传一次。
  const diagSentRef = useRef(false);
  useEffect(() => {
    if (!fullscreen) { diagSentRef.current = false; return; }
    if (diagSentRef.current) return;
    const t = setTimeout(() => {
      diagSentRef.current = true;
      const nodeXY = nodes.slice(0, 6).map(n => ({ k: n.kind, x: Math.round(n.x ?? 0), y: Math.round(n.y ?? 0) }));
      const body = {
        event_name: 'mindmap_fullscreen_fit',
        screen: 'mindmap',
        ota_version: '75',
        event_data: {
          winW: Math.round(win.width), winH: Math.round(win.height),
          canvasW: Math.round(width), canvasH: Math.round(height),
          fitS: +(fit.s?.toFixed(3) ?? 0), fitTx: Math.round(fit.tx ?? 0), fitTy: Math.round(fit.ty ?? 0),
          bbox: { w: Math.round(fit.bw ?? 0), h: Math.round(fit.bh ?? 0), cx: Math.round(fit.bcx ?? 0), cy: Math.round(fit.bcy ?? 0) },
          visN: fit.n ?? 0, totalN: nodes.length,
          sample: nodeXY,
        },
      };
      const base = process.env.EXPO_PUBLIC_API_URL || 'https://api.k0.yiiling.cn';
      fetch(`${base}/api/debug/clientlog`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      }).catch(() => {});
    }, 3500);
    return () => clearTimeout(t);
  }, [fullscreen, width, height, win.width, win.height, nodes, fit]);

  // 用户 pan/pinch 叠加在 fit 基础变换之上 (fit 先应用=最内层, 手势在其上)。
  const canvasStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value }, { translateY: ty.value }, { scale: scale.value },
      { translateX: fit.tx }, { translateY: fit.ty }, { scale: fit.s },
    ],
  }));

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

        {/* R44 详情面板: kind chip + 标题 + 正文(可滚) + 主色跳转按钮。跳转前先退全屏回竖屏。 */}
        {fullscreen && selected ? (
          <View style={styles.fsDetail} pointerEvents="box-none">
            <View style={styles.fsDetailCard}>
              <View style={styles.fsDetailHead}>
                <View style={styles.fsKindChip}>
                  <Text style={styles.fsDetailKind}>
                    {selected.kind === 'center' ? '主旨' : selected.kind === 'core' ? (onOpenPack ? '学习包' : '核心观点') : selected.kind === 'concept' ? '关键概念' : '知识卡片'}
                  </Text>
                </View>
                <Pressable onPress={() => { setSelected(null); onSelect?.(null); }} hitSlop={12} style={styles.fsDetailCloseBtn}>
                  <Text style={styles.fsDetailClose}>✕</Text>
                </Pressable>
              </View>
              <Text style={styles.fsDetailTitle}>{selected.label}</Text>
              <ScrollView style={styles.fsDetailScroll} showsVerticalScrollIndicator>
                {selected.detail ? <Text style={styles.fsDetailBody}>{selected.detail}</Text> : null}
                {/* library concept: 被哪些学习包讲到 — 一行一个 + 跳转 */}
                {conceptPacks ? conceptPacks(selected).map((p, i) => (
                  <Pressable key={i} style={styles.fsPackRow} onPress={() => { onRequestExitFullscreen?.(); setTimeout(() => p.onOpen?.(), 350); }}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.fsPackTitle} numberOfLines={1}>{p.title}</Text>
                      {p.aspect ? <Text style={styles.fsPackAspect} numberOfLines={2}>{p.aspect}</Text> : null}
                    </View>
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
                  <Pressable style={styles.fsActBtnPrimary} onPress={() => { onRequestExitFullscreen?.(); const ci = selected.cardIndex as number; setTimeout(() => onOpenCard(ci), 350); }}>
                    <Text style={styles.fsActBtnPrimaryText}>看这张卡 →</Text>
                  </Pressable>
                ) : null}
                {/* R44: library 绿点(pack) → 打开这一集 */}
                {selected.kind === 'core' && typeof selected.cardIndex === 'number' && onOpenPack ? (
                  <Pressable style={styles.fsActBtnPrimary} onPress={() => { onRequestExitFullscreen?.(); const pid = selected.cardIndex as number; setTimeout(() => onOpenPack(pid), 350); }}>
                    <Text style={styles.fsActBtnPrimaryText}>打开这一集 →</Text>
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
  fsDetail: { position: 'absolute', right: 18, bottom: 18, top: 66, width: 340, alignItems: 'flex-end', justifyContent: 'flex-end' },
  fsDetailCard: { backgroundColor: colors.paperCream, borderRadius: 18, paddingHorizontal: 18, paddingTop: 14, paddingBottom: 16, borderWidth: 1, borderColor: colors.paperDark, maxHeight: '100%', width: '100%', shadowColor: '#3a2e1e', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.22, shadowRadius: 20, elevation: 10 },
  fsDetailHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  fsKindChip: { backgroundColor: colors.paperMain, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, borderWidth: 1, borderColor: colors.paperDark },
  fsDetailKind: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 0.8, color: colors.inkSecondary, textTransform: 'uppercase' },
  fsDetailCloseBtn: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paperMain, borderWidth: 1, borderColor: colors.paperDark },
  fsDetailClose: { fontFamily: fonts.ui, fontSize: 14, color: colors.inkSecondary, lineHeight: 16 },
  fsDetailTitle: { fontFamily: fonts.hero, fontSize: 18, lineHeight: 25, color: colors.inkPrimary, marginBottom: 8 },
  fsDetailScroll: { maxHeight: 200 },
  fsDetailBody: { fontFamily: fonts.body, fontSize: 13, lineHeight: 21, color: colors.inkPrimary, marginBottom: 8 },
  fsPackRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.paperDark },
  fsPackTitle: { fontFamily: fonts.ui, fontSize: 13, color: colors.inkPrimary },
  fsPackAspect: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: colors.inkSecondary, marginTop: 2 },
  fsPackGo: { fontFamily: fonts.ui, fontSize: 12, color: colors.brick },
  fsDetailActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  fsActBtn: { backgroundColor: colors.paperMain, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9, borderWidth: 1, borderColor: colors.paperDark },
  fsActBtnText: { fontFamily: fonts.ui, fontSize: 13, color: colors.inkPrimary },
  fsActBtnPrimary: { backgroundColor: colors.brick, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 9, shadowColor: colors.brick, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  fsActBtnPrimaryText: { fontFamily: fonts.ui, fontSize: 13, color: '#fff', fontWeight: '600' },
});

export default ForceGraph;
