#!/bin/bash
# simple dev environment startup script

cd "$(dirname "$0")"

# kill any existing dev processes on common ports
pkill -f "cargo.*run.*server" 2>/dev/null
pkill -f "vite.*--port" 2>/dev/null

# set up environment
export DISABLE_WORKTREE_ORPHAN_CLEANUP=1
export RUST_LOG=debug

# start backend
cargo watch -w crates -x 'run --bin server' &
BACKEND_PID=$!

# start frontend
cd frontend
pnpm run dev -- --host &
FRONTEND_PID=$!

cd ..

echo ""
echo "Dev environment starting..."
echo "  Backend PID:  $BACKEND_PID"
echo "  Frontend PID: $FRONTEND_PID"
echo ""
echo "Press Ctrl+C to stop both servers"

# trap ctrl+c to kill both processes
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM

# wait for either to exit
wait
