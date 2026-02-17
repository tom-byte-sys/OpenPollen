#!/usr/bin/env bash
set -euo pipefail

# HiveAgent 产品落地页网站部署脚本
# 部署目标: 154.8.151.54 (ubuntu) -> /var/www/hiveagent/

REMOTE_HOST="154.8.151.54"
REMOTE_USER="ubuntu"
REMOTE_DIR="/var/www/hiveagent"
SSH_KEY="$HOME/.ssh/id_ed25519_tencent"
LOCAL_DIR="$(cd "$(dirname "$0")/../website" && pwd)"
SSH_OPTS="-i $SSH_KEY -o StrictHostKeyChecking=no"

# 颜色
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo "=========================================="
echo " HiveAgent 产品网站部署"
echo "=========================================="
echo ""

# 检查本地 website 目录
if [ ! -d "$LOCAL_DIR" ]; then
    echo -e "${RED}[错误] 找不到 website 目录: $LOCAL_DIR${NC}"
    exit 1
fi

echo -e "${YELLOW}本地目录:${NC} $LOCAL_DIR"
echo -e "${YELLOW}目标服务器:${NC} ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}"
echo ""

# 列出将要部署的文件
echo "[1/3] 待部署文件:"
ls -lh "$LOCAL_DIR"/*.html "$LOCAL_DIR"/*.css "$LOCAL_DIR"/*.js 2>/dev/null || true
ls -lh "$LOCAL_DIR"/*.ico "$LOCAL_DIR"/*.png "$LOCAL_DIR"/*.svg 2>/dev/null || true
echo ""

# 同步文件
echo "[2/3] 同步文件到服务器..."
rsync -avz --delete \
    -e "ssh $SSH_OPTS" \
    --exclude='.DS_Store' \
    --exclude='*.swp' \
    --exclude='.git' \
    "$LOCAL_DIR/" \
    "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/"
echo ""

# 验证
echo "[3/3] 验证部署..."
DEPLOYED_FILES=$(ssh $SSH_OPTS "${REMOTE_USER}@${REMOTE_HOST}" "ls -1 ${REMOTE_DIR}/ 2>/dev/null | wc -l")
echo -e "服务器文件数: ${GREEN}${DEPLOYED_FILES}${NC}"
ssh $SSH_OPTS "${REMOTE_USER}@${REMOTE_HOST}" "ls -lh ${REMOTE_DIR}/"

echo ""
echo "=========================================="
echo -e "${GREEN}[完成] 网站部署成功!${NC}"
echo "=========================================="
echo "访问地址: https://agent.beebywork.com/"
echo "市场页面: https://agent.beebywork.com/marketplace.html"
echo "=========================================="
