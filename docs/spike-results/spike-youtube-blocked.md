# SPIKE-YOUTUBE 实测（2026-07-05）

**结论**：❌ 境内 backend 直连 YouTube timedtext API **全部失败**（5/5），符合 Sprint 1 SPIKE-001 早期结论。

**测试样本**（5 个热门视频）：
- 张小珺 x SpaceX 中文访谈
- Andrej Karpathy - Neural Nets: Zero to Hero
- Andrej Karpathy - Reproduce GPT-2
- Lex Fridman - Sam Altman 3
- 3Blue1Brown - Transformers

**错误**：`fetch failed`（DNS 无法解析或 SNI 阻断）

**解决路径（需用户决策）**：
1. **Cloudflare Workers 免费代理**：10 万请求/日免费。用户需注册 CF 账号 + 部署 Worker。境内运营商偶发污染 workers.dev 域名。
2. **阿里云香港 ECS**：¥30-40/月，稳定但要付费。
3. **iOS App 端开 VPN 直调**：不依赖 backend，但用户没开 VPN 就不能用。

**Sprint 5 决策**：YouTube 支持**不在 Sprint 5 交付范围**。列入 Sprint 6+ backlog，需要用户批准 CF Workers 或 ECS 部署。

**如果用户只关心中文播客生态（小宇宙 + Apple 中文），YouTube 可以先跳过不做**。
