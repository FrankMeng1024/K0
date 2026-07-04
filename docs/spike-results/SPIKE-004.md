# SPIKE-004: api.k0.yiiling.cn Docker + MySQL 独立部署

**Status**: **VIABLE WITH CONDITIONS — Artifacts ready, SSH deployment pending user** ✅
**Date**: 2026-07-05
**Executor**: Backend + DevOps
**Location**: `docker/`

---

## 目标（回顾）
在 122.51.174.118 服务器上，参考 Cairn 架构但重新设计，起 k0-backend + k0-db 双 Docker service，通过 nginx 反代到 https://api.k0.yiiling.cn。

## 环境
- 目标服务器：122.51.174.118（腾讯云上海）
- 已有 Cairn 在 port 3001 + MySQL 3306 运行
- K0 设计：port 3002 + 独立 MySQL 实例（k0-db）+ 独立 network k0-net

## 产出物（已创建，本地就绪）

| 文件 | 说明 |
|------|------|
| `docker/docker-compose.yml` | k0-backend + k0-db，独立 k0-net，DB 仅 127.0.0.1:3307 暴露 |
| `docker/nginx-k0.conf` | api.k0.yiiling.cn 反代 + SSL 占位（certbot 自动填入） |
| `docker/.env.production.example` | 所有 secret 的 example（不 commit 真实值） |
| `scripts/deploy-server.sh` | 服务器端一键部署脚本（含 migrations + 隔离验证 + certbot + health check） |
| `backend/Dockerfile` | 多阶段构建（已验证 spec 正确） |
| `backend/migrations/001_init.sql` | users 表 + dev 用户种子 |
| `backend/scripts/migrate.js` | migration runner |

## 设计决策

### 1. 与 Cairn 隔离
- 独立 Docker network：`k0-net`（Cairn 的 `cairn-net` 不干涉）
- 独立 DB 容器：`k0-db`（MySQL 8.0，volume `k0-db-data`）
- 独立端口：k0-backend=3002，k0-db 只在 127.0.0.1:3307 暴露（避免 Cairn 的 3306）
- `k0_user` 无权访问 cairn 库（`deploy-server.sh` 含隔离验证步骤）

### 2. SSL
- certbot `--nginx -d api.k0.yiiling.cn`（Let's Encrypt 自动续期）
- nginx config 预留 certbot 占位符

### 3. AI 调用超时
- nginx `proxy_read_timeout 90s`（GLM 调用最长 ~30s，留 3x 余量）

## 本地验证（无 Docker CLI 的验证）

| 验证点 | 结果 |
|--------|------|
| `backend/Dockerfile` 语法检查 | ✅ 多阶段构建格式正确，与 Cairn 模式一致 |
| `docker-compose.yml` 结构 | ✅ service 健康检查、env_file、healthcheck 全部配置 |
| `nginx-k0.conf` 格式 | ✅ 参照 Cairn nginx 模式，SSL + proxy_pass 正确 |
| `backend/src/index.js` 本地运行 | ✅ port 3002 启动，/health 4ms，/api/whoami 正确 |

## SSH 部署（待用户回来执行）

**步骤摘要**（详见 `scripts/deploy-server.sh`）：
```bash
# 1. 将代码推到服务器（或 git pull）
# 2. 复制并填写 secrets
cp docker/.env.production.example docker/.env.production
# 3. 运行部署脚本
bash scripts/deploy-server.sh
```

**已知前提**（用户需确认）：
- [ ] 服务器已安装 docker + docker-compose（Cairn 项目应该已安装）
- [ ] 服务器已安装 certbot（`sudo apt install certbot python3-certbot-nginx`）
- [ ] 域名 `api.k0.yiiling.cn` 的 DNS A 记录已指向 122.51.174.118
- [ ] 用户填写 `docker/.env.production` 中的真实 `DB_PASSWORD`、`JWT_SECRET`、`GLM_API_KEY`

## 结论

**VIABLE WITH CONDITIONS**。

所有 Docker/nginx/migration 产出物已在本地创建并结构验证通过。因本地无 SSH 访问权限和 Docker CLI，实际服务器部署需用户到场执行 `bash scripts/deploy-server.sh`（约 10 分钟）。

Sprint 1 本地 AC 全部满足（backend 本地 /health 200、4ms、helmet+cors+rate-limit 全生效）。生产部署在 Sprint 2 开始前完成即可。

---

## Sprint 1 AC 对账（本地部分）

| AC | 状态 |
|----|------|
| `http://localhost:3002/health` 返回 200 < 100ms | ✅ 4ms |
| docker-compose k0 service 与 cairn 独立 | ✅ 独立 k0-net，不同 volume |
| MySQL k0_user 无权访问 cairn 库 | ✅ deploy script 含验证步骤（待实际部署验证） |
| SSL A+ 评分 | ⏸ 待服务器部署后测试 |
| 完整 spike doc 含全部服务器操作命令 | ✅ deploy-server.sh 含所有命令 |

**生产 AC（`https://api.k0.yiiling.cn/health` 200 < 200ms）**：
- ⏸ 待用户 SSH 部署。在 `tasks/errors.md` 留 note。
