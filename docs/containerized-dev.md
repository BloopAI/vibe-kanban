# Containerized Development Environment

This guide explains how to run vibe-kanban in a containerized development environment. This is useful when you don't have Rust installed locally or want an isolated development setup.

## Prerequisites

- Docker and Docker Compose installed
- No local Rust or Node.js installation required

## Quick Start

```bash
# Start the containerized development environment
pnpm run docker:dev

# Or using the script directly
./scripts/docker-dev.sh start
```

This will:
1. Build a Docker image with Rust nightly and Node.js 24
2. Mount your source code as volumes for live editing
3. Start both frontend and backend with hot-reloading

## Access Points

Once running:
- **Frontend**: http://localhost:3000 (Vite dev server with hot-reload)
- **Backend API**: http://localhost:3001

## Available Commands

| Command | Description |
|---------|-------------|
| `pnpm run docker:dev` | Start the development container |
| `pnpm run docker:dev:stop` | Stop the development container |
| `pnpm run docker:dev:build` | Rebuild the development image |
| `pnpm run docker:dev:shell` | Open a shell in the running container |
| `pnpm run docker:dev:clean` | Stop and remove all volumes (fresh start) |

Or use the script directly:
```bash
./scripts/docker-dev.sh [start|stop|build|shell|logs|clean|status]
```

## How It Works

### Dockerfile.dev

The development Dockerfile (`Dockerfile.dev`) creates an image with:
- Rust 1.89 (Debian Bookworm base) with nightly-2025-12-04 toolchain
- Node.js 24 (installed via nodesource)
- cargo-watch for hot-reloading
- pnpm 10.13.1
- SQLite development libraries
- clang/libclang for native compilation (bindgen)

### docker-compose.dev.yml

The compose file:
- Mounts source code directories for live editing
- Persists build caches (Cargo, node_modules, pnpm store) using bind mounts in `.docker-cache/`
- Exposes ports 3000 (frontend) and 3001 (backend)
- Sets up environment variables for development

**Note**: Build caches use bind mounts instead of Docker volumes to avoid Docker Desktop disk space issues.

### Volume Mounts

Source code is mounted for live editing:
- `./crates` - Rust backend code
- `./frontend` - React frontend code
- `./shared` - Shared TypeScript types
- `./scripts` - Development scripts

Build caches are persisted in `.docker-cache/` (bind mounts to host):
- `.docker-cache/cargo-registry` - Cargo registry cache
- `.docker-cache/cargo-git` - Cargo git dependencies
- `.docker-cache/target` - Rust build artifacts
- `.docker-cache/node_modules` - Root node_modules
- `.docker-cache/frontend-node-modules` - Frontend node_modules
- `.docker-cache/pnpm-store` - pnpm package store

## Environment Variables

You can pass environment variables from a `.env` file:

```bash
# Optional: GitHub OAuth for authentication
GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_client_secret
SESSION_SECRET=your_session_secret
```

## Troubleshooting

### First Run is Slow

The first run will:
1. Build the Docker image (downloads Rust, Node.js, etc.)
2. Install pnpm dependencies
3. Compile Rust code (~2-3 minutes)

Subsequent runs are much faster due to cached build artifacts.

### Docker Desktop Disk Space

If you encounter "no space left on device" errors:

```bash
# Prune unused Docker resources
docker system prune -a --volumes

# Or increase Docker Desktop disk limit in:
# Settings > Resources > Advanced > Virtual disk limit
```

### Rebuild After Dependency Changes

If you update `Cargo.toml` or `package.json`:

```bash
# Rebuild the image
pnpm run docker:dev:build

# Or for a completely fresh start
pnpm run docker:dev:clean
pnpm run docker:dev
```

### Permission Issues

If you encounter permission issues with mounted volumes:
```bash
# Clean and restart
pnpm run docker:dev:clean
pnpm run docker:dev
```

### Running Commands Inside the Container

```bash
# Open a shell
pnpm run docker:dev:shell

# Then run commands inside
cargo test
pnpm run generate-types
```

### View Logs

```bash
./scripts/docker-dev.sh logs
```

## Differences from Native Development

1. **Ports**: Container uses fixed ports (3000 frontend, 3001 backend) instead of auto-assigned
2. **Performance**: First Rust build takes ~2-3 minutes, but subsequent builds use cache
3. **File watching**: Works through volume mounts, may have slight delay on some systems
4. **Storage**: Build caches stored in `.docker-cache/` directory (can grow large)

## Working with Other Agents

If other agents are running in containers in this space, be aware:
- **NEVER** kill Docker processes that aren't yours
- The container is named `vibe-kanban-dev` for easy identification
- Volumes have the `vibe-kanban-` prefix

## Comparison with Native Development

| Aspect | Native | Containerized |
|--------|--------|---------------|
| Setup required | Rust, Node.js, pnpm | Docker only |
| First build | Faster (if deps exist) | Slower (builds image) |
| Subsequent builds | Fast | Fast (cached) |
| Hot-reloading | Yes | Yes |
| Isolation | No | Yes |
