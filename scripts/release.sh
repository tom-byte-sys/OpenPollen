#!/usr/bin/env bash
#
# OpenPollen 发布脚本
#
# 用法:
#   ./scripts/release.sh [patch|minor|major]   # 默认 patch
#
# 流程:
#   1. 检查工作区是否干净
#   2. 运行测试 + 类型检查
#   3. 版本号 +1
#   4. 构建 TypeScript + WebChat UI
#   5. 发布到 npm (官方 registry)
#   6. Git 提交 + 打 tag + 推送
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

NPM_REGISTRY="https://registry.npmjs.org"
BUMP="${1:-patch}"

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${CYAN}[info]${NC}  $*"; }
ok()    { echo -e "${GREEN}[ok]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[warn]${NC}  $*"; }
error() { echo -e "${RED}[error]${NC} $*"; exit 1; }

# ── 0. 参数校验 ──────────────────────────────────────
if [[ "$BUMP" != "patch" && "$BUMP" != "minor" && "$BUMP" != "major" ]]; then
  error "用法: $0 [patch|minor|major]，收到: $BUMP"
fi

# ── 1. 检查工作区 ────────────────────────────────────
info "检查 Git 工作区..."
if [[ -n "$(git status --porcelain)" ]]; then
  warn "工作区有未提交的更改:"
  git status --short
  echo ""
  read -rp "继续发布？(y/N) " confirm
  [[ "$confirm" == "y" || "$confirm" == "Y" ]] || exit 0
fi

# ── 2. 检查 npm 登录状态 ─────────────────────────────
info "检查 npm 登录状态..."
if ! npm whoami --registry "$NPM_REGISTRY" &>/dev/null; then
  error "未登录 npm，请先执行: npm login --registry $NPM_REGISTRY"
fi
NPM_USER=$(npm whoami --registry "$NPM_REGISTRY")
ok "已登录: $NPM_USER"

# ── 3. 运行测试 ──────────────────────────────────────
info "运行测试..."
npm test
ok "测试通过"

info "类型检查..."
npm run typecheck
ok "类型检查通过"

# ── 4. 版本号 +1 ─────────────────────────────────────
OLD_VERSION=$(node -p "require('./package.json').version")
npm version "$BUMP" --no-git-tag-version >/dev/null
NEW_VERSION=$(node -p "require('./package.json').version")
info "版本: $OLD_VERSION → $NEW_VERSION"

# ── 5. 构建 ──────────────────────────────────────────
info "构建 TypeScript..."
npm run build
ok "TypeScript 构建完成"

info "构建 WebChat UI..."
npm run build:ui
ok "WebChat UI 构建完成"

# ── 6. 发布到 npm ────────────────────────────────────
info "发布 openpollen@$NEW_VERSION 到 npm..."
npm publish --registry "$NPM_REGISTRY"
ok "npm 发布成功: openpollen@$NEW_VERSION"

# ── 7. Git 提交 + tag + 推送 ─────────────────────────
info "Git 提交版本号..."
git add package.json package-lock.json
git commit -m "$NEW_VERSION"
git tag "v$NEW_VERSION"

info "推送到远程..."
git push
git push --tags

ok "发布完成！"
echo ""
echo "  npm: https://www.npmjs.com/package/openpollen/v/$NEW_VERSION"
echo "  tag: v$NEW_VERSION"
