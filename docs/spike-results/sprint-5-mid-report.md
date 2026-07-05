# Sprint 5 中期汇报 - 2026-07-05 18:45

## 已完成 spike（真实数据）

### Audio 抓取（100% 成功率）
- **小宇宙**: 48/48 成功（17 + 31 深挖），CDN `media.xyzcdn.net`，Range 全支持
- **Apple Podcasts**: 10/10 成功，iTunes API + RSS enclosure，多 CDN 兼容

### ASR 转录（3 方案已实测）
| 方案 | 单集耗时 (声东击西 57MB/62min) | Segments | 优点 | 缺点 |
|---|---|---|---|---|
| **BCUT** (B站必剪) | **37s** | 1744 | 快、稳定、免登录 | 逆向端点，可能被封 |
| **剪映** (字节) | **432s（7.2min）** | 2134 | 更细粒度、片头能识别 | 慢 12 倍、依赖第三方签名服务、复杂 |
| **YouTube timedtext 直连** | 全部失败 | - | - | GFW 阻断 |

### 长音频压力测试（BCUT）
- 47MB / 51min → 29s ✓
- 91MB / 99min → 49s ✓
- 202MB / 4h → 118s ✓
- 244MB / 4-5h → **132s ✓**（红队担心的 3h+ 通过）
- **10/10 全成功，平均 70s**

### 网络路径调研（CF Workers）
- **确认最优解**：Cloudflare Workers 免费版
- 成本：¥0/月（10 万请求/日免费额度）
- 部署：30 分钟
- 稳定性：Cloudflare 到 Google 骨干直连，反爬风险低
- 需要：Frank 有个人域名 + CF 账号 + 绑定子域（免备案）

### GLM 模型探测
- ✅ **glm-4-flash** 能用（1.6s 响应）
- ❌ 其他 8 个模型全部 `1113 余额不足`（air/plus/4.5/4.6 都需充资源包）
- **flash 就是当前唯一可用模型**，横向对比 spike 无法做

### 已知失败方案
- YouTube 直连（GFW，需 CF Workers 或香港 ECS）
- 网易云播客（我无真实节目 ID 样本，未测）
- whisper.cpp 自建（4C8G CPU 数学上做不到 <30min，未测）

---

## 关键洞察 vs Frank 要求

**Frank 明确要求**：稳定 + 质量为核心，**不是速度**

**当前对齐度**：
- ✅ 稳定：BCUT 10/10 长短音频，剪映 1/1（样本少但可用）
- ⚠️ **质量对比不完整**：只跑了 BCUT 全流程 + 剪映 1 集，没做 subagent 双盲评分
- ⚠️ GLM 只有 flash 能测，无法完成横评

---

## 待推进（按优先级）

### P0 - 核心质量对比（Frank 明确要求）
1. **剪映跑 3 集完整对比样本**（硬地骇客 + 声东击西 + 张小珺 145）
2. **BCUT 已有 3 集 transcript**
3. **各 transcript 喂 GLM flash 生成学习包**（同一 prompt）
4. **2 个 subagent 双盲评分**（分差 ≤1 取平均，>1 加第 3 个）
5. **产出**：BCUT vs 剪映 vs 直接看文本 质量对比矩阵

### P1 - CF Workers 部署（YouTube 支持）
- 用户已批准："如果 CF worker 是目前最优解，就 sprint5 融入"
- 需要 Frank 提供个人域名（部署 5 分钟即可测通）

### P2 - iOS Expo Go 播放验证
- 独立 spike RN 项目，Expo Go 扫码测 4 个 audio URL
- 不动 K0 主 App，不影响 build
- 验证：加载、播放、seek、进度条

### P3 - 未做的方案（选做）
- SenseVoice 阿里开源本地 ASR（无外部依赖，可长期兜底）
- 通义听悟免费额度（Frank 之前排除，可复议作 fallback）

---

## 需要 Frank 做的决策

1. **CF Workers 部署你的哪个个人域名子域**？（例 `yt.yiiling.cn`）
2. **质量对比 spike 现在推进吗**？（跑剪映 3 集 + subagent 双盲 = ~1 小时）
3. **GLM 其他模型充资源包吗**？（air 100 万 tokens ¥5，flash 不够时用）
