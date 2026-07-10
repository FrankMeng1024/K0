# OTA v48 + 部署 + 清库 — 4-Eyes Review

**日期**: 2026-07-10
**范围**: 前端 OTA v47→v48 + 后端重新部署 (features/ 结构) + DB TRUNCATE 业务表

## 四眼结论

| Reviewer | Verdict | 关键 |
|---|---|---|
| **Product** | PASS_WITH_CONCERNS | 纯重构 OTA 无新功能=低风险; 两 gate: 后端先→OTA 后原子部署 + 清库后空态检查 |
| **Risk** | PASS_WITH_ISSUES (Critical 已解) | ota_safe=true, truncate_safe=true; 部署顺序=后端先 |

## Risk Critical → 已解决
**问题**: v48 前端 goal-select.tsx 仍调已删的 `/api/episodes/:id/generate`, Risk 判"若 goal-select 可达 = Blocker"。
**核实**: goal-select **不可达** —
- 无任何 router 导航到 /goal-select
- live 导入流程 = home Learn → learn.tsx 粘贴 → /import/[jobId] → snapshot → **`/api/packs/:id/generate`**(live 路由, 完好)
- goal-select 只从 EpisodeCard(learn.tsx 里的预存 dead 分支, 依赖不存在的 importEpisode)进, 该分支恒不执行
**处理**: 删 episode 的死 legacy-generate useEffect (唯一 live 文件里调死路由处)。goal-select 保留(在 murky 预存老链, 不动)。/learn live 粘贴流程验证渲染正常。

## 部署顺序 (Risk 强制)
**后端先** → 验 /health + register/login + 空 GET 200 → **再发 OTA v48**。
禁 OTA-first (会给新前端配旧后端)。

## TRUNCATE 安全 (Risk 确认)
- 清: 业务表 (podcasts/episodes/transcripts/learning_packs + pack_* + user_* 桥接 + jobs + logs + uploads)
- **不清**: schema_migrations, 且 users 表清空会 brick 登录 — 保留 users 或清后重建 frank_final
- 清后验: register/login + 空 Library/Review 冷启动渲染

## Product 两 gate
1. 原子部署顺序 (后端先) ✓ 已纳入
2. 清库后空态检查 (home/library/review 空状态优雅) — 部署后验

## 结论
v48 = 纯结构重构, 功能零改, API 路径不变。无 Blocker/Critical (Critical 已核实解决)。
OTA-safe (React Query 纯 JS 无原生依赖)。可按"后端先→清库→OTA"顺序部署。
