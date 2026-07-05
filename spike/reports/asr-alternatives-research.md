# 中文 ASR Fallback 方案调研（BCUT 之外）

**调研日期**: 2026-07-05
**基线**: BCUT 已验证，30-50s 转 45-99 分钟音频，免费免注册
**目标**: 找到 2-3 个可作 fallback / 替代的方案

---

## 方案 1：剪映 JianYing ASR（字节）— 已有实现，强烈推荐作 primary fallback

**证据等级**：★★★ 实际代码已读（`podcast-bridge-main/transcribe.py` 第 1080-1286 行）

- **端点**：
  - 签名服务 `https://asrtools-update.bkfeng.top/sign`（**第三方公共签名服务**，非字节官方）
  - 业务 API `https://lv-pc-api-sinfonlinec.ulikecam.com`（剪映桌面版内部 API）
  - 文件走字节 VOD `https://vod.bytedanceapi.com`（AWS S3 兼容签名）
- **流程**：`upload_sign` → 拿 STS 临时凭证 → PUT 到 VOD → `audio_subtitle/submit` → 轮询 `audio_subtitle/query`（最长 360s）
- **认证**：无需注册。tdid 是伪造的设备 ID（基于年份 + `uuid.getnode()`）
- **额度**：无明文限制，podcast-bridge 用作 BCUT 的 fallback 已稳定使用
- **返回**：`utterances[].start_time/end_time/text`（毫秒级时间戳，格式跟 BCUT 类似）
- **风险**：
  1. 依赖第三方签名服务 `bkfeng.top`——签名服务挂了整个流程作废
  2. 剪映端 tdid/appvr 随版本升级可能被封（历史上换过几轮）
  3. 签名协议逆向来的，字节任何时候可以改

**代码 sketch (Node.js)**：直接把 Python 逻辑翻过来即可，核心步骤已在 transcribe.py 1170-1286 行，改写量约 200 行。

---

## 方案 2：SenseVoice-Small（阿里开源，本地跑）— 强烈推荐作离线兜底

**证据等级**：★★ GLM 搜索 + 常识；未实际跑过

- **模型**：`FunAudioLLM/SenseVoice-Small`，234M 参数，多语言（中/英/日/韩/粤），带情感 + 事件识别
- **速度**：GLM 引用"CPU 上比 whisper 快 ~15x RTF"——具体：45min 音频 CPU 约 3-8 分钟，M1/M2 更快
- **部署**：`pip install funasr` → `AutoModel(model="iic/SenseVoiceSmall")`，模型约 500MB
- **额度**：本地跑，无额度限制
- **风险**：模型下载首次需要 500MB；无时间戳（segment 级需要 VAD 拆分，funasr 内置 fsmn-vad）
- **中文质量**：阿里官方 benchmark 声称在 AISHELL/WenetSpeech 上优于 whisper-large-v3

**代码 sketch (需 Python 子进程，Node 无原生支持)**：
```js
// Node.js 调用 Python 脚本方式
const { spawn } = require('child_process');
const p = spawn('python', ['sensevoice_transcribe.py', audioPath]);
// Python 端 8 行搞定：
// from funasr import AutoModel
// model = AutoModel(model="iic/SenseVoiceSmall", vad_model="fsmn-vad")
// res = model.generate(input=audio_path, batch_size_s=60, use_itn=True)
// print(json.dumps(res))
```

---

## 方案 3：阿里 DashScope paraformer-v2（云端异步 API）— 推荐作商业兜底

**证据等级**：★★ 官方文档 + GLM；未实际调过

- **端点**：`https://dashscope.aliyuncs.com/api/v1/services/audio/asr/transcription`
- **模型**：`paraformer-v2`（异步长音频，最长 12h/文件）、`sensevoice-v1`
- **认证**：需要阿里云账号 + API-KEY（个人实名即可，**不要企业**）
- **免费额度**：新用户开通"百炼"送 100 万 tokens（音频约 36 小时）——**GLM 说"100 万 tokens"，但 tokens 对音频的换算率未明确，需实测**
- **格式**：先把文件传到公网可访问 URL（OSS 或自建 CDN），再提交任务 ID，轮询结果
- **返回**：JSON 带 sentence-level 时间戳 + 词级时间戳
- **风险**：
  1. 音频必须公网可访问——K0 后端要么托管到 OSS，要么起临时 tunnel
  2. 需要注册 + 个人实名（用户可能反感）
  3. 免费额度用完就是纯商业

**代码 sketch**：
```js
const { OpenAI } = require('openai'); // dashscope 兼容 openai sdk
// 1) 上传到 OSS 或起 ngrok，拿 public URL
// 2) 提交任务
const resp = await fetch('https://dashscope.aliyuncs.com/api/v1/services/audio/asr/transcription', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${DASHSCOPE_KEY}`, 'X-DashScope-Async': 'enable' },
  body: JSON.stringify({ model: 'paraformer-v2', input: { file_urls: [audioUrl] } })
});
const taskId = (await resp.json()).output.task_id;
// 3) 轮询
while (true) {
  const r = await fetch(`https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`, { headers: {...} });
  const j = await r.json();
  if (j.output.task_status === 'SUCCEEDED') return j.output.results;
  await new Promise(r => setTimeout(r, 5000));
}
```

---

## 方案 4：B 站视频 AI 字幕 — **不推荐**

**证据等级**：★ 无实证，GLM 结果全是猜测

- B 站的 AI 字幕是 UP 主投稿完成、编码完毕后异步生成的，**不是独立 ASR endpoint**
- "把音频当视频传上去等字幕"理论可行，但：投稿要过审、需要 UP 主账号、可能触发风控、拿字幕要等几十分钟到几小时
- **结论**：延迟太高（30 分钟起）、不可控、有账号风险，废弃

---

## 方案 5：讯飞 lfasr — **不推荐作主力，可备用**

**证据等级**：★★ GLM + 讯飞官网常识

- 讯飞开放平台"长文本转写"个人认证后有免费额度（GLM 说每天 500 次，每次上限 5 小时任务时长），**但每天 500 次是接口调用次数，实际音频时长换算不清晰**
- 需要 APPID + SecretKey + 个人实名
- 中文质量业内标杆，但注册流程繁琐、易被限流
- **备胎位**：当 BCUT + JianYing 双挂时手动切换

---

## 方案 6：qwen2-audio / 通义听悟 / 火山引擎 / 腾讯云 — 都需要注册 + 实名

- **qwen2-audio**：qwen 家的 audio-in LLM，DashScope 上有，但**为对话设计，不擅长 45min+ 长音频转写**，走 paraformer 更合适
- **通义听悟**：新用户 100h 试用，用户之前明确排除（复杂/注册反感）
- **腾讯云极速版**：新用户 5h 试用
- **火山引擎**：新用户 20h 试用
- 共同问题：都要实名 + 试用完就付费，不符合"免费开源免注册"目标

---

## 对比矩阵

| 方案 | 延迟(45min音频) | 中文质量 | 稳定性 | 注册 | 推荐位置 |
|---|---|---|---|---|---|
| **BCUT**（基线） | 30-50s | 优 | 中（依赖 B 站） | 无 | primary |
| **JianYing** | 40-90s | 优 | 中（依赖第三方签名 + 剪映内部 API） | 无 | **fallback #1** |
| **SenseVoice 本地** | 3-8min（CPU） | 优 | 高（本地） | 无 | **fallback #2（离线兜底）** |
| **DashScope paraformer-v2** | 2-5min | 优 | 高 | 需实名 | 商业兜底 |
| B 站 AI 字幕 | 30min+ | 优 | 低 | 需账号 | 不推荐 |
| 讯飞 lfasr | 2-5min | 优 | 高 | 需实名 | 备胎 |

---

## 最终推荐（给客户展示的"K0 有几个选择"）

**三层 fallback 架构**：

1. **主力**：BCUT（已验证）
2. **fallback 1（同类免注册）**：JianYing ASR——podcast-bridge 已有完整实现，200 行 Node 翻写即可；BCUT 挂时自动切换
3. **fallback 2（离线终极兜底）**：SenseVoice-Small 本地跑——BCUT + JianYing 同时挂时可用（比如字节整体封 IP），代价是慢一个数量级（分钟级 vs 秒级）

**如果客户能接受一次性注册**：加第 4 层 DashScope paraformer-v2 作商业保底（100 万 tokens 免费试用足够跑几十小时音频）。

---

## 诚实标注

- **实读过代码**：JianYing 的端点、签名、上传流程（transcribe.py 1080-1286 行）
- **常识 + GLM 复核**：SenseVoice/paraformer/lfasr 的存在与大致定位
- **GLM 返回泛化**：具体免费额度（讯飞 500 次/天、DashScope 100 万 tokens）——GLM 未给出可引用的官方文档链接，需上官方开发者中心确认最新条款
- **纯猜测**：B 站 AI 字幕能否 API 化——**没找到任何逆向实例**，判定不可行
- **未实测**：SenseVoice 在实际 K0 后端（Windows/Node.js 环境）的部署难度；DashScope 音频→tokens 换算率
