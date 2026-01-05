#!/bin/bash
# simple dev environment startup script

cd "$(dirname "$0")"

# production data location (XDG standard)
PROD_DATA_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/vibe-kanban"
DEV_ASSETS_DIR="./dev_assets"

# set up symlinks to share data between dev and production builds
setup_symlinks() {
    mkdir -p "$PROD_DATA_DIR"
    mkdir -p "$DEV_ASSETS_DIR"

    # config.json symlink
    if [ ! -L "$DEV_ASSETS_DIR/config.json" ]; then
        # create prod config if it doesn't exist
        [ ! -f "$PROD_DATA_DIR/config.json" ] && echo '{}' > "$PROD_DATA_DIR/config.json"
        rm -f "$DEV_ASSETS_DIR/config.json"
        ln -s "$PROD_DATA_DIR/config.json" "$DEV_ASSETS_DIR/config.json"
        echo "Created symlink: dev_assets/config.json -> $PROD_DATA_DIR/config.json"
    fi

    # db.sqlite symlink
    if [ ! -L "$DEV_ASSETS_DIR/db.sqlite" ]; then
        rm -f "$DEV_ASSETS_DIR/db.sqlite"
        ln -s "$PROD_DATA_DIR/db.sqlite" "$DEV_ASSETS_DIR/db.sqlite"
        echo "Created symlink: dev_assets/db.sqlite -> $PROD_DATA_DIR/db.sqlite"
    fi
}

setup_symlinks

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
