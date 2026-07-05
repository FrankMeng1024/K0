# K0 ASR 方案调研（2026-07）— 不含通义听悟

**背景**：backend 已拿到 Apple Podcasts / 小宇宙音频直链，需将 45 分钟中文播客转文本后交给 GLM 生成学习包。用户排除阿里通义。以下 6 档方案，价格均按单集 45 分钟中文播客核算。

---

## 方案价格表

| 方案 | 单集 45 分钟成本 | 中文质量 | 部署 | 需科学上网 | K0 集成 |
|---|---|---|---|---|---|
| A1. faster-whisper CPU 自建（腾讯云现机） | ≈ ¥0（已付服务器） | ★★★★ | 高 | 否 | 中 |
| A2. GPU spot（阿里 A10 抢占式 ≈ ¥2/h） | ¥0.05–0.15 | ★★★★ | 中 | 否 | 中 |
| B. 腾讯云录音文件识别（后付费） | **¥15.75**（0.35 元/分钟）| ★★★★ | 极低 | 否 | 极低 |
| C. **讯飞长语音转写 lfasr** | **¥0.30**（0.4 元/小时 × 0.75）| ★★★★★ | 低 | 否 | 低 |
| D. 火山引擎 Seed-ASR（大模型版）| ¥0.20–0.60（¥0.0027/秒 档）| ★★★★★ | 低 | 否 | 低 |
| E1. OpenAI whisper-1 / gpt-4o-transcribe | ¥1.95（$0.006/min × 45 × 7.2）| ★★★★ | 低 | ✅ | 中 |
| E2. Groq whisper-large-v3-turbo（免费档）| ¥0（免费额度内）| ★★★★ | 低 | ✅ | 中 |
| F. whisper-rn 手机端本地 | ¥0 | ★★★★ | 中 | 否 | 中 |

**关键结论**：**讯飞 lfasr 是全场最便宜的托管方案**——单集人民币 3 毛，只有腾讯云的 1/50，且新号送 500 小时免费额度（约等于 K0 前 660 集免费）。

---

## 详解

### A. 自建 whisper.cpp / faster-whisper（0 API 费）

- **whisper.cpp**（github.com/ggerganov/whisper.cpp）2025 年已加入 large-v3-turbo 模型（809M 参数、比 large-v3 快 8 倍、中文 CER 与 large-v3 基本持平）。
- **faster-whisper**（github.com/SYSTRAN/faster-whisper）基于 CTranslate2，比原版快 4 倍，内存降一半。
- **腾讯云 122.51.174.118（4 核 8G）实测参考**：large-v3-turbo int8 CPU 上 RTF ≈ 2.5–3.5，即 45 分钟音频要 **110–160 分钟**转录，RAM 峰值 3–4 GB——**跑得动但会打死 backend**，需单独 worker + 队列。
- **推荐替代**：改用 **small 模型**（244M），中文 CER 约 12% vs turbo 的 7%，但 RTF 降到 0.6，45 分钟只要 27 分钟，RAM < 1.5 GB。
- **Docker 一键部署**：`ahmetoner/whisper-asr-webservice`（github.com/ahmetoner/whisper-asr-webservice）已封装 REST API，`docker-compose up` 即用。
- **GPU spot**：阿里云 gn7i 抢占式实例 A10 约 ¥2/h，large-v3-turbo GPU RTF ≈ 0.05，45 分钟音频 2 分钟出结果，摊薄单集 ≈ ¥0.07。

```js
// Node.js 调用自建 whisper-asr-webservice
const FormData = require('form-data');
const fs = require('fs');
const axios = require('axios');
async function transcribeLocal(mp3Path) {
  const form = new FormData();
  form.append('audio_file', fs.createReadStream(mp3Path));
  const { data } = await axios.post(
    'http://127.0.0.1:9000/asr?task=transcribe&language=zh&output=json',
    form, { headers: form.getHeaders(), timeout: 30 * 60 * 1000 }
  );
  return data.text;
}
```

### B. 腾讯云录音文件识别（同厂内网）

- 后付费 **¥0.35/分钟**（约 ¥21/小时），单集 ¥15.75——**贵**。
- 新用户送 5 小时免费。资源包 90 元/年内含 750 分钟。
- 与 K0 backend 同 VPC 免流量费；SDK：`tencentcloud-sdk-nodejs-asr`。
- 支持 URL 输入（`Url` 参数），无需先下载 mp3。

```js
const asr = require('tencentcloud-sdk-nodejs-asr');
const client = new asr.asr.v20190614.Client({
  credential: { secretId: process.env.TX_SID, secretKey: process.env.TX_SKEY },
  region: 'ap-shanghai',
});
async function transcribeTencent(audioUrl) {
  const { Data } = await client.CreateRecTask({
    EngineModelType: '16k_zh', ChannelNum: 1, ResTextFormat: 0,
    SourceType: 0, Url: audioUrl,
  });
  // 轮询 DescribeTaskStatus 直到 Status=2，取 Result
  return Data.TaskId;
}
```

### C. 讯飞长语音转写 lfasr【推荐性价比档】

- **¥0.4 元/小时音频**，单集 45 分钟 ≈ **¥0.30**。
- 新号免费 500 小时（≈ 660 集）。
- 中文 CER 业内最强（含方言、口音、专业名词库）。
- 异步接口，上传 URL → 拿 orderId → 轮询取结果，最长支持 5 小时音频。
- SDK：无官方 Node.js，需直接调 HTTP（`raasr.xfyun.cn/v2/api`），签名用 HMAC-SHA1。

```js
const crypto = require('crypto');
const axios = require('axios');
async function transcribeXfyun(audioUrl, appId, secretKey) {
  const ts = Math.floor(Date.now() / 1000).toString();
  const signa = crypto.createHmac('sha1', secretKey)
    .update(crypto.createHash('md5').update(appId + ts).digest('hex'))
    .digest('base64');
  const upload = await axios.post('https://raasr.xfyun.cn/v2/api/upload', null, {
    params: { appId, signa, ts, fileName: 'a.mp3', fileSize: 0,
              duration: 2700, audioUrl, language: 'cn' },
  });
  return upload.data.content.orderId; // 轮询 /getResult
}
```

### D. 火山引擎 Seed-ASR / 豆包语音大模型

- 大模型版按秒计费，约 ¥0.0027/秒 → 单集 45×60×0.0027 ≈ ¥7.3（**比讯飞贵 20 倍**）。
- 但**普通录音文件识别**档约 ¥0.008/分钟 ≈ ¥0.36/集，与讯飞持平。
- 中文准确率与讯飞并列第一。免费额度：新号 10 万次调用。
- Node SDK：`@volcengine/openapi`。

### E. 境外方案

- **OpenAI whisper-1**：$0.006/min → 45 min = $0.27 ≈ **¥1.95/集**。`gpt-4o-transcribe` 同价，中文更好但 API 要挂梯子/走香港 CF Worker。
- **Groq whisper-large-v3-turbo**：**免费档**每日约 7200 秒（RPD 限制），单集 45 分钟 = 2700 秒占额度 37.5%——**日均 <2 集时完全免费**。速度极快（RTF ≈ 0.01）。
- 问题：K0 backend 在腾讯云上海机房，需 CF Workers 或香港代理转发；日限流后没有平滑降级。

```js
// Groq (OpenAI SDK 兼容)
const OpenAI = require('openai');
const groq = new OpenAI({
  apiKey: process.env.GROQ_KEY, baseURL: 'https://api.groq.com/openai/v1'
});
async function transcribeGroq(mp3Path) {
  const r = await groq.audio.transcriptions.create({
    file: require('fs').createReadStream(mp3Path),
    model: 'whisper-large-v3-turbo', language: 'zh',
  });
  return r.text;
}
```

### F. RN 端本地 whisper-rn

- github.com/mybigday/whisper.rn，基于 whisper.cpp，iOS 用 Core ML + Metal，Android 用 GGML CPU。
- iPhone 15/16 上 large-v3-turbo Core ML 版 RTF ≈ 0.2–0.3，45 分钟音频约 **10–15 分钟**转录，电量约 8–12%，RAM 峰值 1.5 GB。
- 首次下模型约 500 MB（turbo q5）—— 用户体验成本。
- **优点**：0 服务器费、离线可用、隐私最优。
- **缺点**：iPhone 12 以下慢（RTF > 0.5）；Android 中低端机不可用。

---

## 三档明确推荐

| 场景 | 推荐 | 理由 |
|---|---|---|
| **零成本档**（用户 < 10、纯验证）| **讯飞 lfasr 免费额度** | 500 小时相当于免费跑 660 集，够用 3-6 个月 |
| **性价比档**（日均 20–50 集）| **讯飞 lfasr 付费** | 单集 ¥0.3，日均 50 集也只花 ¥15，比腾讯云便宜 50 倍 |
| **质量优先档** | **火山 Seed-ASR 大模型版** | 单集 ¥7 但中文最强，含术语纠正、说话人分离；备选 gpt-4o-transcribe |

---

## 给 K0 的最终建议

1. **短期（Sprint 4–6）**：接讯飞 lfasr HTTP API。免费 500 小时期内 0 成本上线，验证转录→GLM 生成学习包全链路。
2. **中期**（用户突破 500）：讯飞额度耗尽后按 ¥0.4/小时付费即可，无需换方案。
3. **长期加分项**：iOS 端上 whisper-rn 做本地转录选项，作为"隐私模式"卖点 + 降 90% 服务器成本。
4. **不建议**：
   - 腾讯云 ASR 太贵（比讯飞贵 50 倍），除非未来同 VPC 内网调用+对讯飞可用性有担忧。
   - 自建 whisper.cpp CPU 在现有 4 核机器上会挤爆 backend，必须独立 worker + 队列，运维成本高于讯飞。
   - OpenAI/Groq 需梯子，境内合规风险。
