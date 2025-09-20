# Upstream Divergence Analysis Report

## Executive Summary

The automagik-forge fork has diverged significantly from upstream vibe-kanban with **140 files changed**, containing **10,437 insertions** and **508 deletions**. This represents a substantial customization effort with deep architectural modifications.

**Fork Details:**
- **Upstream**: BloopAI/vibe-kanban
- **Fork**: namastexlabs/automagik-forge
- **Divergence Scale**: Massive (10k+ line changes across core architecture)
- **Last Major Upstream Sync**: 2025-09-18 (recent merge attempts visible)

## File Categorization by Type and Risk Level

### 🔴 HIGH RISK - Core Architecture Changes (22 files)
*Complex merge conflicts likely, architectural modifications*

| File | Type | Risk Factor | Description |
|------|------|-------------|-------------|
| `crates/db/src/models/task.rs` | Core Model | Critical | Task model schema changes (35 line changes) |
| `crates/db/src/models/task_attempt.rs` | Core Model | Critical | Task attempt model changes (68 line changes) |
| `crates/server/src/routes/tasks.rs` | API Route | High | Core task API modifications |
| `crates/server/src/routes/task_attempts.rs` | API Route | High | Task attempt API changes |
| `crates/services/src/services/worktree_manager.rs` | Core Service | High | Git worktree management changes |
| `crates/services/src/services/git.rs` | Core Service | High | Git integration modifications |
| `crates/server/src/mcp/task_server.rs` | MCP Core | High | MCP server integration changes |
| `frontend/src/lib/api.ts` | Frontend Core | High | API client modifications |
| `frontend/src/main.tsx` | Frontend Core | High | Application entry point changes |
| `shared/types.ts` | Type Definitions | High | Shared type system changes (18 line changes) |
| `package.json` | Build System | High | Core dependency and script changes |
| `Cargo.toml` | Build System | High | Workspace configuration changes |
| `crates/*/Cargo.toml` (8 files) | Build System | High | Individual crate dependency changes |
| `frontend/package.json` | Frontend Build | High | Frontend dependency modifications |
| `pnpm-lock.yaml` | Lock File | High | Dependency lock changes |
| `frontend/vite.config.ts` | Build Config | High | Vite configuration changes (64 line changes) |

### 🟡 MEDIUM RISK - Feature Extensions (31 files)
*New features that extend core functionality*

| File | Type | Risk Factor | Description |
|------|------|-------------|-------------|
| `crates/server/src/routes/omni.rs` | New Feature | Medium | **NEW**: Omni notification system (150 lines) |
| `crates/services/src/services/omni/*` | New Feature | Medium | **NEW**: Complete Omni service (318 lines total) |
| `frontend/src/components/omni/*` | New Feature | Medium | **NEW**: Omni frontend components (414 lines) |
| `crates/db/migrations/20250903172012_add_branch_template_to_tasks.sql` | DB Migration | Medium | **NEW**: Branch template feature |
| `crates/services/src/services/config/versions/v7.rs` | Config System | Medium | **NEW**: v7 config format (116 lines) |
| `frontend/src/components/dialogs/tasks/TaskFormDialog.tsx` | UI Enhancement | Medium | Task form enhancements (31 line changes) |
| `crates/executors/src/executors/codex.rs` | Executor | Medium | Codex executor modifications (22 line changes) |
| `crates/executors/src/executors/gemini.rs` | Executor | Medium | Gemini executor modifications |
| `crates/local-deployment/src/container.rs` | Deployment | Medium | Container deployment changes (77 line changes) |
| 22 additional frontend component files | UI Components | Medium | Dialog and component modifications |

### 🟢 LOW RISK - Branding & UI (39 files)
*Cosmetic changes, branding updates, low conflict probability*

| File | Type | Risk Factor | Description |
|------|------|-------------|-------------|
| `README.md` | Documentation | Low | Complete rebranding to automagik-forge |
| `CLAUDE.md` | Documentation | Low | Fork-specific development guide |
| `DEVELOPER.md` | Documentation | Low | **NEW**: Developer documentation |
| `frontend/src/components/logo.tsx` | Branding | Low | Logo component changes |
| `frontend/public/forge-*.{svg,png}` | Assets | Low | **NEW**: Automagik Forge branding assets |
| `frontend/public/favicon-*` | Assets | Low | Favicon updates |
| `frontend/src/styles/index.css` | Styling | Low | Theme/style changes (719 line changes) |
| `frontend/tailwind.config.js` | Styling | Low | Tailwind configuration |
| 31 additional UI/styling files | UI/Styling | Low | Component styling updates |

### 🚀 FORK-SPECIFIC - Automagik Forge Features (48 files)
*Completely new functionality unique to this fork*

| Directory/File | Type | Description |
|----------------|------|-------------|
| `.claude/` (12 files) | Agent System | **NEW**: Complete Claude integration system |
| `.claude/agents/forge-master.md` | Agent Config | **NEW**: Forge master agent (216 lines) |
| `.claude/commands/` (7 files) | Command System | **NEW**: Custom command system (2,961 lines total) |
| `genie/` directory (5 files) | Genie System | **NEW**: Genie wish system |
| `.mcp.json` | MCP Config | **NEW**: MCP server configuration |
| `Makefile` | Build System | **NEW**: Make-based build system (142 lines) |
| `genie.sh` | Automation | **NEW**: Genie shell script |
| `gh-build.sh` | Build System | **NEW**: GitHub build automation (1,028 lines) |
| `scripts/release-analyzer.sh` | Automation | **NEW**: Release analysis script (353 lines) |
| `roadmap-plan.md` | Planning | **NEW**: Fork roadmap |

### ⚫ DEPRECATED - Upstream Removals (8 files)
*Files removed from upstream, low conflict risk*

| File | Type | Description |
|------|------|-------------|
| `check-both.sh` | Build Script | Removed upstream check script |
| `test-npm-package.sh` | Test Script | Removed npm test script |
| `dev_assets_seed/config.json` | Config | Removed seed configuration |
| `frontend/public/vibe-kanban-*` | Assets | Removed original branding assets |

## Statistics Summary

| Category | File Count | Line Changes | Conflict Risk |
|----------|------------|--------------|---------------|
| **High Risk** | 22 | ~2,500 lines | Critical |
| **Medium Risk** | 31 | ~4,200 lines | Moderate |
| **Low Risk** | 39 | ~2,800 lines | Minimal |
| **Fork-Specific** | 48 | ~6,400 lines | None (new files) |
| **Deprecated** | 8 | -500 lines | None (removals) |
| **TOTAL** | **140** | **10,437 insertions, 508 deletions** | **Mixed** |

## Risk Assessment

### Critical Merge Conflict Areas
1. **Database Models**: Task and TaskAttempt schemas have fundamental changes
2. **API Routes**: Core task management endpoints modified
3. **Build Configuration**: Extensive Cargo.toml and package.json changes
4. **Type System**: Shared types have structural modifications

### Safe Merge Areas
1. **Fork-Specific Features**: Omni system, Genie, Claude agents (all new)
2. **Branding Assets**: Logo, styling, documentation changes
3. **UI Components**: Most component changes are additive

### Unknown Risk Areas
1. **MCP Integration**: Both forks may have evolved MCP features
2. **Executor System**: Both codex and gemini executors have changes
3. **Worktree Management**: Core git functionality modifications

## Recommendations

1. **Incremental Merge Strategy**: Start with low-risk UI/branding files
2. **Database Migration Planning**: Coordinate schema changes carefully
3. **API Compatibility Check**: Ensure API routes remain compatible
4. **Feature Flag Approach**: Use feature flags for Omni/Genie systems
5. **Comprehensive Testing**: Full integration test suite before merge

---
*Generated: 2025-09-19*
*Analysis Branch: analysis/merge-optimization-foundation-1481*