---
name: start-app
description: Start the Vibe Kanban development server with database migrations. Use when asked to "start the app", "run the app", "start dev server", "launch the application", or "start development".
---

# Start App

Start the Vibe Kanban development server. This automatically kills any existing instances to prevent multiple servers from running simultaneously.

## Instructions

1. **Start the development server** using make (run in background):
   ```bash
   make dev
   ```
   This will:
   - Kill any existing server/vite instances (prevents duplicate servers)
   - Start both frontend and backend concurrently
   - Auto-assign ports via `scripts/setup-dev-environment.js`

2. **Wait for startup** (~10 seconds) then check the output for:
   - Frontend URL (typically `http://localhost:3008/`)
   - Backend URL (typically `http://127.0.0.1:3009`)

3. **Report the URLs** to the user once the servers are running.

## Alternative Commands

- `make dev-qa` - Start in QA testing mode (also kills existing instances)
- `make kill-dev` - Just kill existing instances without restarting

## Troubleshooting

If you see "Connection failed" errors:
1. Check that both servers started (look for "Server running on" in backend output)
2. Verify the frontend proxy is configured for the correct backend port
3. Run `make kill-dev` then `make dev` to restart cleanly

## Notes

- The dev server runs frontend (Vite) on port 3008 and backend (Cargo) on port 3009
- Always use `make dev` instead of `pnpm run dev` to ensure clean startup
- Multiple server instances cause the frontend to flicker between different database states
