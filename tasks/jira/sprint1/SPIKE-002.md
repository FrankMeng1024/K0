# SPIKE-002: Apple Podcasts / Spotify RSS 抓取可行性

**Epic**: E-001 Import & Transcribe
**Sprint**: Sprint 1
**Points**: 3
**Owner**: Backend
**Status**: Todo

## Description
As Arch, I want to verify 从 Apple Podcasts / Spotify 单集 URL 抓取元数据 + 转录源的可行性（Node backend 上）。

## Expected Result
`docs/spike-results/SPIKE-002.md` 包含：
- Apple 单集 URL → 元数据 + 是否有 auto transcript
- Spotify 单集 URL → 元数据（Open Graph）+ 转录源（大概率无）
- 结论 + fallback 建议

## Acceptance Criteria
- [ ] 至少 2 个 Apple + 2 个 Spotify URL 测试
- [ ] 抓到元数据：标题、时长、发布日期、频道、封面 URL
- [ ] 明确说明"能否拿到转录/字幕"
- [ ] Spotify 若无转录，说明是否引导用户到 YouTube 或跳过
- [ ] `docs/spike-results/SPIKE-002.md` 完整
