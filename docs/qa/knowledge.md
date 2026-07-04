# QA Knowledge — K0

**Maintained by**: QA subagent (append-only via main agent)
**Purpose**: 累积 QA 对产品的理解、bug 模式、测试策略、回归清单。

---

## Sprint 0（2026-07-04）— Initial Understanding

### 产品性质
- K0 是 Full-Stack Web 应用（Next.js 14 单进程）
- 核心用户流：Home → Learn（粘贴链接）→ Episode（学习包）→ Cards → Review 队列
- 数据链：YouTube/Apple/Spotify URL → 转录 → GLM-4-plus 生成学习包 → MySQL 持久化

### 测试策略基线
- **Layer 1 存在性**：所有页面可访问 + 无 console error
- **Layer 2 正确性**：GLM 输出结构化 JSON 完整（快照 5 字段 + 6 步路径 + 5-10 卡片 + 3 行动 + 3-5 测验）
- **Layer 3 完成度**：完整用户流可跑通（导入 → 学习完成 → 卡片入库 → 复习）

### 关键性能门（来自 TECH_SPEC §performance-targets）
| 步骤 | 阈值 | 检查方式 |
|------|------|----------|
| 健康检查 | < 100ms | curl -w %{time_total} |
| 页面首屏 | < 2000ms | Playwright timing |
| AI 学习包生成 | < 60000ms | 后端 timing log |
| 转录抓取（YT 有字幕） | < 45000ms | 后端 timing log |
| feedback threshold | 2000ms | UX 交互测试 |

### 视觉验证要点（风格 F）
- 撕纸边缘应有明显 feTurbulence 位移感（非光滑边）
- 胖字母（Bagel Fat One）加载失败会回退到 system-ui，需在测试中验证字体真实加载
- 纯色平涂 + 无渐变
- 每页都应有主视觉插画（不能全文字）

### Viewport 覆盖（TECH_SPEC §viewports）
- Primary: 375px（iPhone SE）
- Secondary: 1280px（桌面）

### 测试数据（从 Sprint 0 收集）
- 中文播客示例：`https://www.youtube.com/watch?v=[张小珺访谈某集]`（待 Backend 提供有效链接）
- 英文播客示例：`https://www.youtube.com/watch?v=[Lex Fridman某集]`
- Apple RSS 示例：待 Sprint 1 SPIKE-002 验证
- Spotify 单集示例：待 Sprint 1 SPIKE-002 验证

---
