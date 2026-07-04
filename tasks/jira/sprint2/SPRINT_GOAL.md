# Sprint 2 Goal

**Sprint**: 2
**Duration**: 5-7 天
**Goal**: 用户可以在 Learn 屏幕粘贴一条 Apple Podcasts 链接或任意文本，看到系统在 5 秒内抓取到播客元数据（标题、频道、时长、封面）或识别文本语言，并把它保存为一集"待学习"记录。

---

## Success Metrics
- 用户在 Learn 屏幕粘贴 Apple Podcasts URL，5 秒内看到 title/channel/duration/cover 卡片
- 用户在 Learn 屏幕粘贴任意 ≥ 200 字文本，2 秒内看到语言识别结果 + 保存按钮
- `POST /api/episodes/import` 覆盖 Apple / text 两种 source，YouTube 返回 `YOUTUBE_MANUAL_ONLY`，Spotify 返回 `SOURCE_NOT_SUPPORTED`
- Sprint 1 carry-forward 三件套（AUTH prod guard / 错误 envelope / API_SPEC rate-limit doc）全部合入
- Home 首屏 375×667 可见 2 张入口卡（M2 修复）
- Review / Library stub 文案替换为"即将上线"（M3 修复）
- 所有新接口都有 401/403 negative-path 测试（Arch M2 修复）

## CR 承接
- 无新 CR。Sprint 1 carry-forward 通过 STORY-00090/00091 关闭。

## Definition of Done（Sprint 级别）
- [ ] 6 Story 全部 Done（SPIKE-006 credential-dependent，allowed blocked）
- [ ] `POST /api/episodes/import` E2E：Playwright web 版 paste Apple URL → 看到 card
- [ ] Backend 单元测试覆盖 auth 中间件 401 negative path
- [ ] Arch subagent review = PASS
- [ ] UX subagent 验证 M2/M3/M4 已修复 = PASS
- [ ] QA subagent verdict = PASS
- [ ] 无未修复 Blocker/Critical bug
- [ ] 每 Story Done 后 git commit（Strategy A）

## Stories in this Sprint

| ID | 类型 | 主题 | Points | Owner |
|----|------|------|--------|-------|
| STORY-00090 | Tech debt | Sprint 1 carry-forward: AUTH prod guard + error envelope + API_SPEC docs | 3 | Backend + Arch |
| STORY-00091 | UX polish | Home M2 密度 + Stub M3 文案 + Tag M4 语义 | 2 | Frontend + UX |
| STORY-00011 | Feature (E-001) | Apple Podcasts URL 元数据抓取 backend | 5 | Backend |
| STORY-00010 | Feature (E-001) | Learn 屏幕：粘贴 URL/文本 → 结果卡片（前后端联调） | 5 | Frontend + Backend |
| STORY-00013 | Feature (E-001) | 语言自动识别 + episode 记录持久化 | 3 | Backend |
| STORY-00020 | Feature (E-002) | GLM 生成学习快照（一句话 + 3 观点 + 价值分） | 5 | Backend |
| SPIKE-006 | Spike | EAS Build → TestFlight（credential-dependent，可能 blocked） | 3 | DevOps + Frontend |

**Total**: 26 points

## Sprint 2 Trade-offs（Arch 已 log）
1. STT 延后 —— Apple audio Whisper 转录不在 Sprint 2；元数据抓取后 `import_status='ready_meta_only'`
2. Spotify 显式不支持 —— 返回 `SOURCE_NOT_SUPPORTED`
3. YouTube fallback → text-paste，返回 `YOUTUBE_MANUAL_ONLY`
4. STORY-00020 排最后，可能 push Sprint 3
5. 无 Jobs queue，GLM 同步调用
6. auth middleware error 格式统一是 breaking change，同步更新测试
7. UX M1（bilingual hero）延后 Sprint 3 —— 不阻塞用户价值
8. SPIKE-006 credential-dependent；不阻塞 Sprint 2 DoD

## 已知风险
- SPIKE-006 依赖用户 Apple Developer 凭证 + App Store Connect 手动建 App，用户睡眠中 → 大概率 blocked，SM 已在 errors.md 记录
- SPIKE-004 生产 backend 部署仍待用户 SSH（Sprint 1 carry）；Sprint 2 开发用本地 backend 即可，不阻塞
