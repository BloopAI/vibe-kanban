# Testing Guide: Source-Based Vibe-Kanban Build

This document describes how to test the Docker image build that creates vibe-kanban from source with a custom API base.

## Prerequisites

- Docker or equivalent container runtime
- ARM64 architecture (or QEMU for emulation)
- Access to holagence/vibe-kanban repository

## Local Build Test

### 1. Build the Image

From the `scripts/infra/coder-image/` directory:

```bash
docker build \
  --build-arg VK_GIT_REF=v0.1.18 \
  --build-arg VK_API_BASE=https://vk-remote.holagence.com \
  -t holicode-cde:test-source-build \
  .
```

**Expected build time:** ~5-10 minutes (includes git clone, pnpm install, build, npm pack)

**What to watch for:**
- ✅ Git clone succeeds for the specified ref
- ✅ `pnpm install --frozen-lockfile` completes without errors
- ✅ `VITE_VK_SHARED_API_BASE` environment variable is set during build
- ✅ `pnpm run build:npx` succeeds
- ✅ `npm pack` creates tarball
- ✅ Global install succeeds
- ✅ `vibe-kanban --version` works

### 2. Verify Installation

```bash
# Check vibe-kanban is installed
docker run --rm holicode-cde:test-source-build which vibe-kanban
# Expected: /usr/local/bin/vibe-kanban

# Check version
docker run --rm holicode-cde:test-source-build vibe-kanban --version
# Expected: 0.1.18 or whatever version you built

# Verify it's a working installation
docker run --rm holicode-cde:test-source-build vibe-kanban --help
```

### 3. Test with Different Git References

**Test with a branch:**
```bash
docker build \
  --build-arg VK_GIT_REF=main \
  --build-arg VK_API_BASE=https://vk-remote.holagence.com \
  -t holicode-cde:test-main \
  .
```

**Note:** `VK_GIT_REF` must be a tag or branch name (not a commit SHA), since the build uses `git clone --branch`.

### 4. Verify API Base Configuration

The API base is baked into the frontend build. To verify:

```bash
# Run a container and inspect the built frontend
docker run --rm -it holicode-cde:test-source-build bash

# Inside container, check if vibe-kanban exists and was built with custom API
# (This would require inspecting the built JS bundle, which is complex)
# For now, trust the build logs showing VITE_VK_SHARED_API_BASE was set
```

**Better verification:** Test in a running Coder workspace where vibe-kanban connects to the remote server.

## GitHub Actions Workflow Test

### 1. Manual Workflow Dispatch

Trigger the workflow manually with custom parameters:

```bash
gh workflow run build-coder-image.yml \
  --repo holagence/holicode \
  -f vk_git_ref=v0.1.18 \
  -f vk_api_base=https://vk-remote.holagence.com \
  -f image_tag=1.4-test
```

### 2. Monitor the Build

```bash
# Watch workflow runs
gh run list --repo holagence/holicode --workflow=build-coder-image.yml

# Get run ID from the list, then watch
gh run watch <run-id> --repo holagence/holicode

# View logs after completion
gh run view <run-id> --repo holagence/holicode --log
```

### 3. Verify Published Image

```bash
# Pull the test image
docker pull ghcr.io/holagence/holicode-cde:1.4-test

# Verify vibe-kanban
docker run --rm ghcr.io/holagence/holicode-cde:1.4-test vibe-kanban --version
```

## End-to-End Test in Coder

### 1. Update Coder Template

Edit `scripts/infra/coder-template/main.tf`:

```hcl
resource "docker_image" "workspace" {
  name = "ghcr.io/holagence/holicode-cde:1.4-test"  # Use test tag
  # ...
}
```

### 2. Upload Template

```bash
cd scripts/infra/coder-template
coder templates push holicode-workspace
```

### 3. Create Test Workspace

```bash
coder create test-vk-source-build --template holicode-workspace
```

### 4. Verify in Workspace

SSH into the workspace:

```bash
coder ssh test-vk-source-build
```

Inside workspace:
```bash
# Check vibe-kanban is available
which vibe-kanban
vibe-kanban --version

# Start vibe-kanban and check it connects to remote
cd /home/coder/project  # or any project directory
VK_SHARED_API_BASE=https://vk-remote.holagence.com \
  HOST=0.0.0.0 \
  PORT=3000 \
  vibe-kanban

# In another terminal, check if it's running
curl http://localhost:3000/health  # or appropriate health check endpoint
```

### 5. Test MCP Integration

If using Claude Code or another MCP client:
```bash
# Start vibe-kanban in background
nohup vibe-kanban > /tmp/vk.log 2>&1 &

# Connect with MCP client and test operations
# (Exact steps depend on your MCP client setup)
```

## Failure Scenarios

### Git Clone Fails

**Symptom:** Build fails with "couldn't find remote ref"

**Causes:**
- Git reference doesn't exist (typo in tag/branch name)
- Repository is private and build environment can't access it
- Network issues

**Fix:**
- Verify git ref exists: `git ls-remote https://github.com/holagence/vibe-kanban.git refs/tags/v0.1.18`
- Try with `main` branch as a fallback
- Check repository visibility and authentication

### pnpm Install Fails

**Symptom:** Build fails during dependency installation

**Causes:**
- Lockfile mismatch
- Dependency resolution issues
- Network issues

**Fix:**
- Check vibe-kanban repo CI status - does it build?
- Try building vibe-kanban locally first
- Check if specific git ref has lockfile issues

### Build Fails (pnpm run build:npx)

**Symptom:** Build step completes but exits non-zero

**Causes:**
- TypeScript errors
- Missing environment variables
- Build script issues

**Fix:**
- Check vibe-kanban repo for recent breaking changes
- Review build logs for specific errors
- Try building vibe-kanban locally with same parameters

### vibe-kanban --version Fails

**Symptom:** Installation succeeds but command not found or crashes

**Causes:**
- Binary not in PATH
- Permissions issue
- Incomplete installation

**Fix:**
- Check if tarball was created: `npm pack` output
- Verify global install location: `npm root -g`
- Check file permissions after install

## Performance Benchmarks

Expected build times on ARM64:

| Step | Time | Notes |
|------|------|-------|
| Base image pull | ~30s | Cached after first run |
| apt-get update/install | ~2min | Base tooling + Node.js |
| Git clone | ~10s | Shallow clone, single branch |
| pnpm install | ~1-2min | With lockfile |
| pnpm run build:npx | ~1-2min | TypeScript + bundling |
| npm pack + install | ~10s | |
| **Total** | **~5-8min** | Full clean build |

Incremental builds with Docker layer caching:
- If only VK_GIT_REF changes: ~3-5min (git clone + build)
- If VK_API_BASE changes: ~3-5min (rebuild + reinstall)
- If nothing changes: ~30s (cache hit)

## Cleanup

After testing:

```bash
# Remove local test images
docker rmi holicode-cde:test-source-build
docker rmi holicode-cde:test-main
docker rmi holicode-cde:test-commit
docker rmi ghcr.io/holagence/holicode-cde:1.4-test

# Delete test workspace in Coder
coder delete test-vk-source-build
```
