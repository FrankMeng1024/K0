// #R36 useMindForce — 力导向脑图布局 hook (数据层走 hooks 原则)
// rAF 每帧调 forceTick 松弛坐标, 写 React state (30 节点无压力), 收敛(alpha<=alphaMin)即停 rAF 省电。
// 拖动: pinDrag 固定某节点 + alpha 回温重排, release 松开。
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  forceTick,
  seedForce,
  createSim,
  type MindNode,
  type MindEdge,
  type MindGraph,
  type ForceSim,
} from '@/lib/mindmap';

export interface UseMindForceOpts {
  graph: MindGraph | { nodes: MindNode[]; edges: any[] };
  width: number;
  height: number;
  base?: number;
  rOf: (kind: string) => number;
  radialFn?: 'single' | 'cross';
  charge?: number;         // 多篇二分图节点多 → 更负
  maxTicks?: number;       // 安全上限, 防极端不收敛空转
}

export function useMindForce({
  graph, width, height, base = 0.5, rOf, radialFn = 'single', charge, maxTicks = 600,
}: UseMindForceOpts) {
  const cx = width / 2;
  const cy = height / 2;

  // R44: 画布宽扁(横屏全屏)时, 让团长宽比逼近画布 → fit 能同时铺满宽和高。
  //   核心手段: 播种阶段就把节点横向拉开(stretchX), 团直接是宽扁形, 不靠力收敛(力太弱/衰减快)。
  //   辅助: 垂直引力略强/水平引力略弱, 维持形状。>1.3 才启用。iPhone 横屏 aspect≈2.17。
  const aspect = height > 0 ? width / height : 1;
  const stretchX = aspect > 1.3 ? Math.min(2.4, aspect * 0.95) : 1;
  const gravYMul = aspect > 1.3 ? 1.6 : 1;
  const gravXMul = aspect > 1.3 ? 0.7 : 1;

  // 种子 (放射播种) — graph 或画布尺寸变才重播。
  //   R39: 加入 width/height 依赖 — 进出全屏(竖↔横)画布尺寸剧变时必须按新尺寸重新布局,
  //   否则沿用旧(小)尺寸的坐标 → 横屏下节点挤在中间一小块、重叠拥挤。
  const seeded = useMemo(
    () => seedForce(graph, { base, cx, cy, rOf, radialFn, stretchX }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [graph, Math.round(width), Math.round(height)],
  );

  // 可变节点数组 (rAF 就地改, 不重新分配)
  const nodesRef = useRef<MindNode[]>(seeded.nodes);
  const simRef = useRef<ForceSim>(createSim({ cx, cy, charge: charge ?? -260, gravXMul, gravYMul }));
  const [nodes, setNodes] = useState<MindNode[]>(seeded.nodes);
  const [settled, setSettled] = useState(false);   // R47: 力导向收敛完成信号 → UI 显 loading 直到 true
  const rafRef = useRef<number | null>(null);
  const tickCountRef = useRef(0);

  // graph 变 → 重置节点与 sim
  useEffect(() => {
    nodesRef.current = seeded.nodes.map(n => ({ ...n }));
    simRef.current = createSim({ cx, cy, charge: charge ?? -260, gravXMul, gravYMul });
    tickCountRef.current = 0;
    setSettled(false);   // R47: 重新布局 → 未收敛
    setNodes(nodesRef.current);
    startLoop();
    // R47 兜底: 最多 3.5s 强制标记收敛(防 rAF 被节流/极端不收敛导致 loading 永不消失)。
    const settleTimer = setTimeout(() => setSettled(true), 3500);
    return () => { stopLoop(); clearTimeout(settleTimer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seeded]);

  const stopLoop = useCallback(() => {
    if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
  }, []);

  const startLoop = useCallback(() => {
    if (rafRef.current != null) return; // 已在跑
    const loop = () => {
      const sim = simRef.current;
      forceTick(nodesRef.current, seeded.edges, sim);
      tickCountRef.current += 1;
      // 触发渲染 (浅拷贝, 让 SVG/标签读新坐标)
      setNodes(nodesRef.current.map(n => ({ ...n })));
      if (sim.alpha > sim.alphaMin && tickCountRef.current < maxTicks) {
        rafRef.current = requestAnimationFrame(loop);
      } else {
        rafRef.current = null; // 收敛, 停 rAF
        setSettled(true);      // R47: 收敛完成 → UI 可冻结 fit + 显示脑图
      }
    };
    rafRef.current = requestAnimationFrame(loop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seeded, maxTicks]);

  // 拖动: 只移动被拖的球到 (x,y), 停掉收敛循环 → 其他球完全不动, 被拖球和手指位移完全一致(Frank)。
  const pinDrag = useCallback((id: string, x: number, y: number) => {
    stopLoop();   // 停掉可能还在跑的收敛 rAF, 否则 forceTick 每帧仍在动所有球
    const n = nodesRef.current.find(nd => nd.id === id);
    if (!n) return;
    n.fx = x; n.fy = y; n.x = x; n.y = y; n.vx = 0; n.vy = 0;
    setNodes(nodesRef.current.map(nd => ({ ...nd })));   // 只有被拖球位置变
  }, [stopLoop]);

  const release = useCallback((id: string) => {
    const n = nodesRef.current.find(nd => nd.id === id);
    if (!n) return;
    // 松手后球留在拖到的位置(保持 pin), 不放开, 不重排(Frank: 拖到位置不要弹回, 其他球别乱动)。
    n.fx = n.x; n.fy = n.y;
  }, []);

  // 手动重排 (Frank: 回到最初的位置) —— 重置节点到初始 seed 坐标 + 清 pin, 再从头松弛。
  const reheat = useCallback(() => {
    nodesRef.current = seeded.nodes.map(n => ({ ...n, fx: null, fy: null, vx: 0, vy: 0 }));
    simRef.current = createSim({ cx, cy, charge: charge ?? -260, gravXMul, gravYMul });
    tickCountRef.current = 0;
    setNodes(nodesRef.current);
    startLoop();
  }, [startLoop, seeded, cx, cy, charge, gravXMul, gravYMul]);

  useEffect(() => stopLoop, [stopLoop]);

  return { nodes, pinDrag, release, reheat, settled };
}
