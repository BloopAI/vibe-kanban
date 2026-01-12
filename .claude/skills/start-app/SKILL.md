---
name: start-app
description: Start the Vibe Kanban development server with database migrations. Use when asked to "start the app", "run the app", "start dev server", "launch the application", or "start development".
---

# Start App

Start the Vibe Kanban development server after ensuring all database migrations are applied.

## Instructions

1. **Source the Cargo environment** (required for SQLx migrations):
   ```bash
   source "$HOME/.cargo/env" 2>/dev/null || true
   ```

2. **Apply database migrations**:
   ```bash
   npm run prepare-db
   ```
   This runs SQLx migrations and prepares the database for the application.

3. **Start the development server** (run in background):
   ```bash
   npm run dev
   ```
   This starts both the frontend and backend concurrently.

4. **Verify startup** by checking the output after a few seconds. Look for:
   - Frontend URL (typically `http://localhost:3002/`)
   - Backend URL (typically `http://127.0.0.1:3005`)

5. **Report the URLs** to the user once the servers are running.

## Notes

- The `prepare-db` script uses SQLite for local development
- The dev server runs both frontend (Vite) and backend (Cargo watch) concurrently
- Ports are auto-assigned by `scripts/setup-dev-environment.js`
