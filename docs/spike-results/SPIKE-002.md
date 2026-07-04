# SPIKE-002: Apple Podcasts / Spotify RSS 抓取

**Status**: **PARTIAL VIABLE — Apple ✅, Spotify BLOCKED** ⚠️
**Date**: 2026-07-04
**Executor**: Backend
**Location**: `_spike/spike-002/`

---

## 目标（回顾）
验证从 Apple Podcasts / Spotify 单集 URL 抓取元数据 + 转录源。

## 环境
- Node 25.8.2
- `rss-parser` 3.13.0
- Windows 11 企业网络

## 测试内容

**Apple** (2 URL):
- `apple-01`: The Daily by NYT
- `apple-02`: Huberman Lab

**Spotify** (SKIPPED): 参考 SPIKE-001，本环境无法访问 `open.spotify.com`（境内网络阻断）。

## 方法

### Apple 抓取路径
1. 从 URL 提取 podcast id (`id...`) 和 episode id (`i=...`)
2. 调 iTunes Search API `lookup?id=<podcastId>&country=US` → 拿 `feedUrl` + podcast 元数据（名称、艺术家、封面 600px、总集数）
3. 调 iTunes Search API `lookup?id=<episodeId>&entity=podcastEpisode` → 拿单集元数据（标题、描述、发布日期、时长、音频 URL）
4. 可选：用 `rss-parser` 拉 `feedUrl` 获取全部集列表（`itunes:duration`、`itunes:image`、`itunes:episode`）

## 结果

| Sample | Status | Latency | Podcast | Episode |
|---|---|---|---|---|
| apple-01 (The Daily) | ✅ ok | 4.6s | "The Daily" by NYT | 拿到 title/duration/audio_url |
| apple-02 (Huberman Lab) | ✅ ok | 13.8s | "Huberman Lab" by Scicomm Media | 拿到 title/duration/audio_url |

**Apple 成功率**: 2/2

**关键元数据均拿到**：
- podcast 名称、艺术家、封面（`artworkUrl600`）、feedUrl
- episode 标题、描述、发布日期、时长（ms）、音频 mp3 URL

### 转录情况

**Apple Podcasts 官方 API 不暴露 auto-transcript**。Apple Podcast Connect（后台）从 2023 开始自动生成 transcript，但只有播客主自己能看到，第三方 API 拿不到。

**候选转录方案**：
1. 下载音频 → 走 Whisper STT（用户在 podcast 主页 URL 里的音频文件是公开 mp3；下载 + STT 本地/云可行）
2. 用户手动粘贴（简单方案）
3. 从原始 podcast 官网抓 show notes（数据密度低，仅描述性文字）

**Spotify 阻断**：
- 网络原因无法访问 open.spotify.com（境内网络）
- 即使能访问，Spotify 单集 URL 用 Open Graph 只能拿到很基础的 title/description/artwork，**没有音频直链**（Spotify 的音频加密不允许下载）
- Spotify 的官方 API（Client Credentials 流）能拿 episode 元数据，但同样**不给音频文件**
- Spotify 唯一转录源：Spotify 自家的 podcast/audiobook auto-transcript 功能仅在 Spotify 客户端里展示，无公开 API

## 结论

**PARTIAL VIABLE**：
- **Apple 元数据 100% 可抓** ✅ — 走 iTunes Search API + `rss-parser`
- **Apple 转录**：需 Whisper STT + 下载音频（Sprint 2 需专项 spike）
- **Spotify 元数据**：因当前网络无法验证，暂 BLOCKED；即便通了，音频不可下载
- **Spotify 转录**：**不可行**（无公开 API）

## 产品建议

Spotify 优先级降低，M1/M2 阶段只支持：
1. **YouTube**（若 SPIKE-001 网络问题解决）→ 官方字幕
2. **Apple Podcasts** → 元数据 + Whisper STT 音频转录
3. **手工粘贴文本**（fallback for 任意来源）

Spotify 显式不承诺（DISCOVERY.md §"What We Will NOT Build" 追加）。

## 添加到 backlog

- **STORY-00082**（新）: 音频 STT 方案 spike（Whisper 本地 vs 云 API vs 用户上传 SRT）→ 决定 Apple 转录路径
- **DISCOVERY.md 更新**：Spotify 列入"暂不支持"，含理由

## 已保存

- `_spike/spike-002/results.json`
- iTunes Search API 请求模板（可复用到 Sprint 2 Backend）

---
