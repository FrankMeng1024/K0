# Errors Log — K0

**Purpose**: 记录 Sprint 期间的自动化操作失败（尤其 push 失败等）。SM 每个 Sprint 末检视。

---

## 2026-07-04 — Sprint 0 首次 push 失败

**Trigger**: 首次 commit `d8929a9` 后 `git push -u origin main`
**Error**: `fatal: unable to access 'https://github.com/FrankMeng1024/K0.git/': Recv failure: Connection was reset`
**Root cause**: 企业网络策略阻断 GitHub HTTPS 连接
**Action taken**: 遵循 TECH_SPEC §git push failure handling —— commit 保留在本地，下次 trigger point 重试
**Retry attempts**: 0

**待用户处置**:
- 如企业网络长期无法访问 GitHub：改用 SSH URL + 配置代理，或换 Gitee/CodeUp 等国内镜像
- 或用户手动 `git push` 从个人网络推送

---

## 2026-07-05 — SPIKE-004 生产部署待用户 SSH

**Trigger**: SPIKE-004 本地 artifacts 全部创建完毕，需 SSH 到 122.51.174.118 执行部署
**Error**: 本地无 SSH 访问权限 + 本地无 Docker CLI（Windows 无 Docker Desktop）
**Root cause**: 网络/环境限制，非代码问题
**Action taken**:
- 创建所有产出物：`docker/docker-compose.yml`，`docker/nginx-k0.conf`，`docker/.env.production.example`，`scripts/deploy-server.sh`
- backend 本地 /health 已验证 200 < 100ms
**Retry attempts**: 0

**待用户处置**（用户回来后约 10 分钟完成）:
1. `cp docker/.env.production.example docker/.env.production` 并填入：DB_PASSWORD、JWT_SECRET（`openssl rand -base64 32`）、GLM_API_KEY
2. 确认服务器已有 docker + certbot（Cairn 部署时应已安装）
3. 确认 DNS：api.k0.yiiling.cn A → 122.51.174.118
4. `bash scripts/deploy-server.sh`

---
2026-07-05 push failure — commit aba9d84 stays local; retry at next trigger. Error: Recv failure: Connection was reset (network reset)
2026-07-05 push failure again — commits aba9d84 + 90f3e9f stay local; retry needed.
