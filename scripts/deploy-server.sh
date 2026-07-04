#!/usr/bin/env bash
# K0 Production Deployment Script
# Run on server 122.51.174.118 as root or sudo user
# Usage: bash scripts/deploy-server.sh
#
# Prerequisites:
#   - docker + docker-compose installed
#   - nginx installed
#   - certbot installed (sudo apt install certbot python3-certbot-nginx)
#   - Domain api.k0.yiiling.cn already pointed to this server IP
#   - docker/.env.production filled with real secrets
#
# This script is IDEMPOTENT — safe to re-run.

set -euo pipefail

REPO_DIR="/home/ubuntu/k0"   # Adjust if different
DOCKER_DIR="$REPO_DIR/docker"

echo "=== K0 Deployment ==="
echo "Repo: $REPO_DIR"
echo ""

# 1. Ensure docker/.env.production exists
if [ ! -f "$DOCKER_DIR/.env.production" ]; then
  echo "ERROR: $DOCKER_DIR/.env.production missing."
  echo "       Copy .env.production.example → .env.production and fill secrets."
  exit 1
fi

# 2. Build + start k0 containers
echo "-> Building and starting k0 containers..."
cd "$DOCKER_DIR"
docker-compose pull k0-db 2>/dev/null || true  # Pull latest MySQL image
docker-compose build k0-backend
docker-compose up -d

echo "-> Waiting for k0-db to be healthy..."
for i in $(seq 1 30); do
  sleep 2
  if docker-compose exec -T k0-db mysqladmin ping -h localhost --silent 2>/dev/null; then
    echo "   k0-db healthy!"
    break
  fi
  if [ "$i" = "30" ]; then
    echo "ERROR: k0-db not healthy after 60s"
    docker-compose logs k0-db | tail -20
    exit 1
  fi
done

# 3. Run migrations
echo "-> Running database migrations..."
docker-compose exec -T k0-backend node scripts/migrate.js

# 4. Isolate: verify k0_user cannot access cairn DB
echo "-> Verifying DB isolation (k0_user should NOT access cairn)..."
ISOLATION_CHECK=$(docker-compose exec -T k0-db \
  mysql -u k0_user -p"$(grep DB_PASSWORD $DOCKER_DIR/.env.production | cut -d= -f2)" \
  -e "SELECT * FROM cairn.users LIMIT 1;" 2>&1 || true)
if echo "$ISOLATION_CHECK" | grep -q "Access denied"; then
  echo "   Isolation OK — k0_user cannot access cairn DB"
else
  echo "WARNING: Isolation check inconclusive. Check manually."
fi

# 5. Setup nginx
echo "-> Installing nginx config..."
cp "$DOCKER_DIR/nginx-k0.conf" /etc/nginx/sites-available/k0-api
ln -sf /etc/nginx/sites-available/k0-api /etc/nginx/sites-enabled/k0-api
nginx -t && systemctl reload nginx

# 6. SSL via certbot
echo "-> Requesting SSL cert for api.k0.yiiling.cn..."
certbot --nginx -d api.k0.yiiling.cn --non-interactive --agree-tos -m admin@yiiling.cn || \
  echo "WARNING: certbot failed — may need to run manually: certbot --nginx -d api.k0.yiiling.cn"

# 7. Health check
echo "-> Final health check..."
sleep 3
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" https://api.k0.yiiling.cn/health)
if [ "$HTTP_CODE" = "200" ]; then
  echo ""
  echo "=== DEPLOYMENT COMPLETE ==="
  curl -s https://api.k0.yiiling.cn/health
  echo ""
else
  echo "ERROR: https://api.k0.yiiling.cn/health returned HTTP $HTTP_CODE"
  docker-compose logs k0-backend | tail -30
  exit 1
fi

echo ""
echo "All done. Check https://www.ssllabs.com/ssltest/analyze.html?d=api.k0.yiiling.cn for SSL rating."
