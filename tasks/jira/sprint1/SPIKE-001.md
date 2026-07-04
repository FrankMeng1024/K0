# SPIKE-001: YouTube 官方字幕抓取可行性

**Epic**: E-001 Import & Transcribe
**Sprint**: Sprint 1
**Points**: 3
**Owner**: Backend
**Status**: Done

## Description
As Arch, I want to verify `youtube-transcript` npm 包能否稳定抓取 5 集不同类型的 YouTube 播客字幕（中英文，在 Node 20 backend 上），so that Sprint 2 才能安全开发 M1 播客导入。

## Expected Result
`docs/spike-results/SPIKE-001.md` 存在，包含：
- 测试的 5 个 YouTube URL（3 英文 + 2 中文）
- 每次调用的 wall-clock 时间
- 字幕抓取成功率、语言识别准确率
- 遇到的限制（rate limit、无字幕情况）
- 结论：VIABLE / NOT VIABLE / VIABLE WITH CONDITIONS

## Acceptance Criteria
- [ ] 5 个 URL 中至少 4 个成功拿到完整字幕
- [ ] 中英文都覆盖
- [ ] 平均抓取时间 < 45 秒（TECH_SPEC 性能门）
- [ ] 输出 `docs/spike-results/SPIKE-001.md` 含实测命令 + 输出
- [ ] 明确列出 fallback 策略

## Notes
如 `youtube-transcript` 不稳定，Fallback：`yt-dlp` 命令行调用。
