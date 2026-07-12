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

  // 种子 (放射播种) — graph 或画布尺寸变才重播。
  //   R39: 加入 width/height 依赖 — 进出全屏(竖↔横)画布尺寸剧变时必须按新尺寸重新布局,
  //   否则沿用旧(小)尺寸的坐标 → 横屏下节点挤在中间一小块、重叠拥挤。
  const seeded = useMemo(
    () => seedForce(graph, { base, cx, cy, rOf, radialFn }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [graph, Math.round(width), Math.round(height)],
  );

  // 可变节点数组 (rAF 就地改, 不重新分配)
  const nodesRef = useRef<MindNode[]>(seeded.nodes);
  const simRef = useRef<ForceSim>(createSim({ cx, cy, charge: charge ?? -260 }));
  const [nodes, setNodes] = useState<MindNode[]>(seeded.nodes);
  const rafRef = useRef<number | null>(null);
  const tickCountRef = useRef(0);

  // graph 变 → 重置节点与 sim
  useEffect(() => {
    nodesRef.current = seeded.nodes.map(n => ({ ...n }));
    simRef.current = createSim({ cx, cy, charge: charge ?? -260 });
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
    if (sim.alpha < 0.15) { sim.alpha = 0.3; }
    tickCountRef.current = 0;
    startLoop();
  }, [startLoop]);

  const release = useCallback((id: string) => {
    const n = nodesRef.current.find(nd => nd.id === id);
    if (!n) return;
    n.fx = null; n.fy = null;
    const sim = simRef.current;
    if (sim.alpha < 0.15) { sim.alpha = 0.2; }
    startLoop();
  }, [startLoop]);

  // 手动重排 (复位后重新松弛)
  const reheat = useCallback(() => {
    simRef.current.alpha = 0.5;
    tickCountRef.current = 0;
    startLoop();
  }, [startLoop]);

  useEffect(() => stopLoop, [stopLoop]);

  return { nodes, pinDrag, release, reheat };
}
