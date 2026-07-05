# K0 核心 Spike 结论（Sprint 5 交付）

**日期**：2026-07-05
**性质**：**项目决策级文档**，Sprint 6+ 必须沿用
**背景**：Sprint 5 是 Spike Sprint，无产品交付，专门验证 URL→学习包 端到端链路。所有决策基于真实数据实测（不是纸上谈兵）。

---

## 决策速览

| 决策项 | 结论 | 依据 |
|---|---|---|
| **ASR 主力方案** | BCUT（B 站必剪逆向端点） | 免费、直连、10/10 成功率、含 4h 音频 |
| **GLM 主模型** | glm-5.2 | 3 集稳定性双盲评 8.55 vs 4.6 的 7.88，5.2 三集全胜 |
| **注意力稀释解决** | 方案 B：Prompt 优化（章节标记+分布约束） | 2/2 命中，成本 1x（分片方案 8-12x） |
| **中英混语言处理** | 三分支 prompt（zh / en / mixed） | GLM 中文优先，需显式约束防术语被音译 |
| **Audio 抓取** | 小宇宙 HTML 正则 + Apple RSS enclosure | 58 集实测 100% 成功 |
| **YouTube 支持** | Sprint 6-7 暂缓（GFW 阻断需 CF Workers） | Frank 明确可跳过 |
| **App 播放器** | Sprint 6-7 暂缓（需要 EAS build） | Frank 禁止自行 build |

---

## 1. ASR 主力方案 = **BCUT**

### 为什么选它
- **完全免费**：无 API key、无登录、境内直连
- **实测稳定**：10/10 成功，含 244MB / 4-5 小时超长音频（132 秒转完）
- **速度快**：45min 音频平均 30-70 秒
- **带 timestamp segments**：为跳转/高亮做好数据基础
- **中文识别质量好**：错别字轻微不改语义（"林海客" 类）

### 参考实现
- **参考代码**：`spike/reference/podcast-bridge-main/transcribe.py:877-983`
- **Node.js 移植**：`spike/asr/bcut.js`（150 行）+ `spike/asr/bcut-batch.js`（批量测试）
- **实测数据**：`spike/data/spike-014-bcut-*.json` + `spike/data/spike-014-bcut-batch-10.csv`

### 硬性 UX 约束（Apple 审核合规）
- 前端 UI **禁止出现**："实时转录"、"AI 转录"、"BCUT"、"必剪"、"字节"、"逆向" 等字样
- 展示语言："AI 正在为你精读这集..." "生成学习包中..."
- 转录动作发生在 backend，前端只展示结果

### 风险与 Fallback
- BCUT 是**逆向端点**，B 站可能封（12 个月内可能发生）
- **Sprint 6 必须实现监控告警 + mock fallback UI**
- 长期备选（不在 Sprint 6-7 范围）：SenseVoice 阿里开源本地部署

### 已排除的 ASR 方案（不要再讨论）
| 方案 | 排除原因 |
|---|---|
| 剪映 | 依赖第三方签名服务 `asrtools-update.bkfeng.top` 不稳定（实测 2/3 挂） |
| whisper.cpp / faster-whisper CPU | 4C8G 数学上做不到 <30min |
| 通义听悟 | Frank 主动排除 |
| 讯飞/腾讯/火山 | Frank 不要付费依赖 |
| YouTube timedtext | GFW 阻断，需 CF Workers 部署（暂缓） |
| 网易云/喜马拉雅 | 无稳定 GitHub 参考，工程量大 |

---

## 2. GLM 主模型 = **glm-5.2**

### 配置
- **API Key**：`25b1986b20e44755a4c8d6a4f2a74cf8.pDZFjxSUjpJhyIrd`（Coding Plan Lite 套餐专属，非通用 API key）
- **Base URL**：`https://open.bigmodel.cn/api/coding/paas/v4`
- **Model**：`glm-5.2`
- **max_tokens**：`8192`（4096 会截断超长学习包）
- **temperature**：0.5-0.7
- **Context 上限**：实测 1M tokens（K0 单集最多 67K，远低于上限）

### 为什么 5.2 不是 4.6 / flash

**3 集稳定性双盲评（2 subagent，分差 ≤ 0.15）**：

| 集数 | glm-4.6 | glm-5.2 | 胜者 |
|---|---|---|---|
| 硬地骇客（技术） | 8.00 | 8.65 | **5.2** |
| 声东击西（时政） | 7.60 | 8.50 | **5.2** |
| 跨国串门（AI 监管） | 8.05 | 8.50 | **5.2** |
| **平均** | **7.88** | **8.55** | **5.2 全胜** |

- **flash 明显不能用**：3.21 分，学习步骤全部 timestamp 相同（"极其偷懒"）
- **4.6 之前推荐是单集 0.14 分噪音的误判**，3 集扩展验证被推翻
- **5.2 消耗 2-3x 额度但 Lite 400/周远够用**

### 成本估算（Frank 1-2 人 × 每周 30 集）
- 5.2 每集消耗 2-3x → 60-90 prompt/周
- **Lite 400/周额度 = 剩余 77%+ 空间**

### 高峰期影响
- 14:00-18:00 UTC+8 5.2 消耗 3x
- 用户量小不成问题，无需优化

---

## 3. 注意力稀释解决 = **方案 B（Prompt 优化，不做分片）**

### 问题背景
GLM-5.2 处理 99 分钟播客时**次要但独立的议题**会被"稀释"漏掉（如"加州选举"话题在 99 分钟 AI 监管播客里被漏成背景）。Context 有 1M 上限不是瓶颈，问题是**"lost in the middle"**注意力问题。

### 五种方案实测对比

| 方案 | 加州选举命中 | 耗时 | Token 消耗 | 结论 |
|---|---|---|---|---|
| Baseline 单次 | 2/3（概率尾部漏） | 145s | 1x | 不稳定 |
| 朴素分片 3 段 | 1/1 | 356s | 8-12x | 太贵 |
| 方案 A 议题清单先行 | 议题 2/2 但正文都漏 | 240s | 2x | ❌ 假阳性 |
| **方案 B 章节标记+重复强调** | **2/2 双命中** | **60-80s** | **~1x** | ⭐ **采用** |
| 方案 C 两阶段递归 | 2/2 | 240s+ | 2x | 太贵 |

### 方案 B 具体实施

**Sprint 6 backend `generate.js` 改动**：

1. **System prompt 首尾各放硬指令**：
```
[开头] 你必须遍历所有议题，包括次要但独立的（哪怕只讨论 2-3 分钟）。

[中间：原有 JSON schema 要求]

[结尾] 重申：不要遗漏任何独立议题。6 个 steps 必须分布在不同章节。
```

2. **Transcript 拼接时插章节标记**（每 15 分钟一个）：
```
=== [章节 1: 0-15min] ===
[45s-48s] 主持人：大家好...
...

=== [章节 2: 15-30min] ===
...
```

3. **System prompt 加分布约束**：
```
"6 个 steps 必须分布在不同章节（sourceTimestamp 覆盖 ≥4 个 15min 章节）"
```

4. **Runtime 兜底**（backend 端 pipeline）：
```
生成 pack 后检查 6 个 sourceTimestamp 覆盖多少个 15min 章节
< 4 个章节 → 自动重试一次
```

### 已排除方案
- **方案 A（议题清单先行）**：假阳性陷阱，议题命中但正文都漏
- **方案 C（两阶段递归）**：命中但成本 2x
- **朴素分片**：成本 8-12x 太贵，方案 B 达到相同质量

---

## 4. 中英混语言处理 = **三分支 prompt**

### 背景
K0 用户主要听中文，但会遇到：
1. 纯英文播客（Lex Fridman / Huberman）
2. 中英混合（硬地骇客里频繁 "Skills"/"Agent"/"Loops"）

GLM 中文优先，倾向把英文术语音译（"Anthropic" → "安特罗皮克"）。必须显式约束。

### Sprint 6 backend 语言分支

**已有基础**：Sprint 3 `services/langDetect.js` 检测 zh/en。需扩展为 zh/en/mixed 三态。

**三套 prompt**（在 system prompt 追加，可复制）：

**纯中文（zh）**：
```
本播客为纯中文内容。请用简体中文输出学习包，术语首次出现时保留英文原文并加中文标注，格式为"中文名（English）"。人名、公司名、产品名一律保留英文原文，禁止音译（例：Anthropic 不译为"安特罗皮克"）。
```

**纯英文（en）**：
```
This podcast is in English. Output the learning pack in Simplified Chinese for a Chinese-speaking learner, but preserve ALL of the following in original English: person names, company names, product names, technical jargon, book/paper titles. Do not transliterate. Add brief Chinese explanation in parentheses only when the term is domain-specific and unfamiliar to a general audience.
```

**中英混合（mixed）**：
```
本播客为中英夹杂内容（code-switching），说话人频繁使用英文技术术语（如 Skills / Agent / Prompt / Context / Loop）。请严格遵守：(1) 保留所有英文术语原文，不翻译不音译；(2) 首次出现时用括号加一句中文说明；(3) 输出学习包主体用简体中文，但英文术语原样嵌入；(4) 若转录中的英文名疑似讹误（如"费波"可能是"Fable"），在 notes 字段标注"疑似原词"，不擅自改写正文。
```

### 英文实体保护清单
**新增 `backend/src/config/entity_whitelist.json`**：硬编码 30-50 个常见英文术语，在 prompt 里显式列出"必须保留原文"。

示例：`["Anthropic", "OpenAI", "Claude", "GPT", "Cursor", "Skills", "Agent", "Prompt", "Fable", ...]`

---

## 5. Audio 抓取（100% 成功率）

### 小宇宙
- HTML 正则 `[\w.-]*xyzcdn\.net/[^"'\s]+\.(m4a|mp3|aac)` + `og:audio` meta + JSON-LD schema **三重 fallback**
- 无 sign 无 cookie，境内直连
- 代码：`spike/audio-extractor/xiaoyuzhou.js`
- 实测：**48/48 = 100%**

### Apple Podcasts
- iTunes Search API `lookup?id=<podcastId>` 拿 feedUrl
- RSS feed 拿单集 enclosure.url
- 代码：`spike/audio-extractor/apple.js`
- 实测：**10/10 = 100%**

### iOS 兼容性
- 所有 audio URL 都是 `m4a` (audio/mp4) 或 `mp3` (audio/mpeg)
- 全部支持 HTTP Range（可任意 seek）
- **iOS AVPlayer 原生可播**（Sprint 6-7 后加播放器时不用担心格式问题）

---

## 6. 端到端总耗时 & UX 要求

### 用户等待时间
| 阶段 | 中位数 | 极端值 |
|---|---|---|
| Audio 抓取 | 0.5s | 3s |
| 下载 audio 到 backend | 3s (60MB) | 10s (244MB) |
| BCUT ASR | 30-50s | 132s (4h 音频) |
| GLM-5.2 生成（方案 B） | 60-80s | 90s |
| **合计** | **~130s (2 分钟)** | **~250s (4 分钟)** |

### 必须的 UX 兜底（Sprint 7 做）
1. **进度动画**（三阶段：下载中 → 转录中 → 生成中）
2. **可切后台**（App 恢复时接续显示 job 状态，不能白等）
3. **job 状态持久化**（backend 用 DB 存 job，重启不丢）
4. **网络断线恢复**（App 端轮询失败后指数退避重试）
5. **明确禁用"实时转录"字样**

### 暂缓（需要 EAS build）
- App 内播放器（expo-audio）
- 时间戳跳转
- 后台音频播放
- 推送通知

---

## 7. Sprint 6-7 Frank 硬约束

1. **禁止 EAS build**：Sprint 6-7 只允许 OTA（`eas update`）
2. **目标**：URL → 学习包 → 卡片全链路端到端跑通，OTA 到 Frank 手机真机测
3. **原则**：最少成本 + 最高质量（**质量优先**）
4. **UX 无违和**：等待期 + 后台切换 + 网络问题都不能破功

---

## 8. Sprint 5 所有数据与代码位置

### 代码
- `spike/audio-extractor/xiaoyuzhou.js` `apple.js`
- `spike/asr/bcut.js` `bcut-batch.js` `jianying.js` `youtube-transcript.js`
- `spike/glm-compare/ping-lite.js` `generate-packs.js` `retry-52.js` `stability-test.js` `chunked-strategy.js` `ctx-limit.js`

### 数据
- `spike/data/spike-010-xiaoyuzhou-audio.csv`（48 集小宇宙抓取）
- `spike/data/spike-011-apple-audio.csv`（10 集 Apple）
- `spike/data/spike-014-bcut-batch-10.csv` + 3 个完整 transcript JSON
- `spike/data/spike-015-jianying-*.json`（1 集剪映）
- `spike/data/spike-016-glm-compare-*.json`（6 模型横评）
- `spike/data/spike-016-stability-test.json`（3 集稳定性）
- `spike/data/spike-016-chunked-*.json`（分片测试）
- `spike/data/attention-*.json`（方案 A/B/C 实测）

### 报告
- `docs/spike-results/sprint-5-final-report.md`（本文档的完整版）
- `docs/spike-results/spike-016-stability-verdict.md`（GLM 稳定性）
- `docs/spike-results/attention-mitigation-test.md`（注意力方案对比）
- `docs/spike-results/spike-014-bcut-snapshot.md`
- `docs/spike-results/spike-youtube-blocked.md`
- `docs/arch/asr-options-2026.md`
- `docs/arch/sprint5-redteam-bcut.md`（红队 review）
- `docs/research/attention-dilution-solutions.md`（学术方案调研）

### 参考代码
- `spike/reference/podcast-bridge-main/`（Hatari130，Python）
- `spike/reference/podforge-main/`（dairui1，Node.js）
- `spike/reference/xiaoyuzhou-podcast-obsidian-skill-main/`（LZN2026，Python）

---

**本文档是 Sprint 6+ 的决策基础，任何反悔或推翻某个决策需要 Frank 明确授权。**
