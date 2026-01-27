<p align="center">
  <a href="https://vibekanban.com">
    <picture>
      <source srcset="frontend/public/vibe-kanban-logo-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="frontend/public/vibe-kanban-logo.svg" media="(prefers-color-scheme: light)">
      <img src="frontend/public/vibe-kanban-logo.svg" alt="Vibe Kanban Logo">
    </picture>
  </a>
</p>

<p align="center">Vibe Kanban PM - GitHub Projects-like PM features for AI coding agents</p>
<p align="center">
  <a href="https://www.npmjs.com/package/vibe-kanban-pm"><img alt="npm" src="https://img.shields.io/npm/v/vibe-kanban-pm?style=flat-square" /></a>
</p>

## Overview

**Vibe Kanban PM** is a fork of [Vibe Kanban](https://github.com/BloopAI/vibe-kanban) with added GitHub Projects-like PM (Project Management) features. This version includes all the original features plus:

### PM Features

- **PM Task**: Designate a task as the project-level specification document (source of truth)
- **PM Docs Sidebar**: Collapsible sidebar showing PM documentation on the tasks page
- **Labels System**: Create and assign colored labels to tasks for better organization
- **Task Priorities**: Set priority levels (Urgent/High/Medium/Low) with visual indicators
- **Task Dependencies**: Define task dependencies to track blocking relationships
- **Dependency Indicators**: Visual indicators showing blocked status or all dependencies complete
- **Drag-and-Drop Reordering**: Reorder tasks within and across columns
- **Auto-Review on In Review**: Automatically trigger AI review when tasks move to "In Review"
- **Auto-Review Settings**: Configure AI selection, review types, and custom instructions
- **MCP Tool**: `request_pm_review` tool for AI agents to request PM spec reviews
- **i18n Support**: English and Japanese translations

## System Requirements

### Runtime Requirements

- **Operating Systems**: macOS, Linux, Windows (WSL2 recommended)
- **Node.js**: v18 or higher
- **Disk Space**: ~100MB for application and dependencies
- **Memory**: Minimum 512MB RAM (1GB+ recommended)

### Browser Compatibility

- Chrome/Edge: Latest 2 versions
- Firefox: Latest 2 versions
- Safari: Latest 2 versions

### Optional Dependencies

- **Git**: Required for project management features and worktree operations
- **SSH**: Required for remote project access
- **VSCode**: Required for "Open in VSCode" integration
  - With Remote-SSH extension for remote projects

## Installation

```bash
npx vibe-kanban-pm
```

### MCP Mode

```bash
npx vibe-kanban-pm --mcp
```

### Review Mode

```bash
npx vibe-kanban-pm review
```

## PM Features Usage

### Setting Up PM Task

1. Go to **Project Settings**
2. Select a task as the **PM Task** - this task will serve as your project specification
3. The PM task's description will appear in the PM Docs sidebar

### Using Labels

1. Click on a task to open the edit dialog
2. In the **Labels** section, click the "+" button to add labels
3. Create new labels with custom colors or select existing ones

### Setting Task Dependencies

1. Open a task in edit mode
2. In the **Depends On** section, click "+" to add dependencies
3. Select tasks that must be completed before this task
4. Blocked tasks show an amber indicator, completed dependencies show a green indicator

### Auto-Review Configuration

1. Click the settings icon in the PM Docs sidebar header
2. Enable **Auto-Review**
3. Select which AI agent to use for reviews
4. Choose review types:
   - **PM Spec Review**: Check against project specifications
   - **Code Review**: Check code quality and best practices
5. Add optional custom instructions

When a task is dragged to the "In Review" column, the configured AI will automatically start a review.

## Original Vibe Kanban Features

- Easily switch between different coding agents
- Orchestrate execution of multiple coding agents in parallel or sequence
- Quickly review work and start dev servers
- Track task status for coding agents
- Centralize MCP configuration
- Open projects remotely via SSH

## Documentation

For general Vibe Kanban documentation, visit [vibekanban.com/docs](https://vibekanban.com/docs).

## Development

### Prerequisites

- [Rust](https://rustup.rs/) (latest stable)
- [Node.js](https://nodejs.org/) (>=18)
- [pnpm](https://pnpm.io/) (>=8)

Additional development tools:
```bash
cargo install cargo-watch
cargo install sqlx-cli
```

Install dependencies:
```bash
pnpm i
```

### Running the dev server

```bash
pnpm run dev
```

This will start the backend. A blank DB will be copied from the `dev_assets_seed` folder.

### Building the frontend

To build just the frontend:

```bash
cd frontend
pnpm build
```

### Build from source (macOS)

1. Run `./local-build.sh`
2. Test with `cd npx-cli && node bin/cli.js`


### Environment Variables

The following environment variables can be configured at build time or runtime:

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `POSTHOG_API_KEY` | Build-time | Empty | PostHog analytics API key (disables analytics if empty) |
| `POSTHOG_API_ENDPOINT` | Build-time | Empty | PostHog analytics endpoint (disables analytics if empty) |
| `PORT` | Runtime | Auto-assign | **Production**: Server port. **Dev**: Frontend port (backend uses PORT+1) |
| `BACKEND_PORT` | Runtime | `0` (auto-assign) | Backend server port (dev mode only, overrides PORT+1) |
| `FRONTEND_PORT` | Runtime | `3000` | Frontend dev server port (dev mode only, overrides PORT) |
| `HOST` | Runtime | `127.0.0.1` | Backend server host |
| `MCP_HOST` | Runtime | Value of `HOST` | MCP server connection host (use `127.0.0.1` when `HOST=0.0.0.0` on Windows) |
| `MCP_PORT` | Runtime | Value of `BACKEND_PORT` | MCP server connection port |
| `DISABLE_WORKTREE_ORPHAN_CLEANUP` | Runtime | Not set | Disable git worktree cleanup (for debugging) |
| `VK_ALLOWED_ORIGINS` | Runtime | Not set | Comma-separated list of origins that are allowed to make backend API requests (e.g., `https://my-vibekanban-frontend.com`) |

**Build-time variables** must be set when running `pnpm run build`. **Runtime variables** are read when the application starts.

#### Self-Hosting with a Reverse Proxy or Custom Domain

When running Vibe Kanban behind a reverse proxy (e.g., nginx, Caddy, Traefik) or on a custom domain, you must set the `VK_ALLOWED_ORIGINS` environment variable. Without this, the browser's Origin header won't match the backend's expected host, and API requests will be rejected with a 403 Forbidden error.

Set it to the full origin URL(s) where your frontend is accessible:

```bash
# Single origin
VK_ALLOWED_ORIGINS=https://vk.example.com

# Multiple origins (comma-separated)
VK_ALLOWED_ORIGINS=https://vk.example.com,https://vk-staging.example.com
```

### Remote Deployment

When running Vibe Kanban on a remote server (e.g., via systemctl, Docker, or cloud hosting), you can configure your editor to open projects via SSH:

1. **Access via tunnel**: Use Cloudflare Tunnel, ngrok, or similar to expose the web UI
2. **Configure remote SSH** in Settings → Editor Integration:
   - Set **Remote SSH Host** to your server hostname or IP
   - Set **Remote SSH User** to your SSH username (optional)
3. **Prerequisites**:
   - SSH access from your local machine to the remote server
   - SSH keys configured (passwordless authentication)
   - VSCode Remote-SSH extension

When configured, the "Open in VSCode" buttons will generate URLs like `vscode://vscode-remote/ssh-remote+user@host/path` that open your local editor and connect to the remote server.

See the [documentation](https://vibekanban.com/docs/configuration-customisation/global-settings#remote-ssh-configuration) for detailed setup instructions.

## Credits

This project is based on [Vibe Kanban](https://github.com/BloopAI/vibe-kanban) by BloopAI.
