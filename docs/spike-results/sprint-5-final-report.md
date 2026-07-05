# Sprint 5 最终报告 — K0 端到端链路可行性

**日期**：2026-07-05
**类型**：Spike Sprint（无产品功能交付，仅验证技术链路）
**范围**：URL → audio → 转文本 → GLM 学习包 → iOS 播放
**用户约束**：个人向使用（1-2 人），要最高质量，YouTube 暂跳过

---

## 一、K0 完整链路（Sprint 6+ 可直接落地）

```
用户输入 URL (小宇宙 or Apple Podcasts)
        ↓
【SPIKE-010/011】audio 抓取（境内直连，100% 成功率）
        ↓
audio 直链 (m4a/mp3, media.xyzcdn.net 或 fireside.fm 等)
        ↓
【SPIKE-014】BCUT ASR (免费逆向端点)
        ↓
带 timestamp 的文字 segments
        ↓
【SPIKE-016】GLM-5.2 生成学习包 (Coding Plan Lite 套餐)
        ↓
学习包 JSON (一句话主题 + 3 核心点 + 6 步 + 3 卡片 + 3 行动)
        ↓
iOS App 显示（撕纸风 UI，已在 Sprint 4 完成）
+ 直接播放 audio 原声（expo-audio native module，Sprint 6 加）
```

---

## 二、每步方案 + 性能 + 成本

### Step 1: URL → audio 直链

| 平台 | 方案 | 成功率 | 平均耗时 | 成本 |
|---|---|---|---|---|
| 小宇宙 | HTML 正则 + og:audio + JSON-LD 三重 fallback | **48/48 = 100%** | 40-500ms | 免费 |
| Apple Podcasts | iTunes Search API → RSS → enclosure | **10/10 = 100%** | 300-3000ms | 免费 |

**代码**：`spike/audio-extractor/xiaoyuzhou.js`（140 行）+ `apple.js`（150 行）
**依赖**：Node 20 内置 `fetch` + `fast-xml-parser`
**iOS 兼容**：所有 audio URL 都是 `m4a` 或 `mp3` 标准格式 + 支持 HTTP Range → **iOS AVPlayer 原生可播**

### Step 2: audio → 文字（带 timestamp）

**主选：BCUT（B 站必剪逆向端点）**
- 完全免费、无 API key、无登录、境内直连
- 单集耗时（10 集实测）：**平均 70 秒**
  - 47 MB / 51 min → 29 秒
  - 91 MB / 99 min → 49 秒
  - 244 MB / **4-5 小时** → 132 秒 ✓（红队担心的超长音频通过）
- 输出：带 start/end timestamp 的 segments 数组
- 质量：中文识别准确，少量非语义错别字（如"林海客/硬地骇客"，不影响理解）

**备选：字节剪映（已实测但不推荐）**
- 依赖第三方公共签名服务 `asrtools-update.bkfeng.top`
- 实测：3 次中 2 次失败（服务本身不稳定）
- 结论：**不作为 fallback**（不比 BCUT 强，脆弱性更高）

**风险与 Fallback 计划**：
- BCUT 是**逆向端点**，B 站可能封（12 个月内切换风险）
- Sprint 6+ 备选方案（当 BCUT 挂时）：**SenseVoice 阿里开源本地部署** 或 **通义听悟付费 API**

### Step 3: 文字 → 学习包

**主选：glm-5.2**（双盲评分 9.07/10）

**双盲评分结果**（2 个独立 subagent，评分差 ≤0.15）：

| 排名 | 模型 | 分数 | 单集耗时 | 场景 |
|---|---|---|---|---|
| 🥇 | **glm-5.2** | **9.07** | 94.6s | 最高质量（K0 主推） |
| 🥈 | glm-4.6 | 8.93 | 70.8s | 质量接近、更快 |
| 🥉 | glm-5-turbo | 8.86 | 65.8s | 快+质量高 |
| 4 | glm-4.7 | 7.86 | 72.6s | 编程优化，播客场景稍保守 |
| 5 | glm-4.5 | 6.71 | 53.2s | 中等 |
| 6 | **glm-4-flash** | **3.21** ❌ | 11.8s | **明显不够用**（steps timestamp 全相同、内容空洞） |

**flash 的具体问题**：6 个学习步骤全部标 timestamp=2837s（"极其偷懒"）、主题泛化到"利用 AI 技能优化工作流"。K0 生产**不能用 flash**。

### Step 4: iOS App 播放 audio

**方案**：Expo `expo-audio` native module（Sprint 6 首个 EAS build 加进 K0）
**格式支持**：iOS AVPlayer 原生支持 m4a/mp3/aac
**Range 支持**：所有测试 CDN 都支持（后续可任意 seek）
**播放器 spike**：独立 Expo 项目已就绪（`C:/ClaudeCodeProjects/K0-audio-spike/`），用户跳过真机测试
**Sprint 6 集成成本**：加 expo-audio 依赖 + app.json 加 UIBackgroundModes → EAS build 一次（仅一次）→ 之后所有 UI 迭代 OTA

---

## 三、成本消耗（个人向 1-2 人使用）

**假设日均 2-5 集播客生成学习包**（周 14-35 次）：

| 项目 | 单次成本 | 月成本估算 |
|---|---|---|
| Audio 抓取（xiaoyuzhou/Apple） | ¥0 | ¥0 |
| BCUT ASR | ¥0 | ¥0 |
| GLM-5.2 生成学习包 | 消耗 Lite 套餐额度（Lite 每周 400 次 prompt） | **月 60-140 次 prompt << 1600 次限额** |
| GLM Coding Plan Lite 订阅费 | 用户已购 | ~¥XX/月（用户已订） |
| 腾讯云 backend VPS | 已有 | 已有 |
| **合计新增成本** | - | **¥0**（现有资源覆盖） |

**扩展场景**（如果日活到 30 用户 × 3 集/日 = 90 次/日 × 7 天 = 630 次/周）：
- 超出 Lite 限额（400/周）→ 需升级 Pro 套餐（2000/周）
- 或部分场景 fallback 到 glm-4-flash（免费但质量差）
- **暂不考虑**，个人向阶段不会遇到

---

## 四、Sprint 6 集成 checklist

### Backend 改动（可全部 OTA，无需 EAS build）
- [ ] 加 `services/audioExtractor/xiaoyuzhou.js` + `apple.js` extractor
- [ ] 加 `services/asr/bcut.js`（BCUT 逆向 ASR）
- [ ] 改 `services/glm.js`：
  - Base URL → `https://open.bigmodel.cn/api/coding/paas/v4`
  - Model → `glm-5.2`
  - max_tokens → 8192
  - API Key → 套餐专属 key（`25b1986b20e44755a4c8d6a4f2a74cf8.pDZFjxSUjpJhyIrd`）
- [ ] 改 `routes/generate.js`：pipeline audio → BCUT → GLM
- [ ] 加 job 状态持久化（转录 30-90 秒期间）
- [ ] 加 fallback：BCUT 失败时切换到 mock pack + 提示

### iOS App 改动（需 EAS build 一次）
- [ ] `npx expo install expo-audio`
- [ ] `app.json` 加 `plugins: [["expo-audio", { enableBackgroundPlayback: true }]]`
- [ ] `app.json` iOS 加 `UIBackgroundModes: ["audio"]`
- [ ] EAS build 3
- [ ] Episode 屏加 mini player（能播 + 进度条），跳转功能后续 OTA 加

### 用户体验（都是 OTA 可推）
- [ ] Learn 页 URL 检测 → 显示"正在为你听这集..."进度条
- [ ] 30-90 秒等待期动画
- [ ] BCUT 失败降级提示

---

## 五、暂不做（红队警告 + 用户决定）

- **YouTube 字幕支持**（需 CF Workers 部署 + 用户提供个人域名）
- **网易云/喜马拉雅播客**（无稳定 GitHub 参考方案）
- **whisper.cpp 自建**（4C8G CPU 数学上做不到）
- **GLM 模型高峰期优化**（用户量小不必要）
- **多平台并发抓取**（个人向不需要）

---

## 六、已知风险

1. **BCUT 端点可能被封**（1-12 个月内可能发生）
   - Mitigation：Sprint 6 保留 mock fallback 逻辑；监控成功率
2. **glm-5.2 在高峰期额度消耗 3x**（14:00-18:00 UTC+8）
   - 个人向用户量小不会触发
3. **iOS 后台播放需要 EAS build**（build 一次不可避免）

---

## 七、Sprint 5 交付物清单

**代码**（`spike/`）：
- `audio-extractor/xiaoyuzhou.js` + `apple.js`
- `asr/bcut.js` + `bcut-batch.js` + `jianying.js` + `youtube-transcript.js`
- `glm-compare/ping-lite.js` + `generate-packs.js` + `retry-52.js` + `prep-blind-eval-v2.js`

**数据**（`spike/data/`）：
- `spike-010-xiaoyuzhou-audio.csv`（48 集）
- `spike-011-apple-audio.csv`（10 集）
- `spike-014-bcut-*.json`（4 集完整 transcript）
- `spike-014-bcut-batch-10.csv`（10 集深挖）
- `spike-015-jianying-*.json`（1 集，剪映）
- `spike-016-glm-compare-*.json`（6 模型）
- `spike-016-blind-eval-v2.md`（盲评材料）

**文档**（`docs/spike-results/`）：
- `spike-014-bcut-snapshot.md`
- `spike-youtube-blocked.md`
- `sprint-5-mid-report.md`
- `sprint-5-key-findings.md`
- **`sprint-5-final-report.md`（本文档）**

**独立 spike 项目**：
- `C:/ClaudeCodeProjects/K0-audio-spike/`（iOS Expo Go 播放器 spike，用户跳过测试）

---

## 八、Sprint 6 建议主题

**"URL → 学习包 → 能播"MVP 集成**

工作量估算（Story 拆分）：
- STORY-00200 Backend: 加 audio extractor（小宇宙+Apple）— 3 点
- STORY-00201 Backend: 加 BCUT ASR pipeline — 3 点
- STORY-00202 Backend: 切 GLM-5.2 + 套餐 endpoint — 2 点
- STORY-00203 Backend: 端到端 pipeline（URL → 学习包）+ job 持久化 — 5 点
- STORY-00204 iOS: 加 expo-audio + EAS build 3 — 3 点
- STORY-00205 iOS: Episode 屏 mini player（能播暂停进度）— 3 点
- STORY-00206 iOS: Learn 屏 URL 检测 + 等待动画 — 2 点

**总计 21 点，一个 Sprint 装得下**

---

## 九、⚠️ 红队 Review 补充（必读）

### 1. 完整链路总耗时（用户等待时间）

之前分段列耗时容易误导。**用户从粘 URL 到看到学习包的实际等待**：

| 阶段 | 耗时（中位数） | 极端值 |
|---|---|---|
| Audio 抓取（URL → CDN 直链） | 0.5s | 3s |
| **下载 audio 到 backend** | 3s (60MB) | 10s (244MB) |
| BCUT 上传 + 转录 | 30s | 132s (4h 音频) |
| GLM-5.2 生成学习包 | 95s | 95s |
| **合计** | **~130s (2 分钟)** | **~250s (4 分钟)** |

**用户体验刚需**：Learn 页必须有**进度动画 + 可切后台**，2-4 分钟无反馈会流失。

### 2. Backend 内存/磁盘管理

- 单集音频最大 **244 MB**（4 小时播客）
- 2 并发就可能 OOM
- **必须实现**：流式转发（下载边上传给 BCUT）或磁盘临时文件 + LRU 清理

### 3. 现有代码架构隐性依赖

`backend/src/routes/generate.js:167` 强制要求 `transcripts` 表有记录。Sprint 6 需要新增 `POST /api/episodes/import-url` 路由承接抓取+转录，成功后 upsert transcripts。**这是隐式前置 Story，报告原 STORY-00203 5 点严重低估**。

### 4. iOS 长任务不能靠 HTTP 长轮询

- GLM 90s + BCUT 130s，客户端 fetch 60s 会先超时
- 必须：job 状态持久化 + 轮询 API + App 切后台恢复 job

### 5. 隐藏成本

- BCUT 上传走 backend 出口带宽（腾讯云出口费）
- 日均 5 集 × 100MB = 500MB/日 × 30 = **15GB/月**（个人向可忽略，但要写明白）

### 6. 合规风险（Apple 审核）

- BCUT + 剪映都是**逆向未授权 API**
- 前端 UI **不要出现"实时转录"字样**，让转录发生在后端，前端只展示结果
- **1 年内 BCUT 挂端点风险已知，Apple 下架风险未评估**

### 7. Sprint 6 拆分建议修正

**原 21 点 → 拆两个 Sprint**：

**Sprint 6**（backend-only，13 点）：
- URL → audio 抓取（3 点）
- BCUT ASR pipeline + job 持久化（5 点）
- GLM-5.2 切换 + endpoint（2 点）
- 端到端 pipeline + transcripts 写入 + 内存管理（3 点）

**Sprint 7**（iOS 集成，10 点）：
- expo-audio 集成 + EAS build 3（3 点）
- Episode 屏 mini player（3 点）
- Learn 屏 URL 检测 + 等待动画（2 点）
- 后台 job 恢复 + 网络错误处理（2 点）

### 8. Frank 需拍板的 2 件事

1. ~~**glm-5.2 vs glm-4.6**（差 0.14 分、慢 24s）—— 是否值得多等~~ **已验证（3 集稳定性测试）：5.2 全胜，主推 glm-5.2。见 `spike-016-stability-verdict.md`**
2. ~~**BCUT 合规敞口** —— 是否接受"1 年内可能被封 + Apple 审核风险"~~ **Frank 决定：接受，前端 UI 不体现"实时转录"字样，过审优先。**

---


**修正结论**：K0 完整链路技术**通**，但**用户等待 2-4 分钟需 UX 兜底**，**合规风险需 Frank 知晓**，**Sprint 6+7 两个 Sprint 而非一个**。
