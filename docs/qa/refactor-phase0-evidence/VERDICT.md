# Phase 0 Playwright 冒烟验证报告

**日期**: 2026-07-09
**Commit**: 2af86e3 (Phase 0 cleanup)
**验证方式**: MCP Playwright + 本地 backend + expo web (localhost:8081)
**API 目标**: 生产 API (api.k0.yiiling.cn) —— K0 前端设计上 dev 环境也走生产 API（OTA 安全设计）

## 结论

**PASS** ✅ — Phase 0 清理未破坏任何用户可见流程。

## 验证清单

| 步骤 | 结果 | 证据 |
|---|---|---|
| Backend 冷启动 | ✅ DB pool initialized, health 200 | curl `/health` = `{status:ok, db.ok:true}` |
| Backend 关键 API 冒烟（本地） | ✅ 全部 200 | `/api/packs/1` `/api/library/packs` 都 200 |
| Expo web dev server | ✅ HTTP 200，51-52s bundle | `curl :8081/` = 200 |
| 首页 login 加载（iPhone 14 390×844） | ✅ 完整撕纸剪贴风格 | 01-login-iphone14.png |
| 注册新账号 refactor_test_20260709 | ✅ 成功，跳转 home | 生产 API POST 200 |
| Home 页面渲染（iPhone 14） | ✅ 3 卡片完整（Learn/Review/Library）+ 头像 + 分割线 | 02-home-iphone14.png |
| Learn 页面 + 粘贴 xiaoyuzhou URL | ✅ 输入被识别，"开始"按钮 enabled | 03-learn-input.png |
| Library 页面（空态） | ✅ 2 tabs + 4 filters + 引导 CTA | 04-library-empty.png |
| Review 页面（空态） | ✅ 引导 + 回首页按钮 | 05-review-empty.png |
| Navigation regression | ✅ Home ↔ Learn ↔ Library ↔ Review 无 error | 每次导航后 console.error = 0 |
| iPhone SE viewport (375×667) | ✅ 布局正确无溢出 | 06-home-iphone-se.png |
| iPhone 15 Pro Max viewport (430×932) | ✅ 布局正确无空白 | 07-home-iphone-15promax.png |
| Console error 累计 | ✅ **0 个 app 相关 error** | 唯 2 个 error 是 `/favicon.ico 404`（Expo dev 默认，无关） |

## 关键观察

1. **前端已内置 `Cache-Control: no-store`（Sprint 16 R20 加的）**——为 Phase 2 缓存改造留了一半路
2. **前端 apiFetch 已有统一 wrapper（`lib/api.ts`）**——Phase 2 加 trace_id 只需要改 wrapper
3. **注册流程稳定**——auth flow 不受 Phase 0 清理影响
4. **Expo Router 静态路由稳定**——删除的死组件确实无引用

## 已知历史问题（Phase 0 未引入，进入 Phase 1 backlog）

1. `langDetect.test.js` 1/13 失败（mixed CJK 返回 'mixed' 但测试期望 'zh'）—— Sprint 6 遗留
2. Web dev 环境走生产 API（`.env.local` 硬编码 `api.k0.yiiling.cn`）—— 设计如此，不算 bug

## Session 遗留

- 已启动 backend 后台进程（`bur1achtv`）—— 保留供 Phase 1 使用
- 已启动 expo web 后台进程（`b3czpi75q`）—— 保留供 Phase 1 使用
- 已注册测试账号 `refactor_test_20260709` / `Test123456` —— 供后续 e2e 复用

## Frank 三条硬约束确认

- [x] "App 本身要不受影响" —— **PASS**，5 页面全部渲染，0 error
- [x] "清理不用的东西，确保整洁" —— **PASS**，净删 3056 行，git 干净
- [x] "playwright 全流程测试成功，没有明显错误" —— **PASS**

Phase 0 收官。可以进入 Phase 1。
