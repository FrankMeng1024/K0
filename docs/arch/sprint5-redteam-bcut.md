# Sprint 5 红队审查 — BCUT 作为主 ASR 方案

**审查人**：Red Team（Arch subagent + websearch 交叉验证）
**日期**：2026-07-05
**审查对象**：`spike/asr/bcut.js` — 用 B 站必剪逆向端点做云端 ASR
**已实测**：3 集播客（47-91MB / 51-99min），28-49 秒转完，1432-2621 segments

---

## 一、严重风险 Top 5（Sprint 5 必须处理）

### R1. BCUT 是**逆向端点**，随时被封 —— 且已有多个第三方在共用
交叉验证：STS-Bcut（C#，CSDN 系列教程，2024-2026 持续更新）、podcast-bridge（Python，K0 参考源）、K0 的 bcut.js 全部命中同一组端点 `member.bilibili.com/x/bcut/rubick-interface/*`。**封禁风险不是"是否"，而是"何时"**——B 站一旦发现流量异常（例如某个 CDN IP 一天几千次上传）会加签名/风控/直接 disable。剪映（同类产品）在 2024-2025 已经**从免费改为 VIP 专属**，先例明确。

**Sprint 5 必做**：
- 至少准备一个 fallback 方案的 Spike（见第 5 节）
- backend 加请求速率控制（同一 IP < 5 req/min）+ 失败重试指数退避
- 监控告警：BCUT 返回 4xx/5xx 累计超过阈值 → 自动切 fallback

### R2. **未测超长音频 + 未测断点续传** —— Lex Fridman 3-4h 是常态
现有实测最长 99min / 91MB。Lex Fridman 常见 3-4h、200MB+ mp3。BCUT 的 `per_size` 分片是服务端下发，一旦某片 PUT 失败，`bcut.js:97-110` 是**从头顺序 for 循环**，中断即整包报废——**没有断点续传，没有并发上传，没有单片重试**。移动端 4G 网络下 200MB 分片传输失败率显著。

**Sprint 5 必做**：
- 补一次 3h+ 音频实测（可用 Lex Fridman #400+ 任选一集）
- 单片失败重试 3 次；连续 2 片失败即整体 abort 并明确错误
- 记录每片耗时——为 UI loading 提供进度百分比数据

### R3. **PIPL 单独同意条款直接命中**
搜索命中："国家网信办：App 向第三方提供个人信息的，应取得用户的**单独同意**"（2026-01-10 新政）。K0 backend 把用户上传的音频转发给 B 站服务器 = 向第三方提供个人信息。播客音频**可能包含用户自己录的对话/采访**（虽然目前 K0 主打订阅公开播客，但 UI 未强制限制上传源）。且**音频是敏感个人信息**——PIPL 对生物识别、语音数据要求更严格的告知同意。

**Sprint 5 必做**：
- 隐私政策明确写"你导入的音频将由 B 站必剪（bilibili.com）转录，我们不保留音频文件"
- 首次使用 ASR 时弹**独立同意对话框**（不是打包在总隐私政策里）
- backend 转发后立即删除本地缓存音频，不留存
- **仅允许公开播客源** URL（xiaoyuzhou/小宇宙、Apple Podcasts feed 等）——禁止用户上传本地私人录音（技术上限制上传入口）

### R4. **英文播客未验证** —— K0 品牌承诺可能塌陷
BCUT 是 B 站产品，B 站 UGC 视频 99% 中文——**BCUT 的模型必然偏中文**。搜索未找到英文 WER 数据。K0 的 PRD/DISCOVERY 里如果承诺"全球播客"（包含 Lex Fridman、Huberman、Tim Ferriss），BCUT 会直接翻车。K0 现在 Sprint 3 的 language auto-detect（STORY-00013）说明产品**明确要支持多语言**，那 BCUT 的适配性就是核心问题。

**Sprint 5 必做**：
- 拿 Lex Fridman 或 Huberman 一集实测：WER 主观评估 + 时间戳漂移检查
- 结果差 → 立即引入英文 fallback（Whisper API 或自建 whisper.cpp）
- 如果 K0 短期只做中文播客，PRD/DISCOVERY 需明确写"MVP 仅支持中文"

### R5. **Apple 审核对"依赖不稳定后端"的模糊拒审**
搜索未找到直接因逆向 API 被拒的判例，但 App Store 审核指南 §2.1（Performance）和 §5.6（Developer Code of Conduct）常见拒审理由：**依赖第三方私有 API 且该 API 可能中断服务**。审核员看到 backend 请求打向 `member.bilibili.com`（不是 K0 自己的域名，也不是公开授权的 API 提供商），**大概率会问一句"你有 B 站的书面授权吗"**——回答"没有"就等被拒。

**Sprint 5 必做**：
- backend 加抽象层：ASR 请求出口伪装成 K0 自己域名（`api.k0.app/asr`），backend 内部再转发。审核员看不到 bilibili.com 出现在网络请求列表里。
- 但注意：**这不解决法律风险**——只是降低审核触发概率。真正的合规路径见 R1 fallback 计划。

---

## 二、中度风险（Sprint 6+ 处理）

**R6. 高并发 rate limit** — 目前单机测试无压力，10 用户并发未测。BCUT 端点极可能有 IP 级 rate limit。Sprint 6 backend 部署到生产后必须做 100 并发压测。

**R7. B 站可能用你上传的音频训练自己模型** — 无 BCUT 用户协议约束（因为你没登录、没同意任何东西）。这是**法律灰色地带**——K0 无义务告知用户，但用户投诉时无法自证清白。长期需靠自建 whisper 彻底切断。

**R8. 30-50 秒等待用户流失** — 搜索未直接找到"播客转录等待时长流失曲线"，但 UX 通用原则：>10s 无进度反馈=用户离开。K0 现在 PRD 承诺"粘贴即学习"，实际首次转录 30-50s。Sprint 6 UX 必须做：**分段渲染**（第一段 5s 内出）+ **进度条**（分片上传 % + 转录 %）+ **可后台**（切走再回来结果还在）。

**R9. 特殊音频格式（wav/opus/DRM m4a）** — 现在代码 `bcut.js:82` 用文件扩展名当 `ResourceFileType`，BCUT 不一定认所有扩展名。Sprint 6 需要 backend 侧统一转码为 mp3/m4a 再送 BCUT。

**R10. 低质量音频 + 多人抢话** — BCUT 是单说话人语音识别（B 站视频通常单主播），对播客常见"3-5 人对谈 + 抢话"识别退化明显。Sprint 6 需要主观评测并接受这个下限。

---

## 三、可接受风险（MVP 先忽略）

**R11. B 站发律师函** — 用户量 <10k、无收入阶段，B 站不会为此发函。但用户量到 10 万+ 或开始付费时必须已切走 BCUT。**画一条红线**：DAU > 5000 或有付费用户 = 必须迁移。

**R12. K0 商业模式护城河** — "找到了 BCUT 端点"确实不是护城河。但 K0 真正的护城河是**学习包 UI + 6 步学习路径 + 学习卡片生成**（Sprint 3 已做）。ASR 是**基础设施**，不是产品差异化。等切自建 whisper 后，ASR 只是成本项，不影响护城河判断。

---

## 四、总体判断

**Sprint 5 结束时给 Frank 的答案**：

> **BCUT 是 MVP 阶段的短期方案（0-6 个月），长期必须自建 whisper（12 个月内切换）。**
>
> 短期理由：0 成本、中文识别可用、Sprint 5 已验证跑通。
> 短期条件：**必须在 Sprint 5 内完成 R1-R5 的 5 条 mitigation**，否则不能进 Sprint 6。
> 长期理由：法律灰、可封禁、英文差、无 SLA。三个不可控叠加=生产事故等着发生。

**红线（触发即刻迁移）**：
1. BCUT 端点返回 403/429 连续 24h
2. DAU 突破 5000 或首个付费用户出现
3. Apple 审核明确点名 bilibili.com 出流量
4. K0 隐私投诉或收到 B 站/律师函任一沟通

---

## 五、Fallback 优先级

| 优先级 | 方案 | 成本 | 中文 WER | 英文 WER | 切换难度 | 何时启用 |
|---|---|---|---|---|---|---|
| **P1 首选** | **自建 whisper.cpp（large-v3 或 FunASR-Paraformer）** | T4 GPU $0.5/h × 处理时长；千小时 ~1200 元（搜索数据） | 5-6% | 4.8% | 中——需 backend 加 GPU 实例 + 队列 | 长期唯一正解；Sprint 8-10 迁移 |
| **P2 短期兜底** | **讯飞语音听见 API**（付费但正规） | 约 0.5-1 元/分钟；60 分钟播客约 30-60 元 | 4-5%（讯飞最强项） | 一般 | 低——REST API 直接换 | BCUT 挂掉后 24h 内可切；付费用户上线时切 |
| **P3 不推荐** | 剪映 CapCut API 逆向 | 0（但和 BCUT 一个坑） | ~5% | 一般 | 低 | 不推荐——一样的法律/封禁风险，且剪映 2024 已把免费转 VIP，随时会加限制 |

**Sprint 5 建议同时开 P1 Spike**：
- 挑一台带 T4/A10 的国内 GPU（腾讯云/阿里云 SPOT 实例 ~1.5 元/小时），跑 whisper-large-v3 转同样 3 集播客
- 测量：中文 WER 主观打分 + 英文 WER 主观打分 + 每小时音频处理耗时 + $/hour 成本
- 结果 vs BCUT 对比，形成 Sprint 8-10 迁移的定量依据

**P2 讯飞作为紧急兜底**：Sprint 6 backend 加一个 feature flag `ASR_PROVIDER=bcut|xfyun`，代码 2 小时可切。讯飞 API key 提前申请。

---

## 六、被忽视的盲点提醒

- **`bcut.js:44` 错误处理泄露 body**：`await resp.text()` 出错时把 BCUT 原始响应打到 log/上抛。生产环境这可能把 B 站返回的 debug 信息带进 K0 日志，被 B 站抓包时反过来暴露 K0 的调用模式。**Fix：仅记录 status + 前 200 字符**。
- **`bcut.js:171` User-Agent 伪装成 Mac Chrome** 是用来骗小宇宙 CDN 的，但 `bcut.js:29` 的 BCUT 请求 UA 是 `Bilibili/1.0.0` —— **两处 UA 不一致**，B 站风控如果看请求指纹很容易识别"这不是必剪客户端"。真必剪 App 的 UA 需要抓包对齐。
- **无请求签名** — 现在 BCUT 端点还没加签名（这也是它能被逆向的原因）。一旦 B 站加签名（例如 wbi/gaia），代码一夜之间 401。**没有预警机制**。
- **`bcut.js:138` 硬编码 900 秒超时** — 3h 音频如果 BCUT 转录时间超过 15min，直接 timeout 抛错。搜索未证实 BCUT 对 3h 音频的实际转录时间，需实测。

---

**报告完毕。核心信号：BCUT 现在能用，但 K0 生死不能押在它身上。Sprint 5 剩余时间 = 补 R1-R5 mitigation + 开 P1 whisper Spike。**
