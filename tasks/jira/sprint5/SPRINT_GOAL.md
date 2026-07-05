# Sprint 5 Goal — Spike Sprint

**主题**：真跑数据，不做产品功能
**Sprint window**：2026-07-05 开始
**类型**：**Spike Sprint**（用户明确要求：不做任何 OTA、不动 K0 主 App、不集成到 TestFlight）
**Acceptance Mode**：`auto`（Mode 2）—— PO 是 main agent，无用户中间验收

---

## 核心目标

**验证 K0 商业模式的 3 条生死线**：
1. **播客 URL → audio 直链**（能不能可靠地拉到音频文件）
2. **audio → 文本**（能不能自建 + 免费开源 + 高质量 + 合理耗时）
3. **App 内直接播 audio**（Expo Go 验证，不 EAS build）

**外加**：**GLM 全型号横向对比**（flash / air / plus / 4.6）—— 用户已买套餐

---

## 用户约束（硬约束，不可协商）

1. **不做任何产品功能** —— Sprint 5 期不发 OTA、不改 K0 主 App
2. **不加硬件** —— 就在 4C8G 腾讯云 122.51.174.118 CPU 上跑，不加 GPU
3. **不用付费第三方 API** —— 只允许：自建（whisper.cpp / faster-whisper）+ 免费开源 + 逆向免费端点（BCUT / 剪映）
4. **单集转录耗时 > 30 分钟 = pass 掉该方案**（用户明确规则）
5. **诚实汇报** —— 失败也是有价值的 spike 结果
6. **多 subagent 并行 + 4-eyes review**
7. **汇报节奏**：blocker 立即停下汇报 + 最终产品经理语言的简洁报告

---

## 用户约束（漏斗式 spike）

**Phase 1** — 小宇宙 + Apple Podcasts 两平台先跑通
- Audio 抓取实测（10-15 集样本 × 2 平台）
- 4 种 ASR 方案并行实测（whisper.cpp / faster-whisper / BCUT / 剪映）
- 数据出来后筛选出 1-2 个 winner

**Phase 2** — winner 方案扩到其他平台
- 喜马拉雅 / 网易云播客 / YouTube 视 Phase 1 剩余时间

---

## Stories

| ID | 类型 | 主题 | Points | Owner |
|---|---|---|---|---|
| SPIKE-010 | Audio 抓取 | 小宇宙 URL → audio 直链（20 集实测） | 2 | Backend |
| SPIKE-011 | Audio 抓取 | Apple Podcasts URL → audio 直链（20 集实测） | 2 | Backend |
| SPIKE-012 | ASR | whisper.cpp CPU 4 核实测（3 集测耗时和 WER） | 3 | Backend |
| SPIKE-013 | ASR | faster-whisper int8 CPU 4 核实测（同样 3 集） | 3 | Backend |
| SPIKE-014 | ASR | BCUT 逆向端点 Node.js 移植 + 实测 | 3 | Backend |
| SPIKE-015 | ASR | 剪映逆向端点 + 探索其他免费开源 ASR（Paraformer / SenseVoice / HuggingFace） | 3 | Backend |
| SPIKE-016 | GLM | GLM flash / air / plus / 4.6 多模型横向对比 | 3 | Backend |
| SPIKE-017 | 播放器 | Expo Go 里播小宇宙 + Apple audio 直链，验证 iOS 后台播放 + 断点续播（不 EAS build） | 3 | Frontend |
| SPIKE-018 | 扩展 | Phase 2 winner 方案扩到喜马拉雅 / 网易云 / YouTube（视时间） | 2 | Backend |
| SPIKE-019 | 报告 | 最终报告：产品经理语言的简洁明确报告 + Sprint 6 决策清单 | 2 | Arch |

**总点数**：26 pts

---

## Definition of Done（Sprint 5 交付物）

### 代码产物
- `spike/audio-extractor/` — 各平台 extractor Node.js 实现
- `spike/asr/` — 各 ASR 方案的实测 script
- `spike/glm-compare/` — GLM 模型对比脚本
- `spike/player-demo/` — Expo Go 播放器 demo

### 数据产物
- `docs/spike-results/spike-010-xiaoyuzhou-audio.csv` — 20 集小宇宙 audio 提取结果
- `docs/spike-results/spike-011-apple-audio.csv` — 20 集 Apple audio 提取结果
- `docs/spike-results/spike-012-whisper-cpu.csv` — whisper.cpp 各集实测耗时/WER
- `docs/spike-results/spike-013-faster-whisper.csv` — faster-whisper 各集实测
- `docs/spike-results/spike-014-bcut.csv` — BCUT ASR 实测
- `docs/spike-results/spike-015-others-asr.csv` — 剪映+其他方案
- `docs/spike-results/spike-016-glm-compare.csv` — GLM 模型评分
- `docs/spike-results/spike-017-player.md` — 播放器 spike 结果 + 截屏

### 最终报告
- `docs/spike-results/SPRINT-5-final-report.md` — **产品经理语言，简洁明确**，含：
  - 3 条生死线是否走通（YES / NO / VIABLE WITH CONDITIONS）
  - 每个方案实测数字（耗时、成功率、WER、成本）
  - Sprint 6 推荐主推方案
  - Sprint 6 Story 候选清单

---

## 用户答疑记录（本 Sprint Planning 决策依据）

1. **硬件**：不加，就 4C8G CPU 真实测
2. **外部 API**：只自建，不碰付费 API；逆向免费端点（BCUT/剪映）如稳定可用
3. **平台**：小宇宙 + Apple 先，Phase 2 视时间扩展
4. **播放器**：能不 build 就不 build，Expo Go 验证足够
5. **OTA**：Sprint 5 不发
6. **GLM**：全型号对比
7. **底线**：真跑，失败也可接受
8. **汇报**：blocker 立即停 + 最终简洁报告
9. **样本**：用户自己选公开样本
10. **whisper 单集 >30min = pass**

---

## 30 分钟 pass 规则（用户设定的淘汰条件）

任何 ASR 方案在单集实测中：
- **单集 audio 45 分钟播客的转录耗时 > 30 分钟** → 该方案直接淘汰
- 只保留耗时 ≤ 30 分钟的方案进入 Phase 2 决策

**这是硬规则**——即使质量再好，30 分钟等待用户不会接受，浪费后续 spike 时间无意义。

---

## Note

Sprint 5 是**探索性**的，交付物包括**证伪结果**。CLAUDE.md 里定义的 QA subagent / UX subagent 常规流程**不适用**——spike sprint 只需要 Arch 主导的技术报告 + 实测数据。
