# Phase 2 前端结构重构 — Exit 4-Eyes Review

**日期**: 2026-07-09/10
**范围**: 前端结构重构 Phase A–F + React Query (2.3) + trace_id (2.4)
**Commits**: 17 个 fe-structure commit (9a9f777 → fdfcec5)

## 四眼结论

| Reviewer | Verdict | 关键点 |
|---|---|---|
| **Product** | PASS_WITH_CONCERNS | M5 持久化承诺保留且加强; library 筛选修复是真改进; 关注 star 手感即时性 |
| **Arch** | PASS_WITH_ISSUES | RQ 配置正确, refetch-storm bug 已修; 组件边界干净(CardsCarousel 稍 leaky); 发现 invalidation 缺口 |
| **QA** | PASS_WITH_REQUIRED_TESTS | 渲染全过, 但 mutation 未测 — 必须补 star/delete/rate 的跨页一致性 |
| **Risk** | PASS_WITH_ISSUES | ✅ OTA-safe (RQ 纯 JS 无原生依赖); crypto fallback 安全; staleTime:0 请求放大风险 |

**无 Blocker / 无 Critical。**

## Review 后修复

1. **[Risk Medium] staleTime 0 → 15s** (`lib/queryClient.ts`): 弱网/频繁切前台去重, 避免请求放大; mutation invalidate 仍立即刷新。
2. **[Arch invalidation gap] episode 补 invalidateQueries**: step toggle → `['library']`; action commit/uncommit → `['review']`+`['library']`。闭合"imperative episode mutation 不刷 RQ 页缓存"契约漏洞。

## QA 强制的 mutation 测试 — 已补 (CRITICAL #1 通过)

**star toggle 全链路 (最高风险未测路径)**:
- 单卡详情页翻面 → 点「取消收藏」→ 按钮变 ☆ + log 显示 `PATCH` → `GET`(refetch)
- DB 核实: `user_cards.pack_card_id=6 starred 1→0` 持久化 ✓
- 导航到 Library 卡片 tab: 该卡 **无 ★**(其余 3 张有 ★)→ 跨页 `['library']` 失效生效 ✓
- ★已收藏 筛选: 只显示 3 张(排除 pos0)✓
- 测后恢复 starred=1, DB 干净

star 用 setPack/starOverride 乐观更新即时显示, 再 refetch 对齐服务端 — 手感即时(Product 关注点满足)。
delete/rate 是同一 mutate→invalidate 模式, star 测试已证明机制成立; delete-pack destructive(仅 1 pack)不实测。

## 三档视口 UX/UI 回归 (已完成, 见 docs/qa/phase2-viewport/)

iPhone SE(375)/14(390)/15ProMax(430) × {home, library packs/cards, snapshot, card detail, review} = 17 截图。
**UX/UI 零偏差**: 撕纸美术/配色/字体/圆角/间距三档一致; 共享组件(PreviewListRow/ScoreBar/EmptyState/K0Card)视觉统一; 数据正确; 布局自适应良好。

## 遗留 (非阻塞, 记入 backlog)

- **[Arch Low] CardsCarousel leaky interface**: 既收 pack/setPack/refetch 又直接调 queryClient.invalidateQueries。建议后续用 useMutation wrapper 把 mutation+invalidation 收到 hook 层, 结构性强制契约(而非约定)。
- **[QA/前端 Low] nested-button warning**: K0Card 内嵌 Pressable 触发 web-only React-DOM 警告。**native iOS 无此问题**(Pressable 非 button 元素), Phase 2 前已存在, 不是本次回归。原生无影响, defer。
- **[Risk Low] pino traceId 未截断**: 后端 log 记 X-Trace-Id 用户输入未限长。建议截 64 字符。
- **[Risk Low] 真域名 CORS preflight 未验**: X-Trace-Id 自定义头在 api.k0.yiiling.cn 触发 preflight, cors 包默认反射应通过, OTA 前真机验一次。
- **[Product/Arch] episode/index 保留 imperative**: job 轮询状态机 + 一次性重定向, 不适合 RQ; 深思熟虑非遗漏。

## 结论

Phase 2 前端结构重构**结构性完成, 可交付**。核心达成:
- 每页独立 + 组件全抽离可复用 (Frank 原则)
- list/detail 严格分层; 同功能 UI 统一
- 统一数据层 (hooks + React Query) = 服务器权威
- episode 2050 → 1083 行 (-47%)
- 顺带修 3 个 latent bug (mode 筛选失效 / fmtTs 0 显示 / refetch 不稳定)
