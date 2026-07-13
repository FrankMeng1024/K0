// K0 跨集知识图谱 (#113 / R36 二分图重构)
// Obsidian 式: 每个概念本身是节点, 学习包连到它包含的概念, 两篇因共享同一概念节点自然成网。
// 力导向布局 (ForceGraph 共享组件): 节点动态散开、可拖动、连线交叉少。
// 点 pack → 打开学习包; 点概念 → 看哪些学习包都讲到它。数据: GET /api/library/knowledge-graph。
import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { colors, fonts, spacing } from '@/constants/theme';
import { ScreenHeader } from '@/components/ScreenHeader';
import { apiGet } from '@/lib/api';
import { buildCrossPackGraph, type CrossPackInput, type MindNode } from '@/lib/mindmap';
import { ForceGraph } from '@/components/graph/ForceGraph';

export default function KnowledgeMap() {
  const { width: winW } = useWindowDimensions();
  const viewW = winW - 32;
  const viewH = 480;

  const [packs, setPacks] = useState<CrossPackInput[] | null>(null);
  const [semanticEdges, setSemanticEdges] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<MindNode | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiGet<{ packs: CrossPackInput[]; semanticEdges?: any[] }>('/api/library/knowledge-graph')
      .then(r => { if (!cancelled) { setPacks(r.packs || []); setSemanticEdges(r.semanticEdges || []); } })
      .catch(e => { if (!cancelled) setError(e?.message || '加载失败'); });
    return () => { cancelled = true; };
  }, []);

  const graph = useMemo(
    () => packs ? buildCrossPackGraph(packs, semanticEdges) : null,
    [packs, semanticEdges],
  );

  // 概念连接统计 (引导文案)
  const sharedConceptCount = useMemo(() => {
    if (!graph) return 0;
    return graph.nodes.filter(n => n.kind === 'concept' && n.color === 'shared').length;
  }, [graph]);

  const introSuffix = sharedConceptCount > 0
    ? ` · ${sharedConceptCount} 个概念把它们连了起来`
    : ' · 学更多相关主题，它们就会通过共享概念连成网';

  return (
    <View style={styles.root}>
      <ScreenHeader title="知识图谱" subtitle="你学过的每一集，通过概念连成网" onBack={() => router.back()} />
      <View style={styles.body}>
        {error ? (
          <View style={styles.center}><Text style={styles.errText}>{error}</Text></View>
        ) : !graph ? (
          <View style={styles.center}><ActivityIndicator color={colors.brick} /></View>
        ) : packs && packs.length === 0 ? (
          <View style={styles.center}><Text style={styles.emptyText}>学完几集后，它们的知识就会在这里连起来</Text></View>
        ) : (
          <>
            <Text style={styles.intro}>{packs!.length} 个学习包{introSuffix}</Text>
            <ForceGraph
              graph={graph}
              width={0}
              height={0}
              base={0.62}
              radialFn="cross"
              charge={-420}
              entryOnly
              entryLabel="全屏查看知识图谱"
              onSelect={setSelected}
              onOpenPack={(packId) => router.push({ pathname: '/episode/[id]', params: { id: String(packId), direct: '1', packId: String(packId) } })}
              conceptPacks={(node) => {
                // 该概念被哪些学习包讲到: 找指向它的 belong 边 → pack 节点 (label=标题, cardIndex=packId)
                if (node.kind !== 'concept') return [];
                const packIds = graph.edges
                  .filter((e: any) => e.kind === 'belong' && e.to === node.id)
                  .map((e: any) => e.from);
                return packIds.map((pid: string) => {
                  const pnode = graph.nodes.find(n => n.id === pid);
                  const packId = pnode?.cardIndex;
                  return {
                    title: pnode?.label || '学习包',
                    aspect: `在这一集里被讲到`,
                    onOpen: packId != null ? () => router.push({ pathname: '/episode/[id]', params: { id: String(packId), direct: '1', packId: String(packId) } }) : undefined,
                  };
                });
              }}
            />
          </>
        )}
      </View>

      {selected ? (
        <View style={styles.detailSheet}>
          <View style={styles.detailHeaderRow}>
            <Text style={styles.detailKind}>
              {selected.kind === 'center' ? '你的知识库' : selected.kind === 'concept' ? '关键概念' : '学习包'}
            </Text>
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
  detailSheet: { margin: 16, backgroundColor: colors.paperCream, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.paperDark, gap: 6 },
  detailHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  detailKind: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 0.6, color: colors.inkSecondary, textTransform: 'uppercase', opacity: 0.7 },
  detailClose: { fontFamily: fonts.ui, fontSize: 16, color: colors.inkSecondary },
  detailTitle: { fontFamily: fonts.hero, fontSize: 17, lineHeight: 24, color: colors.inkPrimary },
  detailBody: { fontFamily: fonts.body, fontSize: 13, lineHeight: 20, color: colors.inkPrimary },
  detailBtn: { alignSelf: 'flex-start', marginTop: 6, backgroundColor: colors.brick, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  detailBtnText: { fontFamily: fonts.ui, fontSize: 13, color: colors.paperCream },
});
