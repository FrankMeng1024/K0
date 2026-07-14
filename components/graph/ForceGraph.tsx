// #R36 ForceGraph — 单篇/多篇共享的力导向脑图组件。
// 内部: useMindForce (rAF 力松弛) + 画布 pan/pinch + 节点拖动 + 选中高亮(一跳邻居) + 渐进披露标签。
// 视觉: 暖色纸质风 (graphTheme), semantic 边贝塞尔虚线。
// 两页只传 graph + onSelect(弹各自详情) + 可选 progressiveDisclosure/expandable。
import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, Modal, useWindowDimensions, ScrollView, ActivityIndicator } from 'react-native';
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
  // R55(Arch review C1): iPad 退全屏不能锁死竖屏(否则 iPad 退脑图后整个 app 卡竖屏)。
  //   短边≥600 视为平板: 退全屏/卸载 → unlockAsync 恢复自由旋转; 手机 → lock PORTRAIT_UP(原行为)。
  const isTablet = Math.min(win.width, win.height) >= 600;
  const restoreOrientation = useCallback(async () => {
    try {
      if (isTablet) await ScreenOrientation.unlockAsync();
      else await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    } catch {}
  }, [isTablet]);

  const enterFullscreen = useCallback(async () => {
    try { await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE); } catch {}
    fsRef.current = true;
    setFullscreen(true);
  }, []);
  const exitFullscreen = useCallback(async () => {
    fsRef.current = false;
    props.onSelect?.(null);   // R49: 退全屏必须清父层选中(修 library 缩小后下方残留 detailSheet)
    // R52: 修"两次旋转"抖动。先 await 恢复方向、转完再关 Modal → 连贯一次旋转。
    // R55: 恢复方向按设备分支(iPad unlock / 手机 lock 竖屏), 见 restoreOrientation。
    await restoreOrientation();
    setFullscreen(false);
  }, [props, restoreOrientation]);

  // 安全兜底: 仅当卸载时仍处于全屏(横屏)才恢复方向(iPad unlock / 手机锁竖屏)。
  const restoreRef = useRef(restoreOrientation); restoreRef.current = restoreOrientation;
  useEffect(() => {
    return () => { if (fsRef.current) restoreRef.current(); };
  }, []);

  // 竖屏入口态: 只渲染一个按钮, 点击进全屏
  if (props.entryOnly && !fullscreen) {
    return (
      <Pressable style={styles.entryBtn} onPress={enterFullscreen}>
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
  // R50: 修隐形遮罩裁切 —— SVG/画布若用屏幕尺寸(932×430), 力导向把节点吹到 bbox~1325×584(还含负坐标),
  //   超出 SVG 自身边界的节点被 SVG viewport 裁掉(Frank: "超出一定范围被剪切 / 之前无限大画布才能全展示")。
  //   修法: 全屏用一个足够大的固定世界画布 CANVAS, 节点围绕其中心散开永不越界; 单矩阵 fit 再缩到屏幕。
  //   本质是"大画布+fit", 但保留 R48/49 的干净单矩阵(拖动/退全屏已 OK, 不改)。
  const CANVAS = 2400;   // 固定世界画布(远大于任何 30 节点力导向 bbox 峰值~1400), 全屏用它 seed+渲染
  // 全屏横屏大画布铺更开; base 放大 + charge 更负, 配合尺寸重新 seed, 不重叠不挤压。
  const effBase = fullscreen ? Math.min(0.9, (base ?? 0.5) + 0.3) : base;
  // R48: 全屏不再 ×1.7 放大斥力(之前团被吹太散→连线交叉多)。用传入 charge 本身, 团更紧凑, fit 后交叉少。
  const effCharge = fullscreen ? (charge ?? -260) : charge;
  // R50: 全屏 seed 到大世界画布(节点保持正坐标不越界); 非全屏内嵌仍用容器尺寸。
  //   画布按屏幕长宽比放大(横屏→宽扁大画布), 让 seedForce 的 stretchX 生效, 团铺成宽扁形匹配横屏, fit 后更满。
  const fsAspect = fullscreen && height > 0 ? width / height : 1;
  const layoutW = fullscreen ? Math.round(CANVAS * Math.max(1, fsAspect)) : width;
  const layoutH = fullscreen ? CANVAS : height;
  const { nodes, pinDrag, release, reheat, settled } = useMindForce({
    graph, width: layoutW, height: layoutH, base: effBase, rOf, radialFn, charge: effCharge,
  });
  const adjacency = useMemo(() => buildAdjacency(graph.edges), [graph.edges]);

  const [selected, setSelected] = useState<MindNode | null>(null);
  const [expandedCores, setExpandedCores] = useState<Set<string>>(new Set());

  // R44d 诊断: 上传交互日志到 /api/debug/clientlog, Frank 真机操作后从服务器读, 对症修拖动/缩放/重排。
  const diag = useCallback((name: string, data: any) => {
    const base = process.env.EXPO_PUBLIC_API_URL || 'https://api.k0.yiiling.cn';
    fetch(`${base}/api/debug/clientlog`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_name: name, screen: 'mindmap', ota_version: '95', event_data: data }),
    }).catch(() => {});
  }, []);

  // R48: 单一世界变换矩阵 screen = worldPos * scale + (tx,ty)。弃"大画布2.6x+centerTX+fitS"三层嵌套。
  //   画布/SVG = 屏幕尺寸, 节点直接用世界坐标 n.x/n.y 画; 变换全在 canvasStyle。
  //   fit 只烧进初始 scale/tx/ty(settled 后一次); 缩放用 focal 公式; 拖动只除 scale。
  const scale = useSharedValue(1);
  const tx = useSharedValue(0), ty = useSharedValue(0);
  const savedS = useSharedValue(1), savedTx = useSharedValue(0), savedTy = useSharedValue(0);
  const panTx = useSharedValue(0), panTy = useSharedValue(0);
  const [labelScale, setLabelScale] = useState(1);   // JS 侧镜像 scale, 控标签/诊断
  const fitDoneRef = useRef(false);
  const userTouchedRef = useRef(false);   // R49: 用户 pan/pinch/拖动后 → 冻结 fit, 不再自动重算
  const nodesRefFit = useRef<any[]>(nodes); nodesRefFit.current = nodes;
  const PAD = 40;

  // fit: 按节点团 bbox 铺满居中, 烧进 scale/tx/ty。animated 时平滑(复位用)。
  const applyFit = useCallback((animated: boolean) => {
    const vis = nodesRefFit.current.filter((n: any) => n.x != null && n.y != null);
    if (!vis.length) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of vis) { const r = (n._cr ?? n._r ?? rOf(n.kind)) + 8; minX = Math.min(minX, n.x - r); maxX = Math.max(maxX, n.x + r); minY = Math.min(minY, n.y - r); maxY = Math.max(maxY, n.y + r); }
    const bw = Math.max(1, maxX - minX), bh = Math.max(1, maxY - minY);
    const S = Math.min((width - PAD * 2) / bw, (height - PAD * 2) / bh, 1.4);
    const nTx = width / 2 - S * ((minX + maxX) / 2);
    const nTy = height / 2 - S * ((minY + maxY) / 2);
    if (animated) { scale.value = withTiming(S); tx.value = withTiming(nTx); ty.value = withTiming(nTy); }
    else { scale.value = S; tx.value = nTx; ty.value = nTy; }
    setLabelScale(S);
  }, [width, height]);

  // R49: fit 必须跟随"最终"bbox。之前只在 settled 那一刻烧一次 → 力导向还在收缩,
  //   bbox 那刻偏大(团更散/更高) → S 算小(实测 0.346 而非应有的 0.556) → 图显得很小挤中间。
  //   改为: 全屏且用户未触碰前, 每次 nodes 变都重 fit(loading 盖住过程, 收敛完自然停在正确 fit)。
  //   用户一 pan/pinch/拖动 → userTouchedRef=true 冻结, 不再抢用户视角。
  useEffect(() => {
    if (!fullscreen) { fitDoneRef.current = false; userTouchedRef.current = false; return; }
    if (userTouchedRef.current) return;   // 用户已接管视角
    applyFit(false);
    fitDoneRef.current = true;
  }, [fullscreen, settled, nodes, applyFit]);

  // canvasStyle: 先平移后缩放, 以左上角(0,0)为原点 → 精确匹配 screen = world*S + T。
  const canvasStyle = useAnimatedStyle(() => ({
    transformOrigin: 'top left',
    transform: [
      { translateX: tx.value }, { translateY: ty.value }, { scale: scale.value },
    ],
  }));

  // R49: 用户接管视角标记(pan/pinch/拖动触发) → 停止自动 fit。
  const markTouched = useCallback(() => { userTouchedRef.current = true; }, []);

  // 画布平移 (单指): onStart 存 tx/ty, onUpdate 加位移。
  const canvasPan = Gesture.Pan()
    .enabled(fullscreen)
    .maxPointers(1)
    .onStart(() => { runOnJS(markTouched)(); panTx.value = tx.value; panTy.value = ty.value; })
    .onUpdate(e => { tx.value = panTx.value + e.translationX; ty.value = panTy.value + e.translationY; });
  // 双指缩放: 以两指中点 focalX/focalY 为不动点(RNGH 直接给焦点)。
  const pinch = Gesture.Pinch()
    .enabled(fullscreen)
    .onStart(() => { runOnJS(markTouched)(); savedS.value = scale.value; savedTx.value = tx.value; savedTy.value = ty.value; runOnJS(setSelected)(null); })
    .onUpdate(e => {
      const s = Math.max(0.3, Math.min(3, savedS.value * e.scale));
      tx.value = e.focalX - (e.focalX - savedTx.value) * (s / savedS.value);
      ty.value = e.focalY - (e.focalY - savedTy.value) * (s / savedS.value);
      scale.value = s;
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

  // R48 诊断: 全屏收敛后上传一次尺寸/fit 快照(供真机分析)。
  const diagSentRef = useRef(false);
  useEffect(() => {
    if (!fullscreen) { diagSentRef.current = false; return; }
    if (diagSentRef.current || !settled) return;
    diagSentRef.current = true;
    const vis = nodes.filter(n => n.x != null && n.y != null);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of vis) { minX = Math.min(minX, n.x!); maxX = Math.max(maxX, n.x!); minY = Math.min(minY, n.y!); maxY = Math.max(maxY, n.y!); }
    const body = {
      event_name: 'mindmap_fullscreen_fit', screen: 'mindmap', ota_version: '95',
      event_data: {
        screenW: Math.round(width), screenH: Math.round(height),
        fitS: +labelScale.toFixed(3),
        bbox: { w: Math.round(maxX - minX), h: Math.round(maxY - minY) },
        totalN: nodes.length,
      },
    };
    const base = process.env.EXPO_PUBLIC_API_URL || 'https://api.k0.yiiling.cn';
    fetch(`${base}/api/debug/clientlog`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => {});
  }, [fullscreen, settled, nodes, width, height, labelScale]);

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
    setSelected(null);
    onSelect?.(null);
    userTouchedRef.current = false;   // R49: 复位 → 恢复自动 fit 跟随
    applyFit(true);   // R48: 复位 = 平滑回到 fit 视角(团铺满居中), 不再回 (0,0,1)
  }, [onSelect, applyFit]);

  // R40: 标签一律显示 (可见节点都显, 不再靠 labelScale 阈值 → 修"展示不全/缩放才出来")
  const showLabel = useCallback((_n: MindNode) => true, []);

  return (
    <View style={fullscreen ? styles.wrapFull : styles.wrap}>
      <View style={[fullscreen ? styles.viewportFull : styles.viewport, { width, height }]}>
        {/* R51: 手势挂在"未变换的屏幕尺寸 View"上, 保证 e.focalX/focalY 是稳定的屏幕坐标(与 tx/ty 同系)。
            之前手势直接挂在被 scale+translate 的大画布上 → focalX 在变换后坐标系里 → 偏移点缩放严重偏离。 */}
        <GestureDetector gesture={canvasGesture}>
          <View style={[styles.gestureLayer, { width, height }]} collapsable={false}>
            <Animated.View style={[styles.canvas, canvasStyle, { width: layoutW, height: layoutH }]}>
              <Svg width={layoutW} height={layoutH}>
              {graph.edges.map((e: any, i: number) => {
                const a = nodeById.get(e.from); const b = nodeById.get(e.to);
                if (!a || !b || a.x == null || b.x == null) return null;
                if (!isVisible(e.from) || !isVisible(e.to)) return null;
                const st = EDGE_STYLE[e.kind as keyof typeof EDGE_STYLE] || EDGE_STYLE.belong;
                const baseOp = e.kind === 'semantic' ? 0.55 : e.kind === 'skeleton' ? 0.55 : 0.4;
                const op = edgeOpacity(e.from, e.to, baseOp);
                const w = e.kind === 'semantic' ? Math.min(4, st.width + (e.weight ? e.weight - 1 : 0)) : st.width;
                const ax = a.x, ay = a.y!, bx = b.x, by = b.y!;
                if (st.curve) {
                  return (
                    <Path key={`e${i}`} d={bezierPath(ax, ay, bx, by)}
                      stroke={st.stroke} strokeWidth={w} strokeDasharray={st.dash} fill="none" opacity={op} />
                  );
                }
                return (
                  <Line key={`e${i}`} x1={ax} y1={ay} x2={bx} y2={by}
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
                getStart={() => { const cur = nodeById.get(n.id); return { x: cur?.x ?? n.x ?? 0, y: cur?.y ?? n.y ?? 0 }; }}
                onDrag={(x, y) => { userTouchedRef.current = true; pinDrag(n.id, x, y); }}
                onDragEnd={() => release(n.id)}
                scaleSV={scale}
                panGesture={canvasPan}
              />
            ))}
          </Animated.View>
          </View>
        </GestureDetector>

        {/* R40: 去掉"展开全部"(全屏已默认全展示); 留重排/复位; 位置往左挪不贴右边(避开右上角✕) */}
        <View style={styles.btnRow}>
          <Pressable style={styles.mapBtn} onPress={() => {
            const before = nodes.slice(0, 3).map(n => ({ k: n.kind, x: Math.round(n.x ?? 0), y: Math.round(n.y ?? 0) }));
            reheat();
            if (fullscreen) diag('reheat', { beforeSample: before });
          }}><Text style={styles.mapBtnText}>重排</Text></Pressable>
          <Pressable style={styles.mapBtn} onPress={resetView}><Text style={styles.mapBtnText}>复位</Text></Pressable>
        </View>
        {/* 右下角全屏 icon, 仅内嵌态(非全屏且非 entryOnly)显示 */}
        {onToggleFullscreen && !fullscreen ? (
          <Pressable style={styles.fsIconBtn} onPress={onToggleFullscreen} hitSlop={10}>
            <Text style={styles.fsIcon}>⤢</Text>
          </Pressable>
        ) : null}
        <Text style={styles.hint}>{hintText || '点节点看连接 · 拖动重排 · 双指缩放'}</Text>

        {/* R47: 收敛前显示 loading, 盖住画布(避免用户看到节点乱跳/交叉线未散); 收敛(settled)后消失显示终态图。 */}
        {fullscreen && !settled ? (
          <View style={styles.loadingOverlay} pointerEvents="none">
            <ActivityIndicator size="large" color={colors.brick} />
            <Text style={styles.loadingText}>正在整理知识脑图…</Text>
          </View>
        ) : null}

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

// 单个节点的标签 + 拖动手势 (拖动只 pin 该节点, 世界位移只除 scale → 1:1 跟手)
function DraggableLabel({
  node, label, show, opacity, progressiveDisclosure, expanded, hasKids, onPress, getStart, onDrag, onDragEnd, scaleSV, panGesture,
}: {
  node: any; label: string; show: boolean; opacity: number;
  progressiveDisclosure: boolean; expanded: boolean; hasKids: boolean;
  onPress: () => void; getStart: () => { x: number; y: number }; onDrag: (x: number, y: number) => void; onDragEnd: () => void;
  scaleSV: { value: number };
  panGesture?: any;   // R48: 画布 pan 手势, 节点拖动时阻止它 → 拖节点不触发整图平移
}) {
  const startX = useRef(0), startY = useRef(0);
  const started = useRef(false);
  const moved = useRef(false);
  const r = node._r ?? rOf(node.kind);
  const boxW = node.kind === 'center' ? 160 : node.kind === 'core' ? 136 : 100;

  // R49: 拖动起点必须在 JS 侧实时读当前节点坐标(getStart 从 live nodes 拿),
  //   绝不能在 worklet 里读 node.x —— worklet 捕获的是创建那刻的 JS 快照, rAF 换 node 对象后读到旧/undefined
  //   → startX=0 → 拖动从(0,0)左上角起跳(Frank v86 反馈的"跳左上角那个点")。
  const captureStart = useCallback(() => {
    const s = getStart();
    startX.current = s.x; startY.current = s.y; started.current = true; moved.current = false;
  }, [getStart]);
  const applyDrag = useCallback((tX: number, tY: number, s: number) => {
    if (!started.current) return;   // 起点未落定前不动, 防第一帧用旧起点
    if (Math.abs(tX) > 3 || Math.abs(tY) > 3) moved.current = true;
    onDrag(startX.current + tX / (s || 1), startY.current + tY / (s || 1));
  }, [onDrag]);

  const drag = Gesture.Pan()
    .onStart(() => { runOnJS(captureStart)(); })
    .onUpdate(e => {
      // 屏幕位移 → 世界位移 只需除以 scale(T 不影响位移增量)。全部换算在 JS 侧, 起点用实时 live 坐标。
      runOnJS(applyDrag)(e.translationX, e.translationY, scaleSV.value || 1);
    })
    .onEnd(() => { started.current = false; runOnJS(onDragEnd)(); });
  if (panGesture) drag.blocksExternalGesture(panGesture);   // R48: 拖节点时阻止画布 pan(否则单指按节点触发整图平移)
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
  wrapFull: { flex: 1 },   // R49: 全屏无 marginTop, 铺满 Modal
  fsRoot: { flex: 1, backgroundColor: colors.paperMain },
  loadingOverlay: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paperMain, gap: 12 },
  loadingText: { fontFamily: fonts.ui, fontSize: 14, color: colors.inkSecondary },
  fsCloseFloat: { position: 'absolute', top: 44, right: 20, width: 40, height: 40, borderRadius: 20, backgroundColor: colors.paperCream, borderWidth: 1, borderColor: colors.paperDark, alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  fsCloseText: { fontFamily: fonts.ui, fontSize: 18, color: colors.brick },
  fsIconBtn: { position: 'absolute', bottom: 8, right: 8, width: 34, height: 34, borderRadius: 17, backgroundColor: colors.paperCream, borderWidth: 1, borderColor: colors.paperDark, alignItems: 'center', justifyContent: 'center' },
  fsIcon: { fontFamily: fonts.ui, fontSize: 18, color: colors.inkSecondary, lineHeight: 22 },
  viewport: {
    backgroundColor: colors.paperMain, borderRadius: 12, overflow: 'hidden',
    borderWidth: 1, borderColor: colors.paperDark,
  },
  // R49: 全屏无边框无圆角(修 Frank "遮罩小一圈把球遮掉"); overflow visible 让 fit 后边缘球不被裁。
  viewportFull: { backgroundColor: colors.paperMain },
  canvas: { position: 'absolute', left: 0, top: 0 },
  gestureLayer: { position: 'absolute', left: 0, top: 0, overflow: 'visible' },   // R51: 未变换的手势层(屏幕尺寸), 稳定 focalX/Y
  nodeHit: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  labelBox: { position: 'absolute', alignItems: 'center' },
  nodeLabelText: { fontFamily: fonts.ui, fontSize: 10, lineHeight: 13, color: colors.inkPrimary, textAlign: 'center' },
  centerLabelText: { fontFamily: fonts.hero, fontSize: 12, lineHeight: 15 },
  // R55e(#5): 重排/复位 从角落(top10/left12)移到更舒适的内缩位置, 按钮加大更好点。
  btnRow: { position: 'absolute', top: 44, left: 24, flexDirection: 'row', gap: 12 },
  mapBtn: { backgroundColor: colors.paperCream, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 10, borderWidth: 1, borderColor: colors.paperDark },
  mapBtnText: { fontFamily: fonts.ui, fontSize: 15, color: colors.inkSecondary },
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
