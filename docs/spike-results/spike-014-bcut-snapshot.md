# SPIKE-014 快照：BCUT 免费 ASR (2026-07-05)

**状态**：VIABLE，但不满足于此，继续探索其他方案

## 实测数据（3/3 通过）

| 样本 | CDN | 大小 | 时长 | 总耗时 | Upload | ASR | Segments |
|---|---|---|---|---|---|---|---|
| 硬地骇客 EP127 | media.xyzcdn.net | 47.3 MB | 51 min | **28.4s** | 8.7s | 18.4s | 1432 |
| 跨国串门儿 #586 | media.xyzcdn.net | 91.4 MB | 99 min | **48.5s** | 17.6s | 30.5s | 2621 |
| 声东击西 #395 | aphid.fireside.fm | 57.6 MB | 62 min | **37.3s** | 13.2s | 23.8s | 1744 |

## 优点
- ✅ 完全免费、无 API key、免登录、境内直连
- ✅ 30-50 秒转 45-99 分钟音频
- ✅ 带 segment timestamp（每 ~2 秒粒度）
- ✅ 中文识别质量高
- ✅ 跨 CDN 通用（小宇宙、fireside.fm 都 OK）

## 已知隐患
- ⚠️ **逆向端点，非官方 API**：B 站随时可能封禁、改接口、加签名
- ⚠️ **单点故障**：如果 BCUT 挂了 K0 就废了（必须有 fallback）
- ⚠️ **依赖上传**：60MB 音频每次要上传到 B 站服务器（backend 带宽 + 用户等待时间）
- ⚠️ **未测容量限制**：连续 100 次调用会不会 rate limit / IP ban 未知
- ⚠️ **未测超长音频**：>3 小时的音频（如 Lex Fridman 那种）会不会挂未知

## 需要探索的替代/补充方案
1. **剪映（jianying）逆向端点**：podcast-bridge 也实现了，可作为 fallback
2. **B 站 AI 字幕**：B 站视频自带字幕生成，是否有独立 endpoint
3. **通义千问 audio 版**：qwen-audio 是否免费额度覆盖
4. **PaddleSpeech / SenseVoice / Paraformer**：阿里/百度开源模型
5. **腾讯云 ASR 极速版**：新用户 5h 试用 + 同机房低延迟
6. **飞书妙记免费额度**：字节 ByteDance 类
7. **HuggingFace 上的中文 whisper 精调模型**（belle-whisper、erax-ai）
