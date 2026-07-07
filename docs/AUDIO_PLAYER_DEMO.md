# K0 音频播放 Demo（Sprint 15）

## 功能
点击学习包页 / 快照页里的时间戳（"3:30 ▶"、"3:39 — 4:30" 等）→ 从对应时间点开始播放原播客音频。底部常驻撕纸风 sticky bar。

## 改动清单
- `lib/audioPlayer.tsx` (新) — 全局 React Context 管一个音频实例；native 用 `expo-av`，web 用 `HTMLAudioElement`
- `components/AudioPlayerBar.tsx` (新) — 底部固定播放条：▶/⏸ + 时间 + 进度条（可点击 seek）+ ×
- `app/_layout.tsx` — 挂 `<AudioPlayerProvider>` 和 `<AudioPlayerBar />`
- `app/episode/[id].tsx` — 卡片 `sourceTimestamp` 和 `worthListening.start` 变成 Pressable，点击 → 播放
- `app/snapshot/[packId].tsx` — `worthListening.startSec` 和转录段 `paragraphs[].start` 变成 Pressable
- `backend/src/routes/packs.js` — `GET /api/packs/:id` 现返回 `audioUrl`（join `episodes.audio_url`）

## Frank 需要手动做的事

### 1. 安装 expo-av（native 播放依赖）
package.json 里目前**没有** `expo-av`。native (iOS/Android) 上必须装：

```bash
cd C:\ClaudeCodeProjects\K0
npx expo install expo-av
```

（web 端不装也能跑，代码走 HTMLAudioElement fallback）

装完需要 EAS build 才能在 iOS/Android 上生效（native module）。**web 端 OTA 即可测。**

### 2. 后端重启
`backend/src/routes/packs.js` 改了 SQL，需要重启后端 Node 进程。

### 3. 测试路径
1. web dev：`npm start` → 打开 web → 打开任一 episode（或 snapshot）→ 点"值得听 3:39"或某张卡片的"3:30 ▶"
2. 底部应出现撕纸风播放条，加载后自动 seek + 播放
3. 点 ▶/⏸ 暂停恢复；点进度条可 seek；× 关闭卸载

### 4. 如果没听到声音
- **web**：Chrome 阻止自动播放 → 底部会显示"浏览器阻止自动播放，请再点一次"，再点一次 timestamp 即可
- **audio_url 为空**：老的 episodes 记录可能没抓 audio_url。查 DB：`SELECT id, title, audio_url FROM episodes WHERE audio_url IS NULL;`
- **CORS**：Apple Podcast 的 direct MP3 通常允许跨域，若浏览器 console 报 CORS，则需 backend 代理（下个 Sprint 再做）

## 设计
- 音频 state 用 React Context + useReducer（避免装 zustand）
- 单例 sound 实例，跨页面共享
- iOS: `playsInSilentModeIOS: true`，静音键不影响
- iOS: `staysActiveInBackground: false`（K0 是学习工具，不做后台听书，省电）
- 进度条：轻量点击 seek（不做拖动，避免额外依赖 slider）

## 已知限制
1. 不支持后台播放（PRD 未要求）
2. 不做全局迷你播放器持久化（关闭 app 即卸载）
3. 进度条只支持点击 seek，无拖动手柄（demo 简化）
4. 无速度控制（1.5x/2x）——下个 Sprint 加
