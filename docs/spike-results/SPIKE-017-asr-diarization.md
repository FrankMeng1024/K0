# SPIKE-017: ASR 云服务选型 — 说话人分离 + 免上传瓶颈

**日期**: 2026-07-12
**结论(2026-07-12 更新)**: **说话人分离/左右 chat 功能暂缓,不做。** 详见文末「最终决策」。
**背景**: 当前 BCUT(必剪) 云 ASR。实测 53min/52MB 播客总耗时 169.8s = 下载3.5s + **上传148.4s(87%)** + ASR 17.2s。瓶颈=整包上传到 B 站。BCUT 不返回说话人。
**问题**: 能否换云 ASR ①带说话人分离 ②不比现在慢 ③成本可接受?
**环境**: 阿里云 ECS 4核/1.9G可用/无GPU。禁自建模型,只能用云 API。

---

## 关键发现(决定性)

**三家云 ASR 全部支持"音频 URL 直传",不需要整包上传。** 只要给它一个公网可下载的 mp3 链接,ASR 服务器自己去拉音频。播客本身有公网 mp3 直链(小宇宙/Apple),因此 **148s 上传瓶颈可完全消除** —— 服务器甚至不必下载音频。这是本 Spike 最重要的结论,比"哪家 diarization 更好"更关键。

---

## 各候选对比表

| 维度 | 阿里云 通义听悟 | 腾讯云 录音文件识别 | 讯飞 语音转写 |
|---|---|---|---|
| **说话人分离** | ✅ `DiarizationEnabled=true` + `SpeakerCount`(0盲分/2固定) | ✅ `SpeakerDiarization=1` + `SpeakerNumber`(16k支持2-10) | ✅ `speaker_number=0-10`(0盲分),另有 `roleType` | 
| **URL 直传** | ✅ `Input.FileUrl` 直接传公网 URL | ✅ `SourceType=0` + `Url`(公网可下载, <5h/<1GB) | ⚠️ 标准转写需分片上传;但支持公网 URL 需确认,demo 均为分片上传 |
| **免费额度** | 有(新用户试用) | **录音文件识别 10h/月 永久免费** | 5h 一次性试用 |
| **价格(后付费)** | 录音文件识别约 ￥2.5/h(官网按量) | 约 **￥1.5–2.5/h**,资源包 60h/90元=1.5元/h | 按套餐,约 ￥2–3/h |
| **延迟(53min音频)** | 标准版≤3h(队列);极速版30min音频≤10s | **1h音频通常 1–3min 返回**(异步回调) | 30–60min→6–10min;>60min→10–20min |
| **迁移成本(→香港云)** | 若绑 OSS 内网中等;传公网 URL 则低 | 传公网 URL 低;COS 存储可选非必须 | 低(纯 HTTP API,无强绑定) |
| **同厂协同** | ✅ 服务器就是阿里云,同区免流量费 | 中 | 中 |

> 注:各家均按"识别成功音频时长"计费,与是否 diarization 无关(diarization 通常不额外加价,阿里云/腾讯云均如此)。价格为公开资料估算,签约前需以控制台实时报价为准。

---

## 成本估算(2h/天/用户)

按 2h/天 × 30天 = **60h/月/用户**:
- **腾讯云**:60h 资源包 90元/年,即约 **1.5元/h → 单用户满打满算约 90元/月**,且每月 10h 免费额度可覆盖轻度用户。**最划算**。
- **阿里云**:约 2.5元/h → 约 150元/月。
- **讯飞**:约 2–3元/h → 120–180元/月。

轻度用户(<10h/月)在腾讯云可能 **完全免费**(10h/月永久额度)。

---

## 免上传瓶颈可行性

**VIABLE。** 当前 170s 里 148s 是上传。改为传 URL 后:
- **理想路径**:播客有公网 mp3 直链 → 直接把 URL 交给腾讯云/阿里云 → 服务器完全不碰音频 → 总耗时 ≈ ASR 识别时间(腾讯云 1–3min)+ 我方轮询开销。**从 170s 降到约 60–180s 之间**,且服务器 CPU/内存/带宽压力清零(对 1.9G 内存机器是重大利好)。
- **退路**:少数播客链接有防盗链/需鉴权,ASR 拉不到。此时 fallback 到"服务器下载→上传阿里云 OSS(同区内网,秒级)→传 OSS URL",仍远快于上传 B 站。

---

## 迁移风险(未来换香港云)

- 传公网 URL 方案 **几乎无迁移成本**:ASR 只是一个 HTTP API,换服务器地理位置不影响。
- 唯一风险是若走"OSS 内网中转"退路,绑定了阿里云 OSS。**建议抽象一个 `ASRProvider` 接口**隔离:

```
interface ASRProvider {
  transcribe(audioUrl: string, opts: { diarization: boolean, speakerCount?: number })
    : Promise<{ segments: { start, end, text, speaker }[] }>
}
// 实现:TencentASR / AliASR / BcutASR(保留)
// 上层只依赖接口;换 provider = 换一个实现类,不动业务逻辑
```

音频获取也抽象成 `getAudioUrl(episode)`:优先返回原始公网 URL,拉不到才走"下载+上传OSS"退路。换云只需换退路里的存储实现。

---

## 备选:BCUT + GLM 启发式推断说话人

保留 BCUT,用 GLM-4 对已有转录文本按"你说/我觉得/主持人问/嘉宾"等对话线索按轮次分 A/B。

**评价**:
- **准确度天花板低且不可靠**。播客常是自然对话,一句话内无人称线索的段落很多;两人观点交叉、抢话、附和("对对对")时,纯文本无法判断谁在说。天花板大概 60–75% 轮次正确,且错误不可预测(不像 ASR 声学分离有物理依据)。
- **成本额外增加**(每篇多一次 GLM 长文本调用),却拿到更差的结果。
- **唯一价值**:零改造、纯文本、可离线兜底。但既然真正的声学 diarization 免费(腾讯云 10h/月)且能消除上传瓶颈,启发式方案**不推荐作为主路**。可作为"URL 拉不到 + 已有 BCUT 文本"时的降级展示,标注"说话人为推测"。

---

## 结论

**VIABLE(换 ASR 能更快 + 带 diarization + 成本可接受)。**

**推荐路径 = 路A:换腾讯云录音文件识别(传公网 URL + 开 SpeakerDiarization)**,理由:
1. 支持 URL 直传 → 消除 148s 上传瓶颈,同时给 1.9G 内存机器卸压(核心痛点);
2. diarization 明确支持(16k 中文 2–10 人),不额外加价;
3. 异步 1–3min 返回,比现在快;
4. 成本最低(1.5元/h + 10h/月永久免费);
5. 纯 HTTP API,迁香港云无痛。

阿里云作为**备选**(同区协同,若 URL 方案需 OSS 退路则它更顺);讯飞因 URL 直传不明确、延迟偏长,列末位。**不推荐** BCUT+GLM 启发式作主路。

**前置条件(VIABLE WITH CONDITIONS 的"conditions")**:
- 需先真机验证目标播客 mp3 直链是否可被腾讯云服务器公网拉取(防盗链风险);
- diarization 中文准确度需拿 K0 真实播客(2 人对谈)实测一集确认;
- 保留 BcutASR 实现作回退,通过 `ASRProvider` 接口切换。

---

## 关键调用伪代码(腾讯云,URL + diarization)

```python
# 1) 提交任务:直接传公网 URL,不上传音频
req = CreateRecTaskRequest()
req.EngineModelType = "16k_zh"        # 16k 中文普通话
req.ChannelNum      = 1               # 单声道(播客混音)
req.ResTextFormat   = 0               # 含分段时间戳
req.SourceType      = 0               # 0 = URL 来源(关键:免上传)
req.Url             = episode_public_mp3_url   # 播客公网直链
req.SpeakerDiarization = 1            # 开启说话人分离
req.SpeakerNumber      = 2            # 播客通常 2 人;0=盲分不定人数
resp = asr_client.CreateRecTask(req)  # 返回 TaskId,秒级

# 2) 轮询结果(或用 CallbackUrl 回调,免轮询)
while True:
    r = asr_client.DescribeTaskStatus(TaskId=resp.Data.TaskId)
    if r.Data.Status == 2:            # 2=成功
        break
    time.sleep(5)

# 3) 取带 speaker 的分段结果
# r.Data.ResultDetail[] 每段含: StartMs, EndMs, FinalSentence,
#   SpeakerId (说话人编号 → 映射为 A/B)
segments = [{
    "start": d.StartMs, "end": d.EndMs,
    "text": d.FinalSentence, "speaker": f"发言人{d.SpeakerId}"
} for d in r.Data.ResultDetail]
```

阿里云等价写法:`Input.FileUrl` + `Parameters.Transcription.DiarizationEnabled=true` + `Diarization.SpeakerCount=2`,轮询 `GetTaskResult` 取 `SpeakerId`。

---

## 最终决策(2026-07-12,Frank 拍板)—— 说话人分离/左右 chat **暂缓,不做**

功能目标本是"说话人分离 → 左右 chat 对话形式"。Frank 硬约束:①不能拖慢现有流程(最好加速)②控制成本。三条线索全部查实后否决:

### 1. 成本(按 Frank 真实用量重算)—— 不可接受
Frank 真实用量:1–2 用户 × ~10 篇/天 × 50–200min/篇(均值 125min ≈ 2.08h)= **~624h/月音频**。
- 腾讯云 1.5 元/h × 624h ≈ **~936 元/月**;阿里云 ~1560/月;讯飞 1248–1872/月。
- 免费额度(腾讯云 10h/月)在此量级可忽略。
- **Frank 明确:此成本无法接受。**

### 2. 免费替代方案调研 —— 不存在
子代理逐条查实(源码级):
- **BCUT(现用)**:逆向源码 `SocialSisterYi/bcut-asr/orm.py` 确认返回结构 `words[].label` 是逐**字**文本,**无任何说话人字段**。继续用 BCUT 拿不到 speaker。
- **通义听悟个人版**:唯一"接近免费 + 原生 diarization",但只有网页/小程序,**无稳定可编程 API**,企业版 OpenAPI 付费。
- **pyannote / FunASR 自建**:1.9G 无 GPU **跑不动 + OOM**,违反"禁自建模型"铁律。
- 结论:**免费 + 带 speaker + 满足 624h/月,三者无完美方案。**

### 3. GLM 从文本推断说话人 —— 实测偏乐观 + 拖慢流程(致命)
实测:取生产库真实 2 人访谈转录(transcript_id=3「对谈 AI 创业者魏小康」)前 80 段,调 GLM-5.2 推断 A(主持)/B(嘉宾):
- **准确率**:人称线索明确段(~62/80)GLM 几乎全对,仅 2 处边界错(段 27-30、47-49 附和后接话判错)。**访谈类轮次准确率估 ~85-90%,但偏乐观**——文本无线索的模糊段(~18/80,附和"嗯/对"、无主语陈述)无法人工核对,而这正是错误集中区。自然对谈类(抢话/平等聊天)会明显更差(55-70%)。
- **速度**:GLM 39s / 80 段 → 全篇 1491 段分批推断需 **+10-15min/篇**。**直接违反 Frank"不减速最好加速"硬约束。这是致命否决点。**
- 成本增量小(每篇多一次 GLM 长文本调用,几分钱),但拖慢不可接受。

### 结论
**暂缓,不做。** 保留 BCUT 免费转写现状(无 speaker)。若未来重启此功能,前置条件:①出现免费/极低成本的稳定 diarization API,或 ②服务器升级到可跑本地 diarization(有 GPU / 大内存),或 ③接受声学 diarization 付费成本。GLM 文本推断因拖慢流程,即使重启也不作主路。

> 注:上文「推荐路径 = 路A 换腾讯云」的技术可行性结论仍然成立(URL 直传确实能消除 148s 上传瓶颈),但**成本 936 元/月被否决**,故整体功能暂缓。若单独为"消除上传瓶颈 + 加速"(不要 diarization)重启,可另开 spike 评估——但那与本 spike 的 speaker 目标无关。

---

## 来源
- 阿里云通义听悟语音转写(DiarizationEnabled/SpeakerCount/FileUrl): https://help.aliyun.com/zh/tingwu/voice-transcription
- 阿里云录音文件识别(URL 直传,不支持本地文件): https://www.aliyun.com/sswb/471995_1.html
- 腾讯云录音文件识别请求 API(SourceType/Url/SpeakerDiarization/SpeakerNumber): https://cloud.tencent.com/document/product/1093/37823
- 腾讯云语音识别计费(录音文件识别 10h/月免费,资源包 60h/90元): https://cloud.tencent.com/document/product/1093/35686
- 腾讯云录音文件识别请求参数(话者分离 2-10 人,URL<5h/<1GB): https://cloud.tencent.com/developer/article/1679083
- 讯飞语音转写 API(speaker_number 0-10 盲分,分片上传): https://www.xfyun.cn/doc/asr/lfasr/API.html
- 讯飞实时转写(roleType 角色分离): https://www.xfyun.cn/doc/asr/rtasr/API.html
- 讯飞实时语音转写大模型(2025 角色分离升级): 讯飞开放平台 2025-09-19 公告
