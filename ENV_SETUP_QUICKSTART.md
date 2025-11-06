# Environment Setup Quick Reference

## TL;DR - Quick Setup! 🎉

**Vibe Kanban works out of the box** with minimal setup:

```bash
# 1. Install dependencies
pnpm i

# 2. Create .env files (prevents console warnings)
pnpm run setup:env

# 3. Start dev server
pnpm run dev
```

The `.env` files will be created with empty values - **no API keys required** for core features!

## If You Skip Setup...

### "Missing CLERK_PUBLISHABLE_KEY"

✅ **Safe to ignore** - This is for optional task sharing features.

To suppress the warning: Run `pnpm run setup:env` to create empty .env files.

### "POSTHOG_API_KEY not set"

✅ **Safe to ignore** - This is for optional analytics.

---

## Environment File Setup

### Option 1: Quick Setup (Recommended)

```bash
# Creates .env and frontend/.env from templates
pnpm run setup:env
```

This creates:
- `.env` (backend build-time variables)
- `frontend/.env` (frontend variables)

**Key variables are uncommented with empty values** to:
- ✅ Prevent console warnings
- ✅ Show what can be configured
- ✅ Work out of the box (empty = disabled)

Simply fill in values to enable features!

### Option 2: Manual Setup

```bash
# Copy templates
cp .env.example .env
cp frontend/.env.example frontend/.env
```

### Option 3: Enable All Features

If you want task sharing, analytics, etc.:

1. **Create environment files:**
   ```bash
   pnpm run setup:env
   ```

2. **Edit `frontend/.env` to enable task sharing:**
   ```env
   # Change from:
   VITE_CLERK_PUBLISHABLE_KEY=

   # To:
   VITE_CLERK_PUBLISHABLE_KEY=pk_test_YOUR_KEY_HERE
   ```
   Get your key at: https://dashboard.clerk.com

3. **Edit `.env` for backend features:**
   ```env
   # Change from empty to actual values:
   CLERK_ISSUER=https://your-tenant.clerk.accounts.dev
   VK_SHARED_API_BASE=https://your-remote-api.com
   ```

4. **Rebuild and restart:**
   ```bash
   pnpm run dev
   ```

---

## What Goes Where?

### Root `.env` (Backend Build-Time)

Variables that affect Rust backend during compilation:

- `POSTHOG_API_KEY` - Analytics
- `POSTHOG_API_ENDPOINT` - Analytics endpoint
- `CLERK_ISSUER` - Clerk authentication issuer
- `VK_SHARED_API_BASE` - Remote API for task sharing

**Runtime variables** (don't need .env):
- `BACKEND_PORT`, `FRONTEND_PORT`, `HOST` - Can be set directly when running

### Frontend `.env` (Frontend Build/Runtime)

Variables for React/Vite frontend:

- `VITE_CLERK_PUBLISHABLE_KEY` - Clerk auth (task sharing)
- `VITE_POSTHOG_API_KEY` - Frontend analytics
- `VITE_POSTHOG_API_ENDPOINT` - Analytics endpoint
- `VITE_PUBLIC_REACT_VIRTUOSO_LICENSE_KEY` - Virtuoso license
- `VITE_PARENT_ORIGIN` - For iframe embedding
- `VITE_OPEN` - Auto-open browser

---

## Common Scenarios

### "I just want to try Vibe Kanban"

```bash
pnpm i
pnpm run setup:env  # Creates .env files (optional but recommended)
pnpm run dev
```

**Done!** No warnings, everything works.

### "I want to share tasks with my team"

```bash
pnpm run setup:env
# Edit frontend/.env, add VITE_CLERK_PUBLISHABLE_KEY
pnpm run dev
```

### "I'm deploying to production"

See [API_KEY_REQUIREMENTS.md](API_KEY_REQUIREMENTS.md) for complete configuration guide.

---

## Files Overview

| File | Purpose | When to Use |
|------|---------|-------------|
| `.env.example` | Backend template | Reference for backend vars |
| `frontend/.env.example` | Frontend template | Reference for frontend vars |
| `.env` | Your backend config | When enabling backend features |
| `frontend/.env` | Your frontend config | When enabling frontend features |

**Note:** `.env` files are gitignored for security.

---

## Need Help?

- **Complete guide:** [API_KEY_REQUIREMENTS.md](API_KEY_REQUIREMENTS.md)
- **Getting started:** [docs/getting-started.mdx](docs/getting-started.mdx)
- **Issues:** https://github.com/BloopAI/vibe-kanban/issues

## Development Scripts

```bash
# Create environment files from templates
pnpm run setup:env

# Start development servers
pnpm run dev

# Build production version
./build-npm-package.sh
```

---

**Remember:** All environment variables are **OPTIONAL**. The app works great without any configuration!
