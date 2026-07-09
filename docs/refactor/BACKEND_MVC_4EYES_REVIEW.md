# 后端按功能 MVC 重构 — 4-Eyes Review (改前 + 改后)

**日期**: 2026-07-10
**范围**: 后端从"按层"重组为"按功能 MVC 模块" + AI 独立 + 死码清理

## 改前 review (方案审)
- **Arch**: PASS_WITH_CHANGES → 已并入:
  1. generate.js/glm.js 死码 Step 0 先删 (已核实 live flow 里死)
  2. 跨域只读聚合明确为 READ-MODEL 规则

## 改后 review (结果审)

| Reviewer | Verdict | 关键 |
|---|---|---|
| **Arch** | PASS | split_integrity=intact; ai_isolated=true; 运行时加载全 30 模块无循环; 12 个原 packStore 导出全部到位无丢失; ai.service 门面完整; 无 feature 直接 import packGenerator |
| **Risk** | PASS_WITH_ISSUES | ✅ ai_prompt_path_ok=true (readFileSync join(__dirname,'./prompts/..') 运行时解析正确); packStore split 无 DB 逻辑丢失; helper (toInt/toDecimal/safeUtf8Slice) 都在 pack.model 本地定义 |

**无 Blocker / 无 Critical。**

## 改后修复 / 处理
- **[Risk Low] 空孤儿目录**: config/lib/middleware/routes/services 移空后删除。剩 ai/ features/ shared/。
- **[Risk Medium] 老装机版可能调已删的 /api/episodes/:id/generate**: live route 是 /api/packs/:id/generate (不同, 完好)。缓解 = 后端部署 + 前端 OTA 一起发 (task #46 计划), 老 bundle 随 OTA 迁移。前端 live 源码里那两处引用 (episode/[id].tsx:178, goal-select.tsx:89) 在死分支 (goal-select 孤儿页, episode 数字 id 跳过), 不会真触发。留作前端后续清理, 不阻塞。

## 结果结构
```
src/features/ (8 模块)  user/podcast/transcript/pack/learning/importJob/upload/logging
src/ai/                 packGenerator + aiLogger + ai.service 门面 + prompts/  ← 唯一碰 GLM/prompt
src/shared/             db/errors/auth.middleware/pushService/health
```
- packStore 813行 → podcast.model(115)+transcript.model(88)+learning.model(45)+pack.model(575)
- 删死码 glm.js(352) + generate.js(211) 路由
- AI 结构化日志强化 (glm_call_ok/fail: model/token/latency/fallback)

## 验证
- 后端重启 health 200 + DB pool OK
- key 端点全 200: login/packs/library/review/transcript/whoami
- node ESM 加载全模块无循环无 resolve 失败

## 遗留 (非阻塞, backlog)
- library/review 跨域 JOIN raw SQL 仍在 controller 内 (READ-MODEL 下沉 learning.model 延后)
- 前端 2 处死引用 /api/episodes/:id/generate (deploy+OTA 一起发即缓解)
- podcast.controller 读 GLM_MODEL env 做缓存 key (非 AI 调用, 可让 ai.service 暴露 model id 收紧)
