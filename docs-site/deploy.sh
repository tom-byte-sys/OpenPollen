#!/bin/bash
set -euo pipefail

# HiveAgent 文档站部署脚本
# 用法: ./deploy.sh

REMOTE_USER="ubuntu"
REMOTE_HOST="154.8.151.54"
REMOTE_DIR="/var/www/hiveagent-docs"
SSH_KEY="$HOME/.ssh/id_ed25519_tencent"

echo "==> 安装依赖..."
npm ci

echo "==> 构建文档站..."
npm run build

echo "==> 部署到 ${REMOTE_HOST}:${REMOTE_DIR} ..."
rsync -avz --delete \
  -e "ssh -i ${SSH_KEY}" \
  .vitepress/dist/ \
  "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/"

echo "==> 部署完成!"
echo "    访问: https://agent.beebywork.com/docs/"
