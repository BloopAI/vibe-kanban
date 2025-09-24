# Upstream-as-Library Foundation Scaffold

**Status**: ✅ Task 1 Complete - Foundation scaffold established
**Date**: 2025-09-21

## Overview

This document describes the foundation scaffold created for the upstream-as-library migration. The new architecture allows the automagik-forge fork to consume upstream `vibe-kanban` as a clean library dependency while preserving all forge-specific features.

## Directory Structure

```
automagik-forge/
├── upstream/                    # Git submodule (NEVER TOUCH)
│   ├── crates/                 # Upstream backend crates
│   ├── frontend/               # Upstream UI
│   └── [everything untouched]
│
├── forge-extensions/           # Forge-specific extensions
│   ├── omni/                  # Omni notifications (scaffolded)
│   ├── branch-templates/       # Branch template feature (scaffolded)
│   ├── config/                # Config v7 system (scaffolded)
│   └── genie/                 # Genie automation (scaffolded)
│
├── forge-overrides/           # Upstream overrides (empty, for conflicts only)
│   └── .gitkeep              # Placeholder with usage instructions
│
├── forge-app/                 # Main application compositor
│   ├── Cargo.toml            # Combines everything
│   ├── src/main.rs           # Application entry point
│   ├── src/router.rs         # Dual frontend routing (stub)
│   └── src/services/         # Service composition layer (stub)
│
├── frontend-forge/            # New forge frontend (scaffolded)
│   ├── package.json          # Basic package config
│   └── README.md             # Implementation plan
│
└── [existing structure unchanged]
```

## Workspace Configuration

### Cargo Workspace

Updated `Cargo.toml` to include:
- All forge-extensions crates
- forge-app main application
- **Note**: upstream/crates/* excluded due to naming conflicts (will be resolved in Task 2)

### pnpm Workspace

Updated `pnpm-workspace.yaml` to include:
- `frontend-forge/` (new forge frontend)
- `upstream/frontend/` (legacy frontend)

## Submodule Setup

The upstream vibe-kanban repository is added as a git submodule:

```bash
# Submodule status
git submodule status upstream
# 77cb1b8ad0982a8959640073e2a01e16ddbea959 upstream (v0.0.94-20250920112651)

# To update upstream (when needed)
cd upstream && git pull --ff-only && cd ..
git add upstream && git commit -m "Update upstream submodule"
```

## Local Snapshot Workflow

### Collecting Forge Snapshot

Before running regression tests or migrations, populate the local snapshot:

```bash
# Copy ~/.automagik-forge to dev_assets_seed/forge-snapshot/from_home/
./scripts/collect-forge-snapshot.sh

# Verify the copy
ls -la dev_assets_seed/forge-snapshot/from_home/
```

**Important**: The `from_home/` directory is git-ignored to prevent committing secrets or large binaries.

### Baseline Verification

Committed regression artifacts are stored in:
- `docs/regression/baseline/` - Command transcripts and checksums
- `dev_assets_seed/forge-snapshot/from_repo/` - Repository fixtures

## Build Verification

All verification commands pass:

```bash
# ✅ Workspace builds successfully
cargo check --workspace

# ✅ Forge app builds successfully
cargo check -p forge-app

# ✅ pnpm workspace installs successfully
pnpm install

# ✅ Upstream diff audit runs successfully
./scripts/run-upstream-audit.sh
```

## Next Steps

### Task 2 - Backend Extraction & Data Lifting
- [ ] Extract Omni notification system to `forge-extensions/omni/`
- [ ] Extract branch template logic to `forge-extensions/branch-templates/`
- [ ] Extract config v7 to `forge-extensions/config/`
- [ ] Create auxiliary database tables with idempotent migrations
- [ ] Implement service composition layer in `forge-app/src/services/`
- [ ] Resolve upstream integration (dependency vs. workspace member)

### Task 3 - Frontend, CLI, and End-to-End Validation
- [ ] Extract and migrate frontend modifications to `frontend-forge/`
- [ ] Implement dual frontend routing in `forge-app/src/router.rs`
- [ ] Extract Genie automation to `forge-extensions/genie/`
- [ ] Complete CLI integration and regression testing
- [ ] Update build scripts for dual frontend compilation

## Warning: Features Still in Original Locations

**IMPORTANT**: All forge business logic (Omni, branch templates, config v7, Genie) remains in its original locations. This scaffold only provides the structure - feature migration happens in Tasks 2 & 3.

## Open Items

- **Upstream Integration**: Task 2 must resolve how to properly integrate upstream crates (dependency vs. workspace member)
- **Database Migrations**: Auxiliary table schema and data migration scripts needed in Task 2
- **Frontend Build**: Dual frontend compilation logic needed in Task 3
- **CLI Updates**: Package scripts and build pipeline updates needed in Task 3

---

*Foundation scaffold complete. Ready for feature extraction in Task 2.*