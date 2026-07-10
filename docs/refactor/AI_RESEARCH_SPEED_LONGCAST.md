# AI 提速 + 长播客(226min)支持 — 调研报告

**日期**: 2026-07-09
**性质**: 纯调研, 零代码改动 (per Frank "不要改代码")
**方法**: 2 个 Explore subagent 摸代码 (ASR + GLM 管线) + context7 查 GLM/ZhipuAI 官方 model 规格。联网搜索不可用 (GLM websearch 余额耗尽), model 规格以 context7 官方 repo (zai-org/glm-5) 为权威源。

---

## TL;DR (给 Frank 的产品语言结论)

1. **226 分钟播客的最大担心 (GLM 上下文塞不下) — 不存在。** GLM-5.2 是 **100 万 token 上下文**, 226 分钟转录稿约 5-10 万 token, 只占 5-10%, 塞得下且很宽裕。
2. **真正会卡死的是转录 (ASR) 那一步**: 现在代码写死"最多轮询 30 分钟就放弃"。226 分钟的音频转录本身可能要跑 30 分钟以上 → **会误判超时失败**。这是 226 分钟播客的头号 Blocker。
3. **提速空间主要在三处**: (a) 上传改并行 (现在一块一块串行传); (b) GLM 关掉"深度思考"档 + 开流式; (c) Step1→Step2 现在严格串行, 部分可重叠。
4. **全部是配置/参数/编排层面的改动, 不动业务逻辑, 未来做的时候低风险。** 本报告只列方案, 不写代码。

---

## 一、现状管线 (已核实)

```
用户贴 URL
  → 下载音频     (bcut.js, DL_TIMEOUT_LARGE = 15min)
  → 上传到 BCUT  (串行分块, 每块 UPLOAD_TIMEOUT = 5min)
  → 创建 ASR 任务
  → 轮询转录结果 (ASR_POLL_MAX=1800 × ASR_POLL_INTERVAL=1000ms = 30min 天花板)
  → GLM Step 1: 快照   (generateSnapshot, 送【全文】转录)
  → GLM Step 2: 学习包 (generatePackFromSnapshot, 只送 worthListening 段落)
  → 落库
```

- 编排: `podcast.controller.js runPipeline()` 经 `setImmediate` 起后台 job, `updateJob` 推进度 5→100。
- ASR 是**阻塞式**: 转录不出来, GLM 一步都不动。
- 3 层缓存 (同一集不重复干活): `findUserPackByEpisode` / `getTranscriptByEpisodeAndProvider` / `findLatestSnapshotPack`。

---

## 二、GLM 侧 — 上下文/超时/参数 (context7 官方规格)

来源: `github.com/zai-org/glm-5` README + `_autodocs/06-api-reference.md`

| 项 | 值 | 说明 |
|---|---|---|
| **GLM-5.2 上下文** | **1,000,000 token (1M)** | 旗舰版, "solid 1M-token context"。这是我们代码里默认的 `GLM_MODEL=glm-5.2`。 |
| GLM-5 base 上下文 | 131,072 (128k) | 老版, 仅作对比 |
| 单次输出上限 | 8,192 token | 我们 `GLM_MAX_TOKENS=8192` 已顶格 |
| **请求超时** | **60 秒** | ⚠️ 官方默认 60s; 我们代码里 GLM fetch **没设超时** → 可能挂死 |
| 预填吞吐 (prefill) | ~10,163 token/s (16卡基准) | 10 万 token 输入 ≈ 10s 纯读入 |
| 输出吞吐 (TPOT) | ~36 ms/token | 8192 输出 ≈ 5 分钟纯生成 (会是主要耗时) |
| `reasoning_effort` | `max`(默认) / `high` | **默认是 max = 最费时的深度思考档** |
| `enable_thinking` | true(默认) / false | 可整个关掉思考 → 大幅降延迟 |
| `stream` | 支持 | 可流式, TTFT 与 E2E 分离 |

### 关键换算 (226 分钟播客)
- 226 min ≈ 4 万–5.5 万汉字 ≈ **5.2 万–9.9 万 token** 输入。
- 占 GLM-5.2 1M 窗口的 **5%–10%** → **完全塞得下, 无溢出风险**。
- **推翻旧担心**: 之前 subagent 提示"若 glm-5.2 是 32k 窗口则必溢出"—— 官方确认是 1M, **此风险消除**。

### GLM 侧真实风险 (排序)
1. **无 fetch 超时**: 代码里调 GLM 没有 AbortController。长输入 + max 思考档可能 >60s, 甚至挂住不返回。官方请求超时 60s, 但我们客户端没兜。**风险: 静默挂死**。
2. **默认 max 思考档 + 8192 顶格输出**: 长输入下这是最慢组合, 单次调用可能几分钟。
3. **fallback 只对 429 触发**: 上下文超限 (本例不会发生) 或 400 会硬失败, 无降级恢复。1M 窗口下这条基本不触发了, 但超时/5xx 仍无 fallback。

---

## 三、ASR 侧 — 226 分钟的真正 Blocker

来源: `features/transcript/asr/bcut.js`

| 常量 | 值 | 对 226min 的影响 |
|---|---|---|
| `DL_TIMEOUT_LARGE` | 900_000 (15min) | 226min 音频 ~200MB, 慢 CDN 下可能 >15min → **下载超时** |
| `UPLOAD_TIMEOUT` | 300_000 (5min/块) | 串行上传, 块多 → 总上传时间线性累加 |
| `ASR_POLL_MAX` | 1800 | × 1s = **30 分钟轮询天花板** |
| `ASR_POLL_INTERVAL` | 1000ms | 每秒查一次 |
| `fs.readFileSync` | 整文件读内存 | 200MB 一次性进 node heap → **内存峰值风险** |

**核心问题**: 226 分钟音频的 ASR 转录本身耗时可能 **超过 30 分钟**。现在代码轮询到 1800 次 (30min) 就判失败放弃 → **长播客会稳定误判超时**。这是 226 分钟支持的 **头号 Blocker**, 优先级高于 GLM 侧任何问题。

BCUT (Bilibili 必剪) 本身: Spike 阶段验证过 4 小时音频可转, 所以**引擎能力没问题, 是我们代码的轮询上限卡死了它**。

---

## 四、提速方案 (方案层, 不写代码)

### A. 转录阶段 (收益最大)
- **A1 并行分块上传**: 现在 `UPLOAD_TIMEOUT` 是"每块"串行等。改并发上传 (Promise.all + 并发上限) → 总上传时间从"块数×单块"降到接近"单块"。
- **A2 流式读文件替代 fs.readFileSync**: 用 stream 分片, 削掉 200MB 一次性进内存的峰值。既提速又防 OOM。
- **A3 拉高轮询上限**: `ASR_POLL_MAX` 从 1800 提到能覆盖长音频 (如按音频时长动态算: `min(3小时, 音频分钟数×N)`)。**这条是长播客必做, 见第五节。**

### B. GLM 阶段
- **B1 关思考档 / 降档**: 快照/学习包是结构化抽取任务, 未必需要 `max` 深度思考。试 `enable_thinking=false` 或 `reasoning_effort` 不设 (跑默认) 对比质量 —— 若质量够, 延迟大降。
- **B2 开流式 (stream=true)**: 用户等待屏可以边生成边展示进度, 感知速度提升 (E2E 不变但 TTFT 快)。
- **B3 加 fetch 超时 + 重试**: 补 AbortController (对齐官方 60s, 或长输入放宽), 超时/5xx 走 fallback chain, 消除静默挂死。

### C. 编排阶段
- **C1 Step1→Step2 部分重叠**: 现在严格串行 (快照完才做学习包)。快照产出 worthListening 段落后, 学习包只依赖这些段落 —— 无法完全并行 (Step2 输入来自 Step1 输出), 但可考虑快照分段流式产出后提前触发 Step2。收益中等, 复杂度较高, 优先级最低。
- **C2 进度反馈细化**: 长播客等待久, `updateJob` 阶段应更细 (下载 %/上传 %/转录轮询进度/GLM 阶段), 避免用户以为卡死。属体验非提速。

---

## 五、226 分钟长播客支持 — 必做清单

按"能跑通"优先级排 (不写代码, 仅列改动点):

1. **【Blocker】拉高 ASR 轮询上限** (`ASR_POLL_MAX`)
   - 现 30min 天花板会误杀长播客。改为按音频时长动态计算超时。
2. **【高】下载超时按时长动态化** (`DL_TIMEOUT_LARGE`)
   - 大文件慢 CDN 下 15min 不够。
3. **【高】流式读文件** (替代 `fs.readFileSync`)
   - 防 200MB 一次性进内存 OOM。
4. **【中】GLM fetch 加超时兜底**
   - 长输入下无超时会挂死。
5. **【已确认无需处理】GLM 上下文**
   - 1M 窗口, 10 万 token 输入无压力, 无需分块/map-reduce。
   - (若未来换成 128k 的模型, 才需要 transcript chunking + map-reduce 归并 — 现在不需要。)
6. **【中】并行上传提速** (`UPLOAD_TIMEOUT` 串行→并发)
   - 长音频块多, 并行显著缩短上传。
7. **【体验】进度反馈细化** — 长等待期避免用户误判卡死。

---

## 六、结论与建议排期 (给 Frank 参考, 不自动执行)

- **226 分钟能不能支持**: 能。核心是**改 ASR 轮询/下载超时 + 流式读文件**这 3 条, GLM 侧无阻碍。
- **提速主战场**: (1) 上传并行化 (2) GLM 降思考档 + 流式 (3) fetch 超时兜底。
- **全部是参数/编排/配置层**, 不碰业务逻辑与 prompt 语义, 契合"AI 模块已独立"的架构 —— 未来动手时只改 `ai/` 与 `features/transcript/asr/`。
- **建议下一步 (若 Frank 决定做)**: 开一个 "AI 长播客 + 提速" Sprint, 按第五节清单排 Story, 走完整 4-eyes。**本报告不触发任何代码改动。**

---

## 附: 未能完成的调研项

- 联网搜索 (长音频转录竞品实践 / 长上下文 LLM 最佳实践) **未做** —— GLM websearch skill 余额耗尽 ("余额不足或无可用资源包")。model 硬规格已由 context7 官方 repo 覆盖, 结论不受影响; 竞品/业界实践部分待余额恢复后补充。
- BCUT 官方长音频硬上限文档未查到 (非公开 API); 以 Spike 已验证的 4 小时为经验上限。
