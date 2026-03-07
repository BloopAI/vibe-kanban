<p align="center">
  <a href="https://vibekanban.com">
    <picture>
      <source srcset="packages/public/vibe-kanban-logo-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="packages/public/vibe-kanban-logo.svg" media="(prefers-color-scheme: light)">
      <img src="packages/public/vibe-kanban-logo.svg" alt="Vibe Kanban Logo">
    </picture>
  </a>
</p>

<p align="center">Get 10X more out of Claude Code, Gemini CLI, Codex, Amp and other coding agents...</p>
<p align="center">
  <a href="https://www.npmjs.com/package/vibe-kanban"><img alt="npm" src="https://img.shields.io/npm/v/vibe-kanban?style=flat-square" /></a>
  <a href="https://github.com/BloopAI/vibe-kanban/blob/main/.github/workflows/publish.yml"><img alt="Build status" src="https://img.shields.io/github/actions/workflow/status/BloopAI/vibe-kanban/.github%2Fworkflows%2Fpublish.yml" /></a>
  <a href="https://deepwiki.com/BloopAI/vibe-kanban"><img src="https://deepwiki.com/badge.svg" alt="Ask DeepWiki"></a>
</p>

<h1 align="center">
  <a href="https://jobs.polymer.co/vibe-kanban?source=github"><strong>We're hiring!</strong></a>
</h1>

![](packages/public/vibe-kanban-screenshot-overview.png)

## Overview

In a world where software engineers spend most of their time planning and reviewing coding agents, the most impactful way to ship more is to get faster at planning and review.

Vibe Kanban is built for this. Use kanban issues to plan work, either privately or with your team. When you're ready to begin, create workspaces where coding agents can execute.

- **Plan with kanban issues** — create, prioritise, and assign issues on a kanban board
- **Run coding agents in workspaces** — each workspace gives an agent a branch, a terminal, and a dev server
- **Review diffs and leave inline comments** — send feedback directly to the agent without leaving the UI
- **Preview your app** — built-in browser with devtools, inspect mode, and device emulation
- **Switch between 10+ coding agents** — Claude Code, Codex, Gemini CLI, GitHub Copilot, Amp, Cursor, OpenCode, Droid, CCR, and Qwen Code
- **Create pull requests and merge** — open PRs with AI-generated descriptions, review on GitHub, and merge

![](packages/public/vibe-kanban-screenshot-workspace.png)

One command. Describe the work, review the diff, ship it.

```bash
npx vibe-kanban
```


## Installation

Make sure you have authenticated with your favourite coding agent. A full list of supported coding agents can be found in the [docs](https://vibekanban.com/docs/supported-coding-agents). Then in your terminal run:

```bash
npx vibe-kanban
```

## Documentation

Head to the [website](https://vibekanban.com/docs) for the latest documentation and user guides.

## Self-Hosting

Want to host your own Vibe Kanban Cloud instance? See our [self-hosting guide](https://vibekanban.com/docs/self-hosting/deploy-docker).

## Support

We use [GitHub Discussions](https://github.com/BloopAI/vibe-kanban/discussions) for feature requests. Please open a discussion to create a feature request. For bugs please open an issue on this repo.

## Contributing

We would prefer that ideas and changes are first raised with the core team via [GitHub Discussions](https://github.com/BloopAI/vibe-kanban/discussions) or [Discord](https://discord.gg/AC4nwVtJM3), where we can discuss implementation details and alignment with the existing roadmap. Please do not open PRs without first discussing your proposal with the team.

## Development

### Prerequisites

- [Rust](https://rustup.rs/) (latest stable)
- [Node.js](https://nodejs.org/) (>=20)
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

This will start the backend and web app. A blank DB will be copied from the `dev_assets_seed` folder.

### Building the web app

To build just the web app:

```bash
cd packages/local-web
pnpm run build
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
| `DISABLE_WORKTREE_CLEANUP` | Runtime | Not set | Disable all git worktree cleanup including orphan and expired workspace cleanup (for debugging) |
| `VK_ALLOWED_ORIGINS` | Runtime | Not set | Comma-separated list of origins that are allowed to make backend API requests (e.g., `https://my-vibekanban-frontend.com`) |
| `VK_SHARED_API_BASE` | Runtime | Not set | Base URL for the remote/cloud API used by the local desktop app |
| `VK_SHARED_RELAY_API_BASE` | Runtime | Not set | Base URL for the relay API used by tunnel-mode connections |
| `VK_TUNNEL` | Runtime | Not set | Enable relay tunnel mode when set (requires relay API base URL) |

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

See the [documentation](https://vibekanban.com/docs/settings/general) for detailed setup instructions.
