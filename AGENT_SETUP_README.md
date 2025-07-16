# Agent Worktree Setup Guide

## Quick Start

Each agent worktree now has a `setup.js` script that prepares it for development.

### To setup and run an agent's project:

1. **Navigate to the agent worktree:**
   ```bash
   cd /private/var/folders/wl/z8733y815nzg28yy0_1_lh7w0000gn/T/vibe-kanban/vk-XXXX-YYYY
   ```

2. **Run the setup script:**
   ```bash
   node setup.js
   ```

3. **Start development:**
   ```bash
   npm run dev
   ```

## What the setup script does:

- ✅ Copies essential scripts from main repo (`setup-dev-environment.js`, `prepare-db.js`, `cargo.js`)
- ✅ Copies development assets (`dev_assets_seed`, `dev_assets`)
- ✅ Copies SQLx query cache (`.sqlx` directory)
- ✅ Installs missing dependencies (`cargo-watch`, `sqlx-cli`)
- ✅ Installs Node.js dependencies if missing
- ✅ Prepares database for SQLx compilation
- ✅ Sets up port allocation for frontend/backend

## Alternative: Test via PR checkout

If you prefer to test agent work without affecting their environment:

```bash
# In your main directory
gh pr checkout <PR_NUMBER>
npm run dev
```

## Troubleshooting

### If `npm run dev` fails:
1. Make sure you ran `node setup.js` first
2. Check that all dependencies are installed:
   ```bash
   npm install
   cd frontend && npm install
   ```

### If Rust compilation fails:
1. Ensure Rust tools are installed:
   ```bash
   cargo install cargo-watch sqlx-cli
   ```
2. Re-run database preparation:
   ```bash
   npm run prepare-db
   ```

### If ports are in use:
```bash
npm run dev:clear-ports
```

## What's different from main repo?

Agent worktrees may have:
- Different feature implementations
- Modified frontend/backend code
- New components or pages
- Different database migrations (use with caution)

The setup script ensures they have the same development infrastructure as the main repo.
