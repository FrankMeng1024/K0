// K0 单篇脑图 (#111 / R36 力导向 / R40 竖屏入口→全屏) — 消费 buildMindGraph, 渲染委托 ForceGraph。
// R40: 竖屏不内嵌脑图, 只给"全屏查看"按钮; 点了进全屏横屏, 全部节点展开, 点节点显所有连接节点。
//   详情面板 + 跳转(听原文/看卡片)在全屏内, 跳转前先退全屏回竖屏。
import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { buildMindGraph } from '@/lib/mindmap';
import { ForceGraph } from '@/components/graph/ForceGraph';
import type { PackObject } from '@/types/pack';

export function MindMap({
  pack,
  onPlay,
  onOpenCard,
}: {
  pack: PackObject;
  onPlay?: (sec: number) => void;
  onOpenCard?: (cardIndex: number) => void;
}) {
  const graph = useMemo(() => buildMindGraph(pack), [pack]);

  return (
    <View style={styles.wrap}>
      <ForceGraph
        graph={graph}
        width={0}
        height={0}
        base={0.5}
        radialFn="single"
        charge={-260}
        entryOnly
        entryLabel="全屏查看知识脑图"
        onPlay={onPlay}
        onOpenCard={onOpenCard}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 8 },
});

export default MindMap;
