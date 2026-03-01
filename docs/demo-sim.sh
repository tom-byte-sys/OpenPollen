#!/usr/bin/env bash
# 模拟 OpenPollen 安装/初始化/启动的终端输出
# 仅供 VHS 录制使用

GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
DIM='\033[2m'
BOLD='\033[1m'
NC='\033[0m'

slow_type() {
  local text="$1"
  local delay="${2:-0.03}"
  for ((i=0; i<${#text}; i++)); do
    printf '%s' "${text:$i:1}"
    sleep "$delay"
  done
}

fake_prompt() {
  printf "${GREEN}~/my-agent${NC} ${CYAN}\$${NC} "
}

# ── 安装 ──
fake_prompt
slow_type "npm install -g openpollen"
echo ""
sleep 0.5
echo -e "${DIM}added 128 packages in 6s${NC}"
echo ""
echo -e "${GREEN}+${NC} openpollen@0.1.11"
echo -e "${DIM}added 1 package in 6s${NC}"
sleep 1

# ── 初始化 ──
echo ""
fake_prompt
slow_type "openpollen init"
echo ""
sleep 1

echo -e ""
echo -e "  ${BOLD}🐝 OpenPollen 初始化向导${NC}"
echo -e ""
sleep 0.5

echo -ne "  ? 选择 AI 模型提供商 › "
sleep 0.8
echo -e "${CYAN}Anthropic (Claude)${NC}"
sleep 0.5

echo -ne "  ? 输入 API Key › "
sleep 0.5
echo -e "${DIM}sk-ant-api03-****...****${NC}"
sleep 0.5

echo -ne "  ? 选择模型 › "
sleep 0.8
echo -e "${CYAN}claude-sonnet-4-20250514${NC}"
sleep 0.5

echo -ne "  ? 启用 WebChat › "
sleep 0.5
echo -e "${GREEN}Yes${NC}"
sleep 0.5

echo -ne "  ? 启用钉钉渠道 › "
sleep 0.5
echo -e "${GREEN}Yes${NC}"
sleep 1

echo -e ""
echo -e "  ${GREEN}✔${NC} 配置已保存到 ${BOLD}openpollen.json${NC}"
echo -e ""
sleep 1.5

# ── 启动 ──
fake_prompt
slow_type "openpollen start"
echo ""
sleep 1.5

echo -e ""
echo -e "  ${BOLD}🐝 OpenPollen v0.1.11${NC}"
echo -e ""
sleep 0.5

echo -e "  ${GREEN}✔${NC} Agent Runner 就绪 ${DIM}(claude-sonnet-4-20250514)${NC}"
sleep 0.4
echo -e "  ${GREEN}✔${NC} 技能已加载: ${CYAN}code-review${NC}, ${CYAN}data-analyst${NC}"
sleep 0.4
echo -e "  ${GREEN}✔${NC} 钉钉渠道已连接"
sleep 0.4
echo -e "  ${GREEN}✔${NC} WebChat 已启动"
sleep 0.5

echo -e ""
echo -e "  ${BOLD}🌐 WebChat UI${NC}  →  ${CYAN}http://localhost:18800/ui/${NC}"
echo -e "  ${BOLD}📡 API 网关${NC}    →  ${CYAN}http://localhost:18800${NC}"
echo -e ""
sleep 1

echo -e "  ${DIM}────────────────────────────────────────${NC}"
echo -e "  ${BOLD}支持渠道:${NC} 钉钉 · 飞书 · 企业微信 · Discord · Slack · Telegram · Email"
echo -e "  ${DIM}────────────────────────────────────────${NC}"
echo -e ""
sleep 1

echo -e "  ${YELLOW}💬 WebChat 对话示例:${NC}"
echo -e ""
sleep 0.5

echo -ne "  ${BOLD}You:${NC} "
slow_type "帮我写一个 Python 快速排序" 0.05
echo ""
sleep 1

echo -e "  ${BOLD}${CYAN}Agent:${NC} 好的，这是一个 Python 快速排序实现："
echo -e ""
sleep 0.3
echo -e "  ${DIM}def quicksort(arr):${NC}"
sleep 0.15
echo -e "  ${DIM}    if len(arr) <= 1: return arr${NC}"
sleep 0.15
echo -e "  ${DIM}    pivot = arr[len(arr) // 2]${NC}"
sleep 0.15
echo -e "  ${DIM}    left  = [x for x in arr if x < pivot]${NC}"
sleep 0.15
echo -e "  ${DIM}    mid   = [x for x in arr if x == pivot]${NC}"
sleep 0.15
echo -e "  ${DIM}    right = [x for x in arr if x > pivot]${NC}"
sleep 0.15
echo -e "  ${DIM}    return quicksort(left) + mid + quicksort(right)${NC}"
echo -e ""
sleep 3
