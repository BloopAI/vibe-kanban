#!/usr/bin/env bash
# Vibe Kanban macOS launcher

LOG="/tmp/vibe-kanban.log"

# Build PATH from common Node.js install locations so npx is found
for d in \
  "$HOME/.nvm/versions/node/"*/bin \
  "$HOME/.volta/bin" \
  "/opt/homebrew/bin" \
  "/usr/local/bin" \
  "/usr/bin"; do
  [ -d "$d" ] && export PATH="$d:$PATH"
done

NPX=$(command -v npx 2>/dev/null)

if [ -z "$NPX" ]; then
  osascript -e 'display alert "Vibe Kanban" message "Could not find npx. Please make sure Node.js is installed."'
  exit 1
fi

# Reuse existing session if the server port is still listening
if [ -f "$LOG" ]; then
  PORT=$(grep -o 'Main server on :[0-9]*' "$LOG" 2>/dev/null | tail -1 | grep -o '[0-9]*$')
  if [ -n "$PORT" ] && nc -z 127.0.0.1 "$PORT" 2>/dev/null; then
    open "http://127.0.0.1:$PORT"
    exit 0
  fi
fi

# Start the server — it opens the browser on its own
rm -f "$LOG"
"$NPX" vibe-kanban >"$LOG" 2>&1 &
