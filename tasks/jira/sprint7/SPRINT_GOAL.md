# Sprint 7 Goal — iOS App 端到端 URL 学习包体验 · OTA 推送

**主题**：K0 iOS App 通过 OTA 支持 URL 输入 → 学习包展示，用户在 TestFlight 真机能玩全流程
**Sprint window**：Sprint 6 完成后 → next
**类型**：Feature Sprint（**iOS 前端改动 + OTA 推送**，无 EAS build）
**Acceptance Mode**：`auto`（Mode 2）
**约束**：**禁止 EAS build，只允许 OTA**

---

## 核心目标

Frank 手机（TestFlight K0）打开 App → 粘小宇宙/Apple URL → 看等待动画（下载/转录/生成三阶段） → 中途切后台干别的 → 回来看到学习包（撕纸风） → 浏览 6 步/3 卡片/3 行动。

**必须无违和**：等待时用户不会以为 App 卡了、切后台恢复能接续、网络断了能重连、错误状态有明确提示。

---

## 用户约束（继承 Sprint 5-6）

**必须遵守**：
1. UI **禁止出现**"实时转录"、"BCUT"、"逆向" 等字样
2. **只 OTA 不 build**
3. UX 无违和：等待/后台/错误都要正常
4. **质量优先**：文案、进度动画、状态提示要精心
5. K0 现有撕纸风设计（Sprint 3-4 已完成）不改动，只加新界面

---

## Stories

| ID | 类型 | 主题 | Points | Owner |
|---|---|---|---|---|
| STORY-00400 | Frontend | Learn 屏改造：粘 URL 检测（小宇宙/Apple）+ 立即调 backend `/import-url` | 2 | Frontend |
| STORY-00401 | Frontend | 新等待屏 `PodcastImportProgress`：3 阶段动画（下载/转录/生成）+ 撕纸风 loading | 3 | Frontend |
| STORY-00402 | Frontend | Job 轮询逻辑：3-5s 一次 poll `/api/jobs/:id`，指数退避，网络断线重试 | 2 | Frontend |
| STORY-00403 | Frontend | 后台恢复：App 从后台回前台时检查 pending job，接续显示进度 | 2 | Frontend |
| STORY-00404 | Frontend | 错误状态 UI：BCUT 失败 / GLM 失败 / audio 抓不到 各自的友好文案 | 2 | Frontend |
| STORY-00405 | Frontend | Episode 屏改造：展示 URL 导入生成的学习包（复用 Sprint 3 撕纸风 UI）| 2 | Frontend |
| STORY-00406 | Frontend | 中英混语言标签展示：Episode 顶部显示"中文/英文/中英"tag | 1 | Frontend |
| STORY-00407 | Frontend | Home 底部 PasteBar 检测：URL 自动路由到 import-url，文本路由到 learn/generate | 1 | Frontend |
| STORY-00408 | Frontend | 微交互：等待期"你可以最小化 App，好了会提醒你"文案；完成回来播花瓣动画 | 2 | Frontend |
| STORY-00409 | QA | 端到端真机测试：Frank 手机装最新 OTA，测 5 个真实 URL 全流程 | 2 | Frontend |

**总点数**：19 pts

---

## Definition of Done

- [ ] Frank 手机上打开 K0（最新 OTA）
- [ ] Home PasteBar 粘一个小宇宙 URL → App 自动检测 URL → 跳转等待屏
- [ ] 等待屏显示"AI 正在为你精读这集..."+ 撕纸风进度动画 3 阶段
- [ ] 中途切后台 → 30 秒后回来 → App 恢复显示当前阶段（无违和）
- [ ] 2-4 分钟后跳转 Episode 屏，显示学习包（撕纸风 + 6 步 + 3 卡片 + 3 行动）
- [ ] 5 个真实 URL 全流程真机测试通过（3 小宇宙 + 2 Apple 中英各一）
- [ ] 错误状态展示友好文案（不出现技术细节）
- [ ] UI 无"BCUT"、"实时转录"、"逆向"等违规字样
- [ ] OTA 推送完成，`eas update --branch production` 成功

---

## 技术要点

### 前端目录结构（新增）
```
app/
  import/
    [jobId].tsx         # 等待屏（新）
  episode/
    [id].tsx            # 现有，改造消费 URL 导入的 pack
components/
  PodcastImportProgress.tsx   # 3 阶段动画（新）
  ImportErrorState.tsx         # 错误状态（新）
lib/
  urlDetector.ts                # 小宇宙/Apple URL 匹配（新）
  jobPoller.ts                  # 轮询逻辑（新）
```

### URL 检测规则
```ts
const XIAOYUZHOU_RE = /xiaoyuzhoufm\.com\/episode\/[a-f0-9]{24}/i;
const APPLE_RE = /podcasts\.apple\.com\/[^/]+\/podcast\/(?:[^/?]+\/)?id\d+/i;
function detectUrl(text: string): 'xiaoyuzhou' | 'apple' | 'text';
```

### 等待屏文案（不违规）
- **下载阶段**：`🎧 拿到播客了` `AI 正在下载音频到云端`
- **转录阶段**：`🎙 AI 正在为你精读这集` `预计还需 X 分钟`
- **生成阶段**：`✨ AI 在提炼学习包` `快好了`
- **完成**：`📚 学习包已准备好` （撕纸小旗子飘过动画）

### 后台恢复
```ts
useEffect(() => {
  const subscription = AppState.addEventListener('change', (state) => {
    if (state === 'active' && pendingJobId) {
      pollJob(pendingJobId, true /* immediate */);
    }
  });
  return () => subscription.remove();
}, [pendingJobId]);
```

### 错误状态文案
- BCUT 失败：`这集播客有点特别，AI 没能听清楚，你可以粘贴文本试试`
- GLM 失败：`AI 正在打盹儿，稍后再试试？`
- audio 抓不到：`找不到这集的音频，可能是付费或私密内容`
- 网络断：`看起来网络有点慢，等等再试`

---

## Sprint 7 交付节奏

- Day 1-2：STORY-00400/407（URL 检测 + PasteBar 路由）
- Day 3-4：STORY-00401/402（等待屏 + 轮询）
- Day 5：STORY-00403/404（后台恢复 + 错误 UI）
- Day 6：STORY-00405/406/408（Episode 改造 + 语言标签 + 微交互）
- Day 7：STORY-00409（真机端到端测试）+ OTA 推送

---

## OTA 推送流程

```bash
# Sprint 7 全部改动完成后：
cd C:/ClaudeCodeProjects/K0
eas update --branch production --message "Sprint 7: URL 导入 + 学习包端到端"

# 手机上：
# 1. 打开 TestFlight K0
# 2. App 检测到 OTA 更新（Sprint 3 已配置 checkAutomatically: ON_LOAD）
# 3. 自动下载新 JS bundle
# 4. 重启 App 就是新版本
```

---

## 明确不做

- App 内播放器（需 build，暂缓）
- 时间戳跳转（需播放器）
- 推送通知（需 build）
- 卡片翻转/收藏（Sprint 8+）
- Library 页/Review 队列（Sprint 8+）
