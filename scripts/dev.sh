#!/bin/bash
# 双服务开发启动脚本
# 同时启动 VibeKanban 和 VibeMeeting 后端服务

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

# 获取端口配置
export FRONTEND_PORT=$(node scripts/setup-dev-environment.js frontend)
export BACKEND_PORT=$(node scripts/setup-dev-environment.js backend)
export MEETING_PORT=${MEETING_PORT:-8081}

# 配置 CORS
export VK_ALLOWED_ORIGINS="http://localhost:${FRONTEND_PORT}"
export VITE_VK_SHARED_API_BASE=${VK_SHARED_API_BASE:-}

echo "=========================================="
echo "启动双服务开发环境"
echo "=========================================="
echo "Frontend:       http://localhost:${FRONTEND_PORT}"
echo "Backend (VK):   http://localhost:${BACKEND_PORT}"
echo "Meeting:        http://localhost:${MEETING_PORT}"
echo "=========================================="

# 清理函数
cleanup() {
    echo ""
    echo "正在停止所有服务..."
    kill 0 2>/dev/null
    exit 0
}

trap cleanup SIGINT SIGTERM

# 启动 VibeKanban 后端
echo "启动 VibeKanban 后端..."
DISABLE_WORKTREE_CLEANUP=1 RUST_LOG=debug cargo run --bin server &
VK_PID=$!

# 启动 VibeMeeting 后端
echo "启动 VibeMeeting 后端..."
RUST_LOG=debug cargo run --bin meeting-server &
MEETING_PID=$!

# 启动前端
echo "启动前端..."
cd frontend && pnpm dev -- --port ${FRONTEND_PORT} --host &
FRONTEND_PID=$!

cd "$PROJECT_ROOT"

echo ""
echo "所有服务已启动，按 Ctrl+C 停止"

# 等待所有后台进程
wait
