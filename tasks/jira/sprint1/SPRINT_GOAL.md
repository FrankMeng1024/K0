# Sprint 1 Goal（CR-001 应用后重写；SPIKE-006 已推至 Sprint 2）

**Sprint**: 1（Spike Sprint）
**Duration**: 计划 4-6 天
**Goal**: 5 个 Spike 全部 VIABLE + Expo App 骨架跑通 + Backend 云上部署 + Playwright web 测试链路验证

---

## Success Metrics

- SPIKE-001~005 全部产出 `docs/spike-results/SPIKE-NNN.md`，结论 VIABLE
- `bash scripts/start-web.sh` 起 `expo --web` 后 Playwright 可访问首页
- `bash scripts/start-backend.sh` 后 `curl http://localhost:3002/health` 返回 200 < 100ms
- 生产 backend `https://api.k0.yiiling.cn/health` 部署完成并返回 200
- iOS App 首页 3 入口在 react-native-web 上（375×667 + 393×852）都渲染正确
- SPIKE-006 已延期至 Sprint 2（用户 2026-07-04 授权：先保功能本地跑通再做 iOS 打包）

## CR 承接
- **CR-001**（2026-07-04）平台变更 Web → iOS RN+Expo：已在本 Sprint 全面落地

## Definition of Done（Sprint 级别）
- [ ] 5 Spike 结果全部 VIABLE（SPIKE-001~005）
- [ ] Backend `/health` < 100ms（本地 + 生产）
- [ ] Expo web 版首页 3 入口在 375×667 和 393×852 都可访问
- [ ] Arch subagent 代码 review = PASS
- [ ] UX subagent 首次交互检查完成
- [ ] QA subagent verdict = PASS（用 Playwright 测 react-native-web）
- [ ] 无未修复 Blocker/Critical bug
- [ ] 首次 git commit 完成

## Stories in this Sprint

| ID | 类型 | 主题 |
|----|------|------|
| SPIKE-001 | Spike | YouTube 官方字幕抓取（Node backend） |
| SPIKE-002 | Spike | Apple/Spotify RSS 抓取 |
| SPIKE-003 | Spike | GLM-4-plus 结构化 JSON 端到端 |
| SPIKE-004 | Spike | api.k0.yiiling.cn Docker + MySQL 独立部署 |
| SPIKE-005 | Spike | react-native-web + Playwright 集成可行性（Done） |
| STORY-00001 | Foundation | Expo 项目骨架 + 4 字体加载 + Home 空壳 |
| STORY-00002 | Foundation | Backend 骨架（Express+mysql2）+ auth middleware + user_id 预留 |
| STORY-00003 | Foundation | RN 3 入口首页（风格 F 移植 —— 更细致抽象） |

## Sprint 1 Trade-offs（Arch）
1. **Spike 只做可行性，不做产品化**
2. **STORY-00003 用 mock 数据**：不接 backend，验证视觉还原度
3. **无 CI/CD**：EAS 云构建本身是 CI，暂不加 GitHub Actions
4. **backend 参考 Cairn 但重新设计**：不复制 Cairn 全部代码，只借鉴架构模式（Express 5、mysql2 连接池、helmet+cors+rate-limit 中间件三件套、docker-compose 布局、nginx 站点配置模式）
