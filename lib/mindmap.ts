// K0 脑图数据层 (#111) — 把一篇学习包(PackObject)转成 {nodes, edges} + 放射布局。
// 纯逻辑, 无 UI, 无新依赖 (不用 d3, 自己算放射坐标)。UI 层 (MindMap.tsx) 消费本文件输出。
//
// 层级映射 (K0 专属, 经数据核实):
//   - center     : snapshot.oneSentence   (主干/中心)
//   - core       : corePoints[]           (一级主题, 环 1)
//   - concept    : concepts[]             (关键概念, 环 2; 概念间 related 字段互相提名 → 画连线 = 网状)
//   - card       : cards[]                (证据/洞见, 叶子; 挂到最相关的 core, 按关键词重叠)
// 边:
//   - center→core (骨架)
//   - core→card   (归属, 关键词重叠最高的 core)
//   - concept↔concept (语义, related 里提到彼此的名字)
//   - center→concept (概念挂中心, 若未与任何概念相连)
import type { PackObject } from '@/types/pack';

export type MindNodeKind = 'center' | 'core' | 'concept' | 'card';

export interface MindNode {
  id: string;
  kind: MindNodeKind;
  label: string;          // 节点上显示的短文字
  detail?: string;        // 点开后的详情正文
  timestamp?: number | null; // 可跳音频的秒数 (card/concept)
  cardIndex?: number;     // card: 跳卡片详情用
  quote?: string;
  quoteVerified?: boolean;
  linkedTerms?: string[];   // #112: concept 节点连到的其他概念名 (详情里讲清关系)
  // 布局坐标 (layoutRadial 填)
  x?: number;
  y?: number;
  ring?: number;          // 0=center,1=core,2=concept/card
  color?: string;
}

export interface MindEdge {
  from: string;
  to: string;
  kind: 'skeleton' | 'belong' | 'semantic';
}

export interface MindGraph {
  nodes: MindNode[];
  edges: MindEdge[];
}

// #116 动态高亮: 邻接索引 (点节点 → 一跳邻居集合)。纯 JS。
export function buildAdjacency(edges: { from: string; to: string }[]): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  const add = (a: string, b: string) => {
    if (!adj.has(a)) adj.set(a, new Set());
    adj.get(a)!.add(b);
  };
  for (const e of edges) { add(e.from, e.to); add(e.to, e.from); }
  return adj;
}

// 简单中文关键词重叠打分 (2-gram) — 用于把 card 归到最相关的 core, 不引 NLP 库
function overlapScore(a: string, b: string): number {
  if (!a || !b) return 0;
  const clean = (s: string) => s.replace(/[""''""''、，。！？：；,.\s]+/g, '');
  const ca = clean(a), cb = clean(b);
  if (!ca || !cb) return 0;
  const grams = new Set<string>();
  for (let i = 0; i < ca.length - 1; i++) grams.add(ca.slice(i, i + 2));
  let hit = 0;
  for (let i = 0; i < cb.length - 1; i++) if (grams.has(cb.slice(i, i + 2))) hit++;
  return hit;
}

/**
 * PackObject → MindGraph。纯逻辑。
 * maxCards: 叶子卡片上限 (脑图别太挤, 默认取洞见最强的前 N)。
 */
export function buildMindGraph(pack: PackObject, opts?: { maxCards?: number }): MindGraph {
  const maxCards = opts?.maxCards ?? 14;
  const nodes: MindNode[] = [];
  const edges: MindEdge[] = [];

  const oneSentence = pack?.snapshot?.oneSentence || '本集要点';
  nodes.push({ id: 'center', kind: 'center', label: oneSentence, ring: 0 });

  // ── core (一级主题) ──
  const cores = (pack?.snapshot?.corePoints || []).slice(0, 6);
  cores.forEach((cp, i) => {
    const id = `core-${i}`;
    nodes.push({
      id, kind: 'core', ring: 1,
      label: cp.point, detail: cp.point,
      timestamp: typeof cp.timestamp === 'number' ? cp.timestamp : null,
    });
    edges.push({ from: 'center', to: id, kind: 'skeleton' });
  });

  // ── concept (关键概念, 环 2) ──
  const concepts = (pack?.concepts || []).slice(0, 8);
  const conceptIdByTerm = new Map<string, string>();
  concepts.forEach((c, i) => {
    const id = `concept-${i}`;
    conceptIdByTerm.set(c.term, id);
    nodes.push({
      id, kind: 'concept', ring: 2,
      label: c.term,
      detail: [c.plain, c.related].filter(Boolean).join('\n\n'),
      timestamp: c.context?.timestamp ?? null,
    });
  });
  // 概念间语义连线: related 文本里提到另一个概念的 term → 连边 + 记录关系(#112 详情讲清)
  const conceptNodeById = new Map(nodes.filter(nd => nd.kind === 'concept').map(nd => [nd.id, nd]));
  concepts.forEach((c, i) => {
    const fromId = `concept-${i}`;
    const relText = `${c.related || ''} ${c.plain || ''}`;
    let linked = false;
    const myLinks: string[] = [];
    concepts.forEach((other, j) => {
      if (i === j) return;
      if (other.term && relText.includes(other.term)) {
        myLinks.push(other.term);
        // 去重 (无向): 只加 i<j; 但双向都记 linkedTerms
        if (i < j) edges.push({ from: fromId, to: `concept-${j}`, kind: 'semantic' });
        else {
          // j<i 时对方已连过, 但把我也记到对方的 linkedTerms
          const on = conceptNodeById.get(`concept-${j}`);
          if (on && c.term && !(on.linkedTerms || []).includes(c.term)) {
            on.linkedTerms = [...(on.linkedTerms || []), c.term];
          }
        }
        linked = true;
      }
    });
    const me = conceptNodeById.get(fromId);
    if (me) me.linkedTerms = [...(me.linkedTerms || []), ...myLinks];
    // 未与任何概念相连的概念 → 挂中心, 避免孤儿飘着
    const hasEdge = edges.some(e => (e.from === fromId || e.to === fromId));
    if (!linked && !hasEdge) edges.push({ from: 'center', to: fromId, kind: 'skeleton' });
  });
  // 概念还需挂到骨架: 每个概念连到关键词最重叠的 core (让概念锚在主题上)
  concepts.forEach((c, i) => {
    if (!cores.length) return;
    let best = -1, bestScore = 0;
    cores.forEach((cp, ci) => {
      const s = overlapScore(c.term + (c.plain || ''), cp.point);
      if (s > bestScore) { bestScore = s; best = ci; }
    });
    if (best >= 0 && bestScore >= 2) {
      edges.push({ from: `core-${best}`, to: `concept-${i}`, kind: 'belong' });
    }
  });

  // ── card (叶子, 挂到最相关 core) ──
  const rawCards = (pack?.cards || []).filter((c: any) => !c.archived);
  // 取洞见最强的前 maxCards (有 quote 的优先, 保留原顺序)
  const chosen = rawCards.slice(0, maxCards);
  chosen.forEach((card: any, i) => {
    const id = `card-${card.cardIndex ?? i}`;
    const label = card.insight || card.title || (card.quote ? card.quote.slice(0, 20) : '卡片');
    nodes.push({
      id, kind: 'card', ring: 2,
      label,
      detail: [card.quote ? (card.quoteVerified === false ? card.quote : `“${card.quote}”`) : '', card.context || card.explanation || ''].filter(Boolean).join('\n\n'),
      timestamp: typeof card.sourceTimestamp === 'number' ? card.sourceTimestamp : (card.timestamp ?? null),
      cardIndex: typeof card.cardIndex === 'number' ? card.cardIndex : i,
      quote: card.quote,
      quoteVerified: card.quoteVerified,
    });
    // 归属: 关键词最重叠的 core; 没 core 或没重叠 → 挂中心
    let best = -1, bestScore = 0;
    cores.forEach((cp, ci) => {
      const s = overlapScore(label + (card.context || ''), cp.point);
      if (s > bestScore) { bestScore = s; best = ci; }
    });
    edges.push(best >= 0 && bestScore >= 1
      ? { from: `core-${best}`, to: id, kind: 'belong' }
      : { from: 'center', to: id, kind: 'belong' });
  });

  return { nodes, edges };
}

// ── 放射布局 (纯 JS, 无 d3) ──
// center 居中; core 均匀分布在环 1; concept/card 挂在各自 parent core 的外侧扇区, 避免重叠。
// 手机竖屏: 用一个较大的虚拟画布 (可平移缩放), 不强塞进一屏。
export interface LayoutResult {
  nodes: MindNode[];      // 带 x/y
  edges: MindEdge[];
  width: number;          // 虚拟画布尺寸
  height: number;
  centerX: number;
  centerY: number;
}

export function layoutRadial(graph: MindGraph, opts?: { ringGap?: number }): LayoutResult {
  const ringGap = opts?.ringGap ?? 190;   // 环间距
  const nodes = graph.nodes.map(n => ({ ...n }));
  const byId = new Map(nodes.map(n => [n.id, n]));

  const cores = nodes.filter(n => n.kind === 'core');

  // 画布: 三环, 卡片单独占最外圈铺满 360° (不再挤进 core 的窄扇区 → 大幅去重叠)。
  const rCore = ringGap;
  const rConcept = ringGap * 1.9;
  const rCard = ringGap * 3.0;
  const radiusOuter = rCard;
  const size = radiusOuter * 2 + 200;
  const cx = size / 2, cy = size / 2;

  const center = byId.get('center');
  if (center) { center.x = cx; center.y = cy; }

  const n = cores.length || 1;
  cores.forEach((core, i) => {
    const ang = (-Math.PI / 2) + (i * 2 * Math.PI / n);
    core.x = cx + Math.cos(ang) * rCore;
    core.y = cy + Math.sin(ang) * rCore;
  });

  // 概念: 单独一环, 全周均分 (概念少, 铺开好看; 语义连线自然连成网)
  const conceptNodes = nodes.filter(nd => nd.kind === 'concept');
  conceptNodes.forEach((c, i) => {
    const ang = (-Math.PI / 2) + (i * 2 * Math.PI / Math.max(1, conceptNodes.length)) + Math.PI / Math.max(2, conceptNodes.length);
    c.x = cx + Math.cos(ang) * rConcept;
    c.y = cy + Math.sin(ang) * rConcept;
    c.ring = 2;
  });

  // 卡片: 最外环, 全周均分 (14 张也不挤); 交错内外 ±40 防标签叠
  const cardNodes = nodes.filter(nd => nd.kind === 'card');
  cardNodes.forEach((c, i) => {
    const ang = (-Math.PI / 2) + (i * 2 * Math.PI / Math.max(1, cardNodes.length));
    const r = rCard + (i % 2 === 0 ? 0 : 58);
    c.x = cx + Math.cos(ang) * r;
    c.y = cy + Math.sin(ang) * r;
    c.ring = 3;
  });

  // 兜底: 任何没坐标的节点 (孤儿) 丢外圈随机角, 不让它堆在 0,0
  let orphan = 0;
  for (const nd of nodes) {
    if (nd.x == null || nd.y == null) {
      const ang = orphan * 1.3;
      nd.x = cx + Math.cos(ang) * radiusOuter * 0.9;
      nd.y = cy + Math.sin(ang) * radiusOuter * 0.9;
      orphan++;
    }
  }

  return { nodes, edges: graph.edges, width: size, height: size, centerX: cx, centerY: cy };
}

// ═══════════════════════════════════════════════════════
// #113 多篇脑图: 跨学习包知识连接
// ═══════════════════════════════════════════════════════
export interface CrossPackInput {
  id: number;
  title: string;
  podcastName?: string;
  oneSentence?: string;
  concepts: string[];
}

// 两个 pack 若有相同/高度相似的概念 → 视为知识关联。返回 pack 节点 + 关联边(带共享概念)。
// 布局: 用户(中心) → 各 pack(环1); pack 间共享概念画虚线, 边粗细=共享概念数。
export function buildCrossPackGraph(packs: CrossPackInput[]): {
  nodes: MindNode[];
  edges: (MindEdge & { shared?: string[]; weight?: number })[];
} {
  const nodes: MindNode[] = [];
  const edges: (MindEdge & { shared?: string[]; weight?: number })[] = [];
  nodes.push({ id: 'me', kind: 'center', label: '我的知识库', ring: 0 });

  // 概念归一化 (去标点空格, 便于跨集匹配)
  const norm = (s: string) => String(s || '').replace(/[""''""''、，。！？：；()（）\s]+/g, '');
  packs.forEach((p, i) => {
    const id = `pack-${p.id}`;
    nodes.push({
      id, kind: 'core', ring: 1,
      label: p.title,
      detail: [p.podcastName, p.oneSentence].filter(Boolean).join('\n\n'),
      cardIndex: p.id,   // 复用字段存 packId, 供点击跳该 pack
    });
    edges.push({ from: 'me', to: id, kind: 'skeleton' });
  });

  // 两两比对共享概念
  for (let i = 0; i < packs.length; i++) {
    for (let j = i + 1; j < packs.length; j++) {
      const a = packs[i].concepts.map(norm);
      const bset = new Set(packs[j].concepts.map(norm));
      const sharedNorm: string[] = [];
      a.forEach((t, k) => { if (t && bset.has(t)) sharedNorm.push(packs[i].concepts[k]); });
      if (sharedNorm.length > 0) {
        edges.push({
          from: `pack-${packs[i].id}`, to: `pack-${packs[j].id}`,
          kind: 'semantic', shared: sharedNorm, weight: sharedNorm.length,
        });
      }
    }
  }
  return { nodes, edges };
}

// 跨集图放射布局: 中心=我, packs 均分环1。返回带坐标(已按 BASE 缩)。
export function layoutCrossPack(
  graph: { nodes: MindNode[]; edges: any[] },
  opts?: { ringGap?: number },
): { nodes: MindNode[]; edges: any[]; w: number; h: number } {
  const ringGap = opts?.ringGap ?? 150;
  const nodes = graph.nodes.map(n => ({ ...n }));
  const size = ringGap * 2.4 + 200;
  const cx = size / 2, cy = size / 2;
  const center = nodes.find(n => n.id === 'me');
  if (center) { center.x = cx; center.y = cy; }
  const packs = nodes.filter(n => n.kind === 'core');
  const N = packs.length || 1;
  packs.forEach((p, i) => {
    const ang = (-Math.PI / 2) + (i * 2 * Math.PI / N);
    p.x = cx + Math.cos(ang) * ringGap;
    p.y = cy + Math.sin(ang) * ringGap;
  });
  return { nodes, edges: graph.edges, w: size, h: size };
}
