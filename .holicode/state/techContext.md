---
mb_meta:
  projectID: "vibe-kanban-fork"
  version: "0.1.0"
  lastUpdated: "2026-05-05"
  templateVersion: "1.0"
  fileType: "techContext"
---

# Vibe Kanban (ciekawy fork) - Technical Context

## Issue Tracker
- **Provider**: Vibe Kanban (this very project, dogfooded)
- **issue_tracker**: vibe_kanban
- **MCP Server**: `vibe_kanban` MCP server (tools prefixed `mcp__vibe_kanban__*`).
  Use `get_context` first to discover active project/workspace IDs, then `list_projects` /
  `list_organizations` / `list_repos` to map the fork into a VK project.
- **Organization**: TBD (will be created/linked when fork is added as a VK project)
- **Project**: TBD (placeholder name suggested: "Vibe Kanban (ciekawy fork)")
- **ID Prefix**: TBD (VK assigns short IDs like `VIB-NN` once project exists; current
  reference IDs in this state file use placeholder `VIB-?` until real IDs are minted)
- **Statuses**: VK defaults — `To Do`, `In Progress`, `In Review`, `Done`, `Cancelled`
- **Issue Type Convention**: Tag-based (`epic`, `story`, `task`, `technical-design`,
  `spike`, `bug`); see `issueTrackerBootstrap.md` for verification checklist.
- **Type Taxonomy**: epic > story > task; technical-design and spike orthogonal; bug as needed.
- **Taxonomy Strictness**: recommended (fall back to title prefix / description metadata if
  tags missing).
- **ID Resolution**: Once the fork is linked as a VK project, real IDs will replace `VIB-?`
  in this file and in `WORK_SPEC.md`. Detailed specs/TDs live in `.holicode/specs/**`.
- **Local Mode Note**: not local — we are using `vibe_kanban`. `.holicode/specs/**` holds
  detail; tracker holds lightweight ticket records.

## PR/Git Operations
- **PR Workflow**: `gh` CLI against `github.com/ciekawy/vibe-kanban` (origin); upstream
  `BloopAI/vibe-kanban` is fetch-only for periodic merges into the fork's `main`.
- **Branch Convention**: `vk/<short-id>-<slug>` (matches existing worktree branches like
  `vk/b210-i-only-initializ`, `vk/7e73-apparently-along`). For tracker-issued IDs, prefer
  `vk/<vk-id>-<slug>` once VK IDs exist.
- **Commit Convention**: Conventional Commits (`feat`, `fix`, `chore`, `refactor`, `docs`,
  `revert`, etc.). Keep commits revert/rebase-friendly so periodic upstream merges stay clean.

## Technology Stack
### Frontend
- **Framework**: React 18 + Vite
- **Language**: TypeScript
- **Key Libraries**:
  - Tailwind CSS
  - Shared component library at `packages/web-core` (consumed by `packages/local-web` and
    `packages/remote-web`)
  - Generated types from Rust via ts-rs (`shared/types.ts`, `shared/remote-types.ts`)

### Backend
- **Framework**: Rust workspace under `crates/`
- **Language**: Rust (stable, see `rust-toolchain.toml`)
- **Runtime**: Tokio async; SQLx for DB; axum for HTTP (typical for this codebase)
- **Key Libraries**:
  - SQLx (with offline metadata, see `pnpm run prepare-db` / `pnpm run remote:prepare-db`)
  - ts-rs (Rust -> TS type generation; entrypoints
    `crates/server/src/bin/generate_types.rs` and
    `crates/remote/src/bin/remote-generate-types.rs`)
  - Executor crates under `crates/executors/` (Anthropic, OpenAI, OpenCode, etc.)

### Database
- **Primary Database**: SQLite for local server; Postgres for remote (`crates/remote`)
- **Caching**: n/a (in-process where needed)
- **Search**: n/a

### Infrastructure
- **Cloud Provider**: n/a (self-hosted; fork's release pipeline targets npm + GitHub
  Releases + Docker)
- **Container Platform**: Docker (Dockerfile at repo root; remote deploy via
  `crates/remote/...` scripts including `deploy.sh` patched in VIB-51)
- **CI/CD**: GitHub Actions (`.github/workflows/`)
- **Monitoring**: Application Insights OTLP export available in remote (`crates/remote`,
  per upstream commit `b3790e027`)

## Development Environment
### Required Tools
- Node.js: per `package.json` engines
- pnpm: per `packageManager` field
- Rust: per `rust-toolchain.toml`
- gh CLI: required for PR workflow
- Docker: optional for container builds

### Development Setup
#### Prerequisites
```bash
# Node + pnpm + Rust toolchain installed; gh authenticated
pnpm i
```

#### Installation Steps

```bash
pnpm i
pnpm run prepare-db          # SQLx offline metadata (local)
pnpm run remote:prepare-db   # SQLx offline metadata (remote/postgres)
```

#### Environment Configuration

```bash
# .env in repo root for local overrides; never commit secrets.
# Common: FRONTEND_PORT, BACKEND_PORT, HOST
# Dev ports/assets managed by scripts/setup-dev-environment.js
```

### IDE/Editor Configuration

- **Recommended IDE**: VS Code or any rust-analyzer-capable editor
- **Required Extensions**:
    - rust-analyzer
    - ESLint
    - Prettier

### Technical Constraints
#### Platform Constraints
- Must run on Linux/macOS/Windows (npx CLI ships under `npx-cli/`).
- Tauri desktop app present (`crates/tauri-app`).

#### Performance Constraints
- Streaming responses from LLM executors must remain low-latency; extended-thinking
  streaming for new Claude models must not regress UI responsiveness vs. existing models.

#### Security Constraints
- API keys for executors stored per existing config patterns; never logged.
- Remote deployment uses trusted-key auth (`crates/trusted-key-auth`).

#### Compliance Requirements
- None specific; respect upstream LICENSE.

### Dependencies & Integrations
#### External APIs

- Anthropic API: Claude executor models (must include latest Opus 4.7 + 1M context)
- OpenAI API: GPT executor models (must include GPT 5.5)
- OpenCode: external coding-agent runtime, must be updated for latest models too

#### Third-Party Services

- GitHub: source hosting, releases, CI
- npm registry: published `npx-cli` package (currently under BloopAI scope; fork must own
  publishing under user scope)

#### Internal Dependencies

- `shared/types.ts`, `shared/remote-types.ts`: generated TS bindings (DO NOT edit by hand;
  edit the generator binaries instead).
- `packages/web-core`: shared UI consumed by both web frontends.

### Build & Deployment
#### Build Process
```bash
pnpm run check         # frontend + backend type/Rust checks
pnpm run lint          # eslint + cargo clippy
cargo test --workspace # Rust tests
pnpm run format        # cargo fmt + Prettier (required before completing tasks)
pnpm run build:npx     # builds the npm CLI bundle (then `pnpm pack` in npx-cli/)
```

#### Testing Strategy

Unit Tests: `cargo test --workspace` for Rust; Vitest co-located for new web logic
Integration Tests: covered by Rust integration tests where present
E2E Tests: not currently emphasized; manual smoke via `pnpm run dev`

#### Deployment Strategy

Environment: self-hosted via Docker / npx CLI; remote optionally via `crates/remote`
Deployment Method: docker compose for remote (see deploy.sh patched in VIB-51 with
  `--force-recreate --remove-orphans`), npx CLI for local
Rollback Strategy: pin previous version via Docker tag or npm version

#### Environment Variables
```bash
FRONTEND_PORT, BACKEND_PORT, HOST     # dev ports
# remote-specific env vars: see crates/remote/AGENTS.md
```

### Quality & Standards
#### Code Quality Tools

- Linting: ESLint (web), `cargo clippy` (Rust)
- Formatting: Prettier (web), `cargo fmt` (Rust); enforced via `rustfmt.toml`
- Type Checking: tsc + Rust compiler

#### Coding Standards

- Rust: snake_case modules, PascalCase types; group imports by crate.
- TS/React: PascalCase components, camelCase vars/functions, kebab-case files.
- 2 spaces, single quotes, 80 cols (web).
- Always regenerate TS types via `pnpm run generate-types` after Rust API/type edits.

#### Documentation Standards

- AGENTS.md at relevant levels (root, `crates/remote/`, `docs/`, `packages/local-web/`).
- Mintlify docs under `docs/` (see `docs/AGENTS.md`).

### Known Technical Issues
#### Current Limitations

- Upstream sunset of projects/organizations UI (v0.1.44, commit `97123d526`); reverted on
  fork via VIB-51 work but must be re-applied on every conflicting upstream merge.
- Extended-thinking / chain-of-thought streaming pipeline is currently model-family-specific
  and needs unification for new Claude Opus 4.7 + 1M context models.
- OpenCode executor lags behind native executors in newest model coverage.

#### Technical Debt

- Release pipeline still relies on upstream BloopAI npm scope; fork has no published
  artifacts yet under its own scope.

#### Planned Improvements

- VIB-?: Init HoliCode + orchestration in this fork (in progress this session).
- VIB-?: Own release pipeline under ciekawy scope (npm + GitHub Releases + Docker) — Q2 2026.
- VIB-?: Latest model support umbrella (Claude Opus 4.7 + 1M context + extended-thinking
  streaming; GPT 5.5; OpenCode parity) — Q2/Q3 2026.
