# SPIKE-004: api.k0.yiiling.cn Docker + MySQL 独立部署

**Epic**: E-007 Foundation
**Sprint**: Sprint 1
**Points**: 3
**Owner**: Backend + DevOps
**Status**: Done

## Description
As Arch, I want to 在 122.51.174.118 服务器上，参考 Cairn 架构但重新设计地，起一个 `k0-backend` + `k0-db` 双 Docker service，通过 nginx 反代到 `https://api.k0.yiiling.cn`。

## Expected Result
- `docker/docker-compose.yml`（含 k0-backend + k0-db 服务）
- `docker/nginx-k0.conf`（可放到服务器 /etc/nginx/sites-available/）
- SSL：Let's Encrypt certbot 自动申请 `api.k0.yiiling.cn`
- MySQL 8 新建库 `k0`（生产）、`k0_dev`（开发）
- 数据库账号：新建 `k0_user`，密码存在 `.env`
- 权限：`GRANT ALL ON k0.* TO 'k0_user'@'%'`（隔离，不给 cairn 库权限）
- Backend 起来后 `curl https://api.k0.yiiling.cn/health` 返回 200
- `docs/spike-results/SPIKE-004.md` 记录：docker-compose.yml、nginx conf、certbot 命令、MySQL 命令、health 首次响应时间

## Acceptance Criteria
- [ ] `https://api.k0.yiiling.cn/health` 返回 200 < 200ms（含公网延迟）
- [ ] docker-compose 里 k0 service 与 cairn 独立（不同 network / 不同 volume）
- [ ] MySQL k0_user 无权访问 cairn 库（做 `SELECT * FROM cairn.users` 应报错）
- [ ] SSL A+ 评分（ssllabs.com）
- [ ] 完整 spike doc 含全部服务器操作命令（用户日后可复现）

## Dependencies
- 需要用户 SSH root 权限（用户已确认）

## Notes
- 参考 Cairn `docker/docker-compose.yml` + Cairn nginx 配置模式，但重新设计（不完全复制）
- 服务器 122.51.174.118 已有 Cairn 在跑，注意端口冲突（k0 backend 用 3002 而不是 Cairn 的 3001）
- 域名 `k0.yiiling.cn` 也预留（若未来做 web 版落地页/文档站）
