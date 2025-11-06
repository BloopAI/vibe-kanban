# API Key & Environment Variable Requirements

This document provides a comprehensive list of all API keys and environment variables required or optional for Vibe Kanban development and deployment.

## Quick Start (Minimal Setup)

For **basic local development**, you only need:
- ✅ A coding agent authenticated (Claude Code, Gemini CLI, etc.)
- ✅ That's it! No API keys required.

The error you're seeing about `VITE_CLERK_PUBLISHABLE_KEY` is for **optional** remote task sharing features. You can safely ignore it for local development.

---

## Environment Variables Reference

### Required for Basic Development

**None!** Vibe Kanban works out of the box with just a coding agent authenticated.

### Optional - Task Sharing Features

Enable these to use the **task sharing** feature (share tasks with team members):

| Variable | Location | Description | How to Get |
|----------|----------|-------------|------------|
| `VITE_CLERK_PUBLISHABLE_KEY` | Frontend build/runtime | Clerk authentication for shared tasks | Get from [Clerk Dashboard](https://dashboard.clerk.com/last-active?path=api-keys) |
| `CLERK_ISSUER` | Backend build-time | Clerk issuer URL (e.g., `https://<tenant>.clerk.accounts.dev`) | From your Clerk application settings |
| `VK_SHARED_API_BASE` | Backend build-time | Remote API base URL for shared tasks | Deploy remote service or use hosted version |

**Setup:**
```bash
# Frontend (.env file in /frontend directory)
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...

# Backend (set before building)
export CLERK_ISSUER=https://your-tenant.clerk.accounts.dev
export VK_SHARED_API_BASE=https://your-remote-api.com
```

If these are not set, you'll see warnings but the app will work fine for local task management.

### Optional - Analytics (PostHog)

| Variable | Location | Description | Default Behavior |
|----------|----------|-------------|------------------|
| `POSTHOG_API_KEY` | Backend build-time | PostHog analytics key | Analytics disabled |
| `POSTHOG_API_ENDPOINT` | Backend build-time | PostHog endpoint URL | Analytics disabled |
| `VITE_POSTHOG_API_KEY` | Frontend build-time | PostHog analytics key (frontend) | Analytics disabled |
| `VITE_POSTHOG_API_ENDPOINT` | Frontend build-time | PostHog endpoint URL (frontend) | Analytics disabled |

**Setup:**
```bash
# Build-time variables (set before running pnpm run build)
export POSTHOG_API_KEY=your_key_here
export POSTHOG_API_ENDPOINT=https://app.posthog.com

# Frontend build (set in .env file or environment)
VITE_POSTHOG_API_KEY=your_key_here
VITE_POSTHOG_API_ENDPOINT=https://app.posthog.com
```

### Optional - Frontend Features

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_PUBLIC_REACT_VIRTUOSO_LICENSE_KEY` | React Virtuoso library license | Uses free version |
| `VITE_PARENT_ORIGIN` | Allowed origin for iframe embedding | No restriction |
| `VITE_OPEN` | Auto-open browser on dev server start | `false` |

### Runtime Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `BACKEND_PORT` | Backend server port | `0` (auto-assign) |
| `FRONTEND_PORT` | Frontend dev server port | `3000` |
| `HOST` | Backend server host | `127.0.0.1` |
| `DISABLE_WORKTREE_ORPHAN_CLEANUP` | Disable git worktree cleanup (debugging) | Not set |
| `PORT` | Override port for npx vibe-kanban | Random free port |

**Example:**
```bash
PORT=8080 npx vibe-kanban
```

---

## Coding Agent Authentication

**IMPORTANT**: Each coding agent must be authenticated **outside** of Vibe Kanban before use.

### Supported Agents & Authentication

Each agent requires separate authentication. Follow the installation guide for your preferred agent:

| Agent | Authentication Method | Documentation |
|-------|----------------------|---------------|
| **Claude Code** | Run `npx @anthropic-ai/claude-code` and follow login flow | [docs/agents/claude-code.mdx](/docs/agents/claude-code.mdx) |
| **OpenAI Codex** | Configure OpenAI API key via Codex CLI | [docs/agents/openai-codex.mdx](/docs/agents/openai-codex.mdx) |
| **Gemini CLI** | Authenticate with Google account | [docs/agents/gemini-cli.mdx](/docs/agents/gemini-cli.mdx) |
| **GitHub Copilot** | GitHub Copilot subscription + authentication | [docs/agents/github-copilot.mdx](/docs/agents/github-copilot.mdx) |
| **Amp** | Amp authentication | [docs/agents/amp.mdx](/docs/agents/amp.mdx) |
| **Cursor Agent CLI** | Cursor subscription + CLI setup | [docs/agents/cursor-cli.mdx](/docs/agents/cursor-cli.mdx) |
| **OpenCode** | SST OpenCode setup | [docs/agents/opencode.mdx](/docs/agents/opencode.mdx) |
| **Qwen Code** | Qwen CLI authentication | [docs/agents/qwen-code.mdx](/docs/agents/qwen-code.mdx) |

**Before running Vibe Kanban**, authenticate with at least one coding agent.

---

## GitHub Integration (Optional)

GitHub integration enables:
- ✅ Branch management
- ✅ Pull request creation
- ✅ Status synchronization

### Setup

1. Open Vibe Kanban Settings (⚙️ icon in sidebar)
2. Click **"Connect GitHub Account"** under GitHub Integration
3. Follow the OAuth device flow authentication
4. Grant required permissions:
   - `repo` - Repository access
   - `read:user` - Basic profile info
   - `user:email` - Email for Git commits

**Fallback**: If you encounter permission issues, you can provide a Personal Access Token (PAT) with the same scopes.

See [docs/integrations/github-integration.mdx](/docs/integrations/github-integration.mdx) for details.

---

## Remote Deployment (Advanced)

For deploying Vibe Kanban on a remote server with full task sharing capabilities, you need to deploy the remote service. This requires:

### Remote Service Environment Variables

Create `.env.remote` file:

```env
CLERK_SECRET_KEY=sk_live_...
CLERK_ISSUER=https://<tenant>.clerk.accounts.dev
CLERK_API_URL=https://api.clerk.com/v1/
```

### Running Remote Stack

```bash
# Start remote API
docker compose --env-file .env.remote -f crates/remote/docker-compose.yml up --build

# Configure Vibe Kanban to use remote API
export VK_SHARED_API_BASE=http://localhost:8081
export VK_SHARED_WS_URL=ws://localhost:8081/v1/ws

pnpm run dev
```

See [crates/remote/README.md](/crates/remote/README.md) for full remote deployment details.

---

## Fixing Your Current Error

You're seeing this error:
```
Uncaught Error: @clerk/clerk-react: Missing publishableKey
```

### Solutions:

**Option 1: Ignore it (Recommended for Local Dev)**
- The error is a warning about missing Clerk authentication
- **You can still use Vibe Kanban** for all core features without it
- Task sharing features will be disabled, but everything else works

**Option 2: Disable Clerk Provider (If error blocks app)**

Edit `frontend/src/main.tsx` around line 125-134:

```typescript
const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

// Conditionally render ClerkProvider only if key exists
const AppWrapper = CLERK_PUBLISHABLE_KEY ? (
  <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY}>
    <App />
  </ClerkProvider>
) : (
  <App />
);

// Then use AppWrapper in render instead of hardcoded ClerkProvider
```

**Option 3: Enable Full Clerk Support**

If you want to enable task sharing:

1. Create a Clerk account at https://clerk.com
2. Get your publishable key from https://dashboard.clerk.com
3. Create `frontend/.env` file:
   ```env
   VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
   ```
4. Restart dev server: `pnpm run dev`

---

## Summary Matrix

| Feature | Required Variables | Optional Variables | Notes |
|---------|-------------------|-------------------|-------|
| **Basic Local Development** | None | - | Just authenticate a coding agent |
| **Task Sharing** | `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_ISSUER`, `VK_SHARED_API_BASE` | - | Requires Clerk account + remote service |
| **Analytics** | - | `POSTHOG_API_KEY`, `POSTHOG_API_ENDPOINT`, `VITE_POSTHOG_*` | Disabled by default |
| **GitHub Integration** | - | Configured via UI | OAuth device flow in app |
| **Remote Deployment** | `CLERK_SECRET_KEY`, `CLERK_ISSUER` | `CLERK_API_URL` | For hosted remote service |

---

## Development Workflow

### First Time Setup

```bash
# 1. Install dependencies
pnpm i

# 2. Authenticate with a coding agent (example with Claude Code)
npx @anthropic-ai/claude-code

# 3. Start Vibe Kanban
pnpm run dev
```

That's it! No API keys needed for local development.

### With Task Sharing (Optional)

```bash
# 1. Create frontend/.env
echo "VITE_CLERK_PUBLISHABLE_KEY=pk_test_..." > frontend/.env

# 2. Set backend env vars
export CLERK_ISSUER=https://your-tenant.clerk.accounts.dev
export VK_SHARED_API_BASE=https://your-remote-api.com

# 3. Start dev server
pnpm run dev
```

---

## Questions?

- **Getting Started**: See [docs/getting-started.mdx](/docs/getting-started.mdx)
- **Configuration**: See [docs/configuration-customisation/global-settings.mdx](/docs/configuration-customisation/global-settings.mdx)
- **Supported Agents**: See [docs/supported-coding-agents.mdx](/docs/supported-coding-agents.mdx)
- **Issues**: Open a ticket at https://github.com/BloopAI/vibe-kanban/issues
