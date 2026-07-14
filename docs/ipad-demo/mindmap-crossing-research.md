# K0 知识脑图「减少无意义连线交叉」调研报告

> 定位:信息可视化 / 力导向布局算法调研。纯调研,不改代码。
> 时间:2026-07-13 · 目标文件 `lib/mindmap.ts` + `hooks/useMindForce.ts` + `components/graph/ForceGraph.tsx`

---

## 0. 一句话结论

**推荐方案 B(放射树扇区分配 + 力导向只做微调)**。K0 脑图是**明确的层级结构**(center → core → concept/card),这类图用「放射树楔形分配(radial tidy tree / d3.tree 放射变体)」能**从数学上保证同层子树不交叉**,是天然对症的做法;纯力导向是全局能量最小化,本来就**没有**「子树不相互穿插」这个约束项,靠加局部角度力去补(上次的失败尝试)是南辕北辙。semantic 跨层边只画不参与布局。

---

## 1. 根因分析(为什么纯力导向必然有无意义交叉)

现状 `forceTick` 是标准 d3-force 四力:charge 斥力 + link 弹簧 + center 向心 + collision 碰撞。它优化的是一个**全局标量能量**(所有边尽量到目标长度 + 所有点尽量互斥)。

关键点:**这个能量函数里根本没有「子树角度扇区不重叠」这一项**。

- 力导向只知道「A 和 B 该隔多远」,不知道「A 的所有孩子应该聚在 A 这一侧的一个连续扇形里,且这个扇形不能和 B 的扇形重叠」。
- 于是收敛后,core-1 的某个 card 可能飘到了 core-3 的方向,它那条 belong 边就横穿整张图 → 这就是 Frank 说的「1-2-3 级、3 级子节点无意义交叉」。
- `seedForce` 用 `layoutRadial` 播种时其实**已经**把 core 均分了圆周(好的起点),但 concept/card 是**各自全周均分**(`layoutRadial` 里 concept 和 card 都是 `i * 2π / N` 全周撒),播种时就没按父节点分扇区 → 力导向再一松弛,叶子和父亲的方位彻底脱钩。

> 上次「兄弟角度分散力」失败的根因:那是个**局部**修补(只推同父兄弟),且切向 push 的 sign 判断错(实测交叉 26→31)。局部力改变不了「能量函数无扇区约束」这个本质,还容易和其他力打架产生新交叉。**方向错了,不是参数没调好。**

---

## 2. 市面主流做法(按对 K0 的适配度排序)

| 做法 | 核心思想 | 对 K0 适配度 | 是否天然无子树交叉 |
|---|---|---|---|
| **放射树楔形分配** (radial tidy tree / `d3.tree().size([2π, r])`) | 根占满 2π,递归把父的角度楔形按「叶子数」分给每个子树,极坐标 (angle, radius→ring) 落点 | ★★★★★ 有明确层级、层数少(3层)、节点少(~30),完美命中 | **是**(同层子树楔形互不重叠 ⇒ 树边不可能交叉) |
| **Reingold-Tilford (radial)** | 经典整齐树算法的放射变体,同层等距、子树居中对齐 | ★★★★☆ 同上,但等宽分配对「叶子数差异大的子树」不如按叶子加权好看 | 是 |
| **Sunburst / Icicle** | 层级用同心环的**弧段面积**表示,无连线 | ★★☆☆☆ 是另一种可视化范式(占满环、无节点球),会推翻现有「球+连线」视觉 | N/A(没连线) |
| **纯力导向 + 局部角度力** | 在四力上加「同父兄弟角度分散」 | ★☆☆☆☆ 已实测失败,治标不治本 | 否 |
| **Force-directed Edge Bundling (FDEB)** | 不改布局,把走向相近的边**捆成束**,视觉上少看着乱 | ★★★☆☆ 治「看着乱」不治「结构交叉」;30 节点收益有限,且和贝塞尔弯边叠加易糊 | 否(只是视觉聚合) |

**判断:对 K0 这种「层级明确 + 节点少 + 三环」的图,放射树楔形分配就是教科书答案。** d3-hierarchy 的 `d3.tree`/`d3.cluster` 放射变体正是干这个的(我们不引 d3,自己实现同款递归即可,~40 行纯 JS)。

**楔形分配为何天然无交叉(直觉证明):** 若父 P 把自己的角度区间 `[a, b]` 完整、无重叠地切给孩子 c1..ck(c1 拿 `[a, a+w1]`,c2 拿 `[a+w1, a+w1+w2]`…),那么 ci 及其整棵子树都落在 `[…]` 这个楔形扇区内。任意两棵兄弟子树的扇区不相交 ⇒ 它们的边不会跨到对方扇区 ⇒ 树边(skeleton/belong)零交叉。这是结构保证,不是「调参调出来的」。

---

## 3. 两个落地方案

### 方案 A — 改良力模型(保留力导向,加「扇区约束」)

思路:不推翻力导向,而是给每个非根节点算一个**目标角度 `targetAngle`**(由扇区递归分配得到),然后加一个**径向弹簧 + 角度回正力**把节点温柔拽向它的目标扇区,力导向仅在扇区内做防重叠微调。

- **怎么加、怎么避开上次 sign bug:**
  - 上次错在用「切向 push」(sign 靠猜)。这次改用**绝对目标角**:先算出每个节点的 `targetAngle`(全局唯一确定),力只是把当前角 `curAngle` 往 `targetAngle` 拉。`da = normalizeAngleDiff(targetAngle - curAngle)`(归一到 `[-π, π]`),力方向恒为「顺着 da 的符号」——**符号由目标决定,不靠猜切向**,从根上消除上次的 sign bug。
  - 公式(极坐标力,在 forceTick 末尾追加一步):
    ```
    // 每个非 center 节点 n,已知 targetAngle[n]、targetRing半径 R[ring]
    const dxc = n.x - cx, dyc = n.y - cy;
    const curAng = Math.atan2(dyc, dxc);
    const curR   = Math.hypot(dxc, dyc) || 1;
    // (1) 角度回正:往 targetAngle 拉(符号由 da 决定,无需猜)
    let da = targetAngle[n] - curAng;
    da = Math.atan2(Math.sin(da), Math.cos(da));   // 归一 [-π,π]
    const tangential = da * ANG_K * a;             // ANG_K≈0.15
    n.vx += -Math.sin(curAng) * tangential * curR * 0.02;
    n.vy +=  Math.cos(curAng) * tangential * curR * 0.02;
    // (2) 径向回正:往本环半径 R 拉
    const dr = (R[n.ring] - curR) * RAD_K * a;      // RAD_K≈0.08
    n.vx += (dxc / curR) * dr;
    n.vy += (dyc / curR) * dr;
    ```
  - `charge` 斥力可**大幅调弱**(它现在只需在扇区内防挤),`linkStrength` 也弱化,让角度/径向回正力主导。
- **预期:** 交叉大幅下降(每个节点被拽回它父的扇区),但因为力仍在动,**不是零交叉**——收敛过程中或半径拥挤时仍可能短暂越界。属于「大幅改善但非保证」。
- **工作量:** 中(~1.5 天)。要在 `buildMindGraph`/`seedForce` 产出 `targetAngle`+`ring`,在 `forceTick` 加两步力,调 3~4 个系数。
- **风险:** 力平衡要调参(角度力 vs collision vs link 打架);调不好会「回正力把节点拉成一圈、collision 又推开」抖动。拖动/缩放/fit **不受影响**(仍是力松弛出坐标)。

### 方案 B — 放射树扇区分配(推荐)⭐

思路:**布局改为确定性放射树**;力导向从「主布局」降级为「可选的收敛后微调 + 拖动响应」。

- **算法(纯 JS,~40 行,无 d3):**
  1. 从 `edges` 建**层级树**(center 为根;skeleton/belong 为父子边;**semantic 边完全排除出树**,只在渲染时画)。一个节点若有多个父(concept 既连 core 又有 semantic),取**唯一树父**:优先 belong 到的 core,其次 center。
  2. **后序遍历**算每个节点的 `leafCount`(叶子=没有树子节点的节点,叶子自身 leafCount=1;内部节点 = 子节点 leafCount 之和)。用叶子数加权 → 子树越"重"分到的楔形越宽,视觉更均衡。
  3. **前序遍历**分配角度楔形:根占 `[0, 2π)`;父把自己的 `[a, b)` 按孩子 leafCount 比例切成连续、无重叠的子区间;每个孩子的**角度 = 它区间的中点**,半径 = 该节点的环半径(center=0, core=rCore, concept/card=外环)。
  4. 极坐标 → 笛卡尔:`x = cx + cos(angle)*R[depth]`, `y = cy + sin(angle)*R[depth]`。
- **semantic 边:** **只画不参与布局**。它们本来就是「跨扇区的横向关联」,天生会穿越——用**贝塞尔弯边**(ForceGraph 已有 `bezierPath`)+ 半透明区分即可,不让它们把节点拽乱。这正是分离「结构层(树,零交叉)」和「关联层(semantic,弯线叠加)」的正解。
- **力导向的新角色(可选):** 扇区分配后,同一楔形内若节点标签仍互压,可跑**极少量(10~20 tick)collision-only 微调**(只留 collision + 弱角度回正,关掉 charge/link),把标签盒推开。也可以完全不跑力,纯静态放射树。
- **工作量:** 中(~1.5~2 天)。新增一个 `layoutRadialTree(graph)` 函数替换 `seedForce` 里叶子的全周均分;`useMindForce` 保留(收敛微调用)或退化为静态。
- **风险:** 低。确定性布局无收敛抖动、无调参地狱。**唯一要处理的是拖动**:
  - 现有拖动是 `pinDrag` 固定坐标 + 其他点不动(见 useMindForce),**和静态布局完全兼容**——拖谁固定谁,不需要力。
  - 「重排」按钮 = 重新跑一次 `layoutRadialTree`(瞬间,无动画松弛)。
  - fit/缩放:`applyFit` 按 bbox 铺满的逻辑**原样可用**(它只吃最终坐标,不关心坐标怎么来的)。
- **对现有 拖动/缩放/fit 的影响:** 拖动与 fit 无需改;缩放无需改。只是坐标来源从「力松弛」变「一次性递归计算」,收敛 loading 甚至可以直接去掉(布局是瞬时的)。

---

## 4. 推荐 + 关键伪代码

**推荐方案 B**,理由:(1) 层级明确 ⇒ 楔形分配数学上零树边交叉,直接消灭 Frank 的痛点;(2) 确定性、无调参、无抖动、无收敛等待;(3) 与现有拖动/fit/缩放完全兼容,改动集中在一个新布局函数;(4) semantic 边天然分离成弯线叠加层,概念不再互相拽乱。若想保留「有机漂浮感」,可叠加方案 A 的 collision-only 微调作为二期增强。

### 核心伪代码 — 扇区递归角度分配

```js
// 输入: MindGraph(nodes+edges)。输出: 每个节点 {x, y, ring, angle}
function layoutRadialTree(graph, { cx, cy, ringR }) {
  // ringR: (depth)=>半径, 如 [0, 190, 361][depth] (对齐现有 rCore/rConcept)

  // 1) 建树: 每个节点选唯一父。semantic 边排除。
  const treeChildren = new Map();        // parentId -> [childId...]
  const parentOf = new Map();
  const pick = (id, pid) => {            // 只在还没父时认父(belong 优先于 center)
    if (parentOf.has(id)) return;
    parentOf.set(id, pid);
    if (!treeChildren.has(pid)) treeChildren.set(pid, []);
    treeChildren.get(pid).push(id);
  };
  // 先 belong(core->concept/card),再 skeleton(center->core),把 concept 锚到 core 而非 center
  for (const e of graph.edges) if (e.kind === 'belong')   pick(e.to, e.from);
  for (const e of graph.edges) if (e.kind === 'skeleton') pick(e.to, e.from);
  // 'semantic' 边:不进树(渲染时才画)

  // 2) 后序算 leafCount(叶子加权,子树越重楔形越宽)
  const leafCount = new Map();
  const countLeaves = (id) => {
    const kids = treeChildren.get(id) || [];
    if (kids.length === 0) { leafCount.set(id, 1); return 1; }
    let s = 0; for (const k of kids) s += countLeaves(k);
    leafCount.set(id, s); return s;
  };
  countLeaves('center');

  // 3) 前序分配楔形 [a0,a1),孩子按 leafCount 比例切连续子区间,角度取区间中点
  const out = new Map();                 // id -> {angle, depth}
  const assign = (id, a0, a1, depth) => {
    const angle = (a0 + a1) / 2;
    out.set(id, { angle, depth });
    const kids = treeChildren.get(id) || [];
    if (!kids.length) return;
    const total = leafCount.get(id) || 1; // = 子树叶子总数
    let cur = a0;
    for (const k of kids) {
      const frac = (leafCount.get(k) || 1) / total;
      const span = (a1 - a0) * frac;       // 该孩子分到的角度宽度 ∝ 其叶子数
      assign(k, cur, cur + span, depth + 1); // 递归:孩子的子树只在这个连续楔形里
      cur += span;
    }
  };
  assign('center', 0, Math.PI * 2, 0);     // 根占满 2π

  // 4) 极坐标 -> 笛卡尔
  for (const n of graph.nodes) {
    const o = out.get(n.id);
    if (!o) continue;                       // 孤儿另处理
    const R = ringR(o.depth);
    n.ring = o.depth;
    n.x = cx + Math.cos(o.angle) * R;
    n.y = cy + Math.sin(o.angle) * R;
  }
  return graph;
}
```

**要点回顾:**
- `span = 区间宽 × (孩子叶子数 / 父的叶子总数)` —— 这一行是「零交叉」的关键:每个孩子拿到**连续且互不重叠**的角度楔形,整棵子树都困在里面。
- semantic 边不进树 ⇒ 不影响任何节点落点,渲染时用 `bezierPath` 画成弯虚线叠加。
- `ringR(depth)` 直接复用现有 `rCore=190 / rConcept=190*1.9 / rCard=190*3`(方案 B 可让 concept 与 card 同环或分环,取决于 depth)。
- 深度可能超环数(例如 card 挂在 concept 下):把 concept/card 都视作 depth≥2,用 `min(depth,2)` 或按 kind 映射半径即可。

### 二期可选增强(B 上叠 A 的微调)
扇区落点后,若同楔形内标签仍互压,跑 10~20 tick **只开 collision + 弱角度回正**(`ANG_K` 很小)的 forceTick;charge/link 关闭。既保结构零交叉,又能把叠字推开、带一点有机感。

---

## 5. 交付建议
- 一期直接做方案 B 的 `layoutRadialTree`,替换 `seedForce`/`layoutRadial` 中叶子全周均分那段;单篇(single)和多篇(cross)都能套同一递归(cross 的 me→pack→concept 也是树)。
- 保留 `useMindForce` 的拖动/fit/缩放骨架,把「rAF 松弛」降级为「一次性布局 + 可选微调」。
- 验证指标:沿用之前的「web 量化实测交叉数」脚本,对同一 pack 跑 B vs 现状,skeleton+belong 边交叉数应降到 **0**(结构保证),semantic 边交叉数不计入(它们本就是关联叠加层)。
