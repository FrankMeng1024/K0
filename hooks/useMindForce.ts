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
  const rafRef = useRef<number | null>(null);
  const tickCountRef = useRef(0);

  // graph 变 → 重置节点与 sim
  useEffect(() => {
    nodesRef.current = seeded.nodes.map(n => ({ ...n }));
    simRef.current = createSim({ cx, cy, charge: charge ?? -260, gravXMul, gravYMul });
    tickCountRef.current = 0;
    setNodes(nodesRef.current);
    startLoop();
    return stopLoop;
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
      }
    };
    rafRef.current = requestAnimationFrame(loop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seeded, maxTicks]);

  // 拖动: pin 该节点到 (x,y) + alpha 回温让其余点重排
  const pinDrag = useCallback((id: string, x: number, y: number) => {
    const n = nodesRef.current.find(nd => nd.id === id);
    if (!n) return;
    n.fx = x; n.fy = y; n.x = x; n.y = y;
    const sim = simRef.current;
    // R44b: 拖动时轻微物理 —— 只给很小 alpha 让周围球缓慢让位, 不剧烈重排(Frank: 速度别太快)。
    if (sim.alpha < 0.08) { sim.alpha = 0.08; }
    tickCountRef.current = 0;
    startLoop();
  }, [startLoop]);

  const release = useCallback((id: string) => {
    const n = nodesRef.current.find(nd => nd.id === id);
    if (!n) return;
    // R44b: 不弹回 —— 松手后球留在拖到的位置(保持 pin), 不放开让力把它拉回原处(Frank: 拖到位置不要弹回)。
    //   只做一次极轻的邻居松弛就停。
    const sim = simRef.current;
    if (sim.alpha < 0.05) { sim.alpha = 0.05; }
    startLoop();
  }, [startLoop]);

  // 手动重排 (Frank: 回到最初的位置) —— 重置节点到初始 seed 坐标 + 清 pin, 再从头松弛。
  const reheat = useCallback(() => {
    nodesRef.current = seeded.nodes.map(n => ({ ...n, fx: null, fy: null, vx: 0, vy: 0 }));
    simRef.current = createSim({ cx, cy, charge: charge ?? -260, gravXMul, gravYMul });
    tickCountRef.current = 0;
    setNodes(nodesRef.current);
    startLoop();
  }, [startLoop, seeded, cx, cy, charge, gravXMul, gravYMul]);

  useEffect(() => stopLoop, [stopLoop]);

  return { nodes, pinDrag, release, reheat };
}
