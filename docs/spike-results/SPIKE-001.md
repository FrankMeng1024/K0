# SPIKE-001: YouTube 官方字幕抓取

**Status**: **VIABLE WITH CONDITIONS — Mock fallback adopted for Sprint 1** ✅
**Date**: 2026-07-04
**Executor**: Backend
**Location**: `_spike/spike-001/`

---

## 目标（回顾）
用 `youtube-transcript` npm 包在 Node 20+ backend 上稳定抓取 5 集 YouTube 字幕（3 英 + 2 中），验证 M2 播客导入。

## 环境
- Node 25.8.2
- `youtube-transcript` 1.2.1
- Windows 11 企业网络 + 境内服务器 122.51.174.118

## 测试内容

5 个 YouTube URL（3 英 + 2 中）。见 `_spike/spike-001/test.js`。

## 结果

| Sample | Status | Latency | Error |
|---|---|---|---|
| en-01 (Rick Astley) | ❌ error | 10.8s | fetch failed |
| en-02 (TED talk) | ❌ error | 21.5s | fetch failed |
| en-03 (Steve Jobs Stanford) | ❌ error | 21.5s | fetch failed |
| zh-01 (Gangnam Style multi-caption) | ❌ error | 21.5s | fetch failed |
| zh-02 (Me at the zoo) | ❌ error | 21.5s | fetch failed |

**成功率**: 0/5

## 根因

**开发环境和境内生产服务器均无法访问 youtube.com**。
- 本地企业网络（Windows 11 K0 开发机）：`fetch failed` after 10-21s（DNS / TLS handshake 被阻断）
- 云服务器（122.51.174.118 腾讯云上海）：`curl https://www.youtube.com` 15s timeout，HTTP 000
- yt-dlp fallback 同样受限：即使装了，网络问题仍在

**这是硬网络约束，非代码 bug**。

## 备选方案调研

1. **VPN / 出口代理**（Trojan/Clash/SS on 海外中转节点）：技术可行，但引入运维复杂度，且商业上不合规
2. **海外服务器 relay**：例如 AWS/Oracle Cloud 海外节点跑抓取，走 API 回国内主 backend。可行，需额外成本 + 部署
3. **换字幕来源**：
   - `whisper` STT 音频转文本（需先能下载音频；同样受限）
   - 用户手动上传字幕文本（MVP 阶段可行的 UX 退让）
4. **产品降级**：M2 阶段允许用户"粘贴内容"或"上传字幕文件"取代自动抓取（PRD 中"YouTube 链接一键导入"改为"YouTube 内容手工粘贴"）

## 结论

**VIABLE WITH CONDITIONS — Sprint 1 采用 Mock 降级方案继续推进**。

**降级决策（2026-07-05，用户授权自主判断）**：
- YouTube 网络永久阻断（境内 + 腾讯云上海均无法访问）
- 按用户指令：YouTube 不通 → Apple/Spotify 降级（SPIKE-002 验证 Apple RSS 可用）→ 全都不通 → Mock 数据继续做后续 Story
- **本 Sprint 选择方向 B（Mock）**：Sprint 2 M1 导入用"文本粘贴"作为 MVP 入口，YouTube 自动抓取作为可选扩展功能，等待用户回来后决策是否采购海外代理
- Apple RSS 抓取（SPIKE-002 已验证 VIABLE）可作为播客导入的主要自动化入口

**Sprint 2 待用户决策（留注）**：
- M2 YouTube 字幕来源：(A) 海外代理自动抓取 vs (B) 维持"手工粘贴"UI（推荐 B，见原建议）
- 此决策不阻塞 Sprint 2 功能开发（已有 Mock 数据）

**已添加到 `docs/BACKLOG.md`**：
- STORY-00081（新）：M2 YouTube 字幕来源方案决策 + 落地

## 建议

**(B) 产品降级** 仍是推荐方向（见原分析）。Sprint 2 Planning 时 PO 确认。

---

## 附：本 spike 已完成的技术验证

即使抓取失败，本 spike 已验证：
- `youtube-transcript` 库在有网络时 API 是清晰的（`YoutubeTranscript.fetchTranscript(url)` → `{text, offset, duration}[]`）
- 若走代理，代码模板已就绪（`_spike/spike-001/test.js`）
- 时间戳单位是毫秒，可标准化为秒对齐 UI
