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
  // #R36 力导向 (forceTick 用): 速度 + pin(拖动时固定坐标)
  vx?: number;
  vy?: number;
  fx?: number | null;     // 非空 → 该节点被 pin 在 (fx,fy), 不受力
  fy?: number | null;
  _r?: number;            // 渲染半径 (含标签 padding), collision 用
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

// 两个 pack 若有相同/高度相似的概念 → 视为知识关联。
// R36 二分图重构: 概念本身成为节点 (Obsidian 式)。pack → 它包含的每个概念连 belong 边;
//   两篇 pack 共享同一概念时, 因都连到同一个概念节点而自然成网 (不再 pack↔pack 直连)。
//   这才是"所有概念的连线", 不是"文章连文章"。
//
// semanticEdges (可选, 后端 embedding): [{from,to,shared:[{a,b,score}]}]。
//   用于把语义相同但字面不同的概念合并成一个节点 (电脑=PC=计算机)。默认 mergeSemantic=true 时启用。
export function buildCrossPackGraph(
  packs: CrossPackInput[],
  semanticEdges?: { from: number; to: number; shared: { a: string; b: string; score: number }[]; weight?: number; weak?: boolean }[],
  opts?: { mergeSemantic?: boolean },
): {
  nodes: MindNode[];
  edges: (MindEdge & { shared?: string[]; weight?: number; weak?: boolean })[];
} {
  const mergeSemantic = opts?.mergeSemantic ?? true;
  const nodes: MindNode[] = [];
  const edges: (MindEdge & { shared?: string[]; weight?: number; weak?: boolean })[] = [];
  nodes.push({ id: 'me', kind: 'center', label: '我的知识库', ring: 0 });

  const norm = (s: string) => String(s || '').replace(/[""''""''、，。！？：；()（）\s]+/g, '').toLowerCase();

  // ── pack 节点 (core kind) ──
  packs.forEach((p) => {
    const id = `pack-${p.id}`;
    nodes.push({
      id, kind: 'core', ring: 1,
      label: p.title,
      detail: [p.podcastName, p.oneSentence].filter(Boolean).join('\n\n'),
      cardIndex: p.id,   // 复用字段存 packId, 供点击跳该 pack
    });
    edges.push({ from: 'me', to: id, kind: 'skeleton' });
  });

  // ── 概念别名合并表 (semantic: 语义相同的概念归到同一 canonical) ──
  // canonicalOf[norm(term)] = 该概念的规范节点 key。默认自身; embedding 把近义合并。
  const canonicalOf = new Map<string, string>();   // normTerm → canonicalNormTerm
  const displayOf = new Map<string, string>();      // canonicalNormTerm → 展示用原文
  const resolve = (t: string): string => {
    const k = norm(t);
    return canonicalOf.get(k) || k;
  };
  if (mergeSemantic && semanticEdges && semanticEdges.length > 0) {
    // union-find 简化: 把每对 shared(a,b) 合并到 a 的 canonical
    for (const e of semanticEdges) {
      for (const s of e.shared) {
        const ka = norm(s.a), kb = norm(s.b);
        if (!ka || !kb) continue;
        const ca = canonicalOf.get(ka) || ka;
        canonicalOf.set(kb, ca);
        canonicalOf.set(ka, ca);
      }
    }
  }

  // ── 概念节点 + pack→concept belong 边 ──
  // conceptPacks[canonicalKey] = Set<packId> (哪些 pack 提到它, 供详情展示)
  const conceptPacks = new Map<string, Set<number>>();
  const conceptCreated = new Set<string>();
  packs.forEach((p) => {
    const seen = new Set<string>();   // 同一 pack 内同概念只连一次
    for (const term of p.concepts) {
      if (!term) continue;
      const canon = resolve(term);
      if (!canon) continue;
      if (!displayOf.has(canon)) displayOf.set(canon, term);   // 首次出现的原文当展示名
      if (!conceptPacks.has(canon)) conceptPacks.set(canon, new Set());
      conceptPacks.get(canon)!.add(p.id);
      if (seen.has(canon)) continue;
      seen.add(canon);
      const cid = `c-${canon}`;
      if (!conceptCreated.has(canon)) {
        conceptCreated.add(canon);
        nodes.push({ id: cid, kind: 'concept', ring: 2, label: displayOf.get(canon) || term });
      }
      edges.push({ from: `pack-${p.id}`, to: cid, kind: 'belong' });
    }
  });

  // 概念详情: 被几篇提到 (>1 才是"连接点")
  for (const n of nodes) {
    if (n.kind !== 'concept') continue;
    const canon = n.id.replace(/^c-/, '');
    const pk = conceptPacks.get(canon);
    if (pk && pk.size > 1) {
      const titles = packs.filter(p => pk.has(p.id)).map(p => p.title);
      n.detail = `${pk.size} 个学习包都讲到这个概念：\n${titles.join('、')}`;
      n.color = 'shared';   // 标记共享概念 (渲染可强调)
    } else {
      n.detail = '出现在 1 个学习包';
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
  // R36: 概念节点播种到外环 (二分图), 全周均分, 给力导向一个不叠的起点
  const concepts = nodes.filter(n => n.kind === 'concept');
  const M = concepts.length || 1;
  concepts.forEach((c, i) => {
    const ang = (-Math.PI / 2) + (i * 2 * Math.PI / M) + Math.PI / M;
    c.x = cx + Math.cos(ang) * ringGap * 1.9;
    c.y = cy + Math.sin(ang) * ringGap * 1.9;
  });
  const outerR = ringGap * 1.9 + 100;
  return { nodes, edges: graph.edges, w: outerR * 2, h: outerR * 2 };
}

// ═══════════════════════════════════════════════════════
// #R36 力导向布局 (force-directed, 纯 JS d3-force 语义)
// Obsidian Graph View 做法: 四力 (charge 斥力 / link 引力 / center 向心 / collision 碰撞)
// 每帧一 tick 松弛, 节点自动散开、连线交叉大幅减少、可拖动重排。
// 无 d3 依赖, 无原生模块 → 可 OTA。N<60 用 O(n²)。
// ═══════════════════════════════════════════════════════

export interface ForceSim {
  alpha: number;
  alphaDecay: number;   // 每帧 alpha 衰减率
  alphaMin: number;     // 到此停 (收敛)
  velocityDecay: number;
  charge: number;       // 斥力系数 (负)
  centerStrength: number;
  linkStrength: number;
  cx: number;
  cy: number;
}

export function createSim(opts?: Partial<ForceSim>): ForceSim {
  return {
    alpha: 1,
    alphaDecay: 0.0228,
    alphaMin: 0.001,
    velocityDecay: 0.6,
    charge: -260,
    centerStrength: 0.01,
    linkStrength: 0.08,
    cx: 0,
    cy: 0,
    ...opts,
  };
}

// 边的目标长度 (骨架最短, 语义最松)
function linkDistance(kind: MindEdge['kind']): number {
  if (kind === 'skeleton') return 70;
  if (kind === 'belong') return 90;
  return 130; // semantic
}

/**
 * 就地跑一帧力模型 (修改 nodes[].x/y/vx/vy)。
 * nodes 需已有初始 x/y (用 seedForce 播种) 和 _r (碰撞半径)。
 * pin: node.fx/fy 非空 → 固定该点 (拖动中)。
 */
export function forceTick(
  nodes: MindNode[],
  edges: { from: string; to: string; kind: MindEdge['kind'] }[],
  sim: ForceSim,
): void {
  const a = sim.alpha;
  const byId = new Map(nodes.map(n => [n.id, n]));

  for (const n of nodes) { if (n.vx == null) n.vx = 0; if (n.vy == null) n.vy = 0; }

  // 1. charge 斥力 (每对, 反平方)
  for (let i = 0; i < nodes.length; i++) {
    const ni = nodes[i];
    for (let j = i + 1; j < nodes.length; j++) {
      const nj = nodes[j];
      let dx = (nj.x ?? 0) - (ni.x ?? 0);
      let dy = (nj.y ?? 0) - (ni.y ?? 0);
      let d2 = dx * dx + dy * dy;
      if (d2 < 0.01) { dx = (Math.random() - 0.5) * 1; dy = (Math.random() - 0.5) * 1; d2 = dx * dx + dy * dy + 0.01; }
      const d = Math.sqrt(d2);
      const f = (sim.charge * a) / d2;   // charge 负 → 斥力
      const ux = dx / d, uy = dy / d;
      ni.vx! -= ux * f; ni.vy! -= uy * f;
      nj.vx! += ux * f; nj.vy! += uy * f;
    }
  }

  // 2. link 引力 (每边, 弹簧)
  for (const e of edges) {
    const s = byId.get(e.from); const t = byId.get(e.to);
    if (!s || !t) continue;
    const dx = (t.x ?? 0) - (s.x ?? 0);
    const dy = (t.y ?? 0) - (s.y ?? 0);
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const L = linkDistance(e.kind);
    const f = ((d - L) / d) * sim.linkStrength * a;
    const fx = dx * f, fy = dy * f;
    s.vx! += fx; s.vy! += fy;
    t.vx! -= fx; t.vy! -= fy;
  }

  // 3. center 向心 (轻, 防整图漂走)
  for (const n of nodes) {
    n.vx! += (sim.cx - (n.x ?? 0)) * sim.centerStrength * a;
    n.vy! += (sim.cy - (n.y ?? 0)) * sim.centerStrength * a;
  }

  // 4. collision 碰撞 (每对, 硬推开防重叠; 半径=_r+PAD)
  for (let i = 0; i < nodes.length; i++) {
    const ni = nodes[i];
    for (let j = i + 1; j < nodes.length; j++) {
      const nj = nodes[j];
      const dx = (nj.x ?? 0) - (ni.x ?? 0);
      const dy = (nj.y ?? 0) - (ni.y ?? 0);
      const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const minD = (ni._r ?? 14) + (nj._r ?? 14) + 6;
      if (d < minD) {
        const push = ((minD - d) / d) * 0.5;
        const px = dx * push, py = dy * push;
        ni.x = (ni.x ?? 0) - px; ni.y = (ni.y ?? 0) - py;
        nj.x = (nj.x ?? 0) + px; nj.y = (nj.y ?? 0) + py;
      }
    }
  }

  // 积分 + pin + 阻尼
  const keep = 1 - sim.velocityDecay;
  for (const n of nodes) {
    if (n.fx != null && n.fy != null) { n.x = n.fx; n.y = n.fy; n.vx = 0; n.vy = 0; continue; }
    n.vx! *= keep; n.vy! *= keep;
    n.x = (n.x ?? 0) + n.vx!;
    n.y = (n.y ?? 0) + n.vy!;
  }

  sim.alpha += (0 - sim.alpha) * sim.alphaDecay;   // 衰减向 0 (d3 语义); 到 alphaMin 以下由调用方停 rAF
}

/**
 * 力导向初始播种: 用放射坐标当种子 (比随机圆收敛快 2-3 倍且不易翻转)。
 * 输出坐标已归一到画布中心 (cx,cy), 并按 base 预缩。半径 rOf(kind) 决定碰撞尺寸。
 */
export function seedForce(
  graph: MindGraph | { nodes: MindNode[]; edges: any[] },
  opts: { base?: number; cx: number; cy: number; rOf: (kind: string) => number; radialFn?: 'single' | 'cross' },
): { nodes: MindNode[]; edges: any[] } {
  const base = opts.base ?? 0.5;
  // 用现有放射布局播种
  let seeded: { nodes: MindNode[]; edges: any[] };
  if (opts.radialFn === 'cross') {
    seeded = layoutCrossPack(graph as any);
  } else {
    const r = layoutRadial(graph as MindGraph);
    seeded = { nodes: r.nodes, edges: r.edges };
  }
  // 找种子中心 (放射布局的 center 坐标) 以平移到 (cx,cy)
  const seedCx = seeded.nodes.reduce((s, n) => s + (n.x ?? 0), 0) / (seeded.nodes.length || 1);
  const seedCy = seeded.nodes.reduce((s, n) => s + (n.y ?? 0), 0) / (seeded.nodes.length || 1);
  const nodes = seeded.nodes.map(n => ({
    ...n,
    x: ((n.x ?? seedCx) - seedCx) * base + opts.cx,
    y: ((n.y ?? seedCy) - seedCy) * base + opts.cy,
    vx: 0, vy: 0, fx: null, fy: null,
    _r: opts.rOf(n.kind) + 5,
  }));
  return { nodes, edges: seeded.edges };
}
