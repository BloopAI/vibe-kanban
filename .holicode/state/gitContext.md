---
mb_meta:
  projectID: "vibe-kanban-fork"
  version: "0.1.0"
  lastUpdated: "2026-05-05"
  templateVersion: "1.0"
  fileType: "gitContext"
---

# Git Context - Vibe Kanban (ciekawy fork)

## Current Branch
- **Branch**: vk/b210-i-only-initializ
- **Type**: feature (HoliCode bootstrap worktree)
- **Created**: pre-existing worktree branch, used here for HoliCode init only
- **Last Switch**: 2026-05-05

## Recent Commits (Last 5)
<!-- Keep only the 5 most recent commits -->
1. **613d34f8a**: `Merge branch 'BloopAI:main' into main` - upstream merge
2. **f4b0fd955**: `chore: bump version to 0.1.32` - 2026-pre
3. **1b43c06c7**: `fix(ci): pin aws-lc-sys to 0.37.0 to fix Windows cross-compilation (#3186)`
4. **3d8f35743**: `Reimplement zoom via font-size scaling in Tauri desktop app (Vibe Kanban) (#3175)`
5. **91a2353c2**: `chore(server): log request context for api 5xx errors (#3182)`

## Recent Branch Operations (Last 5)
<!-- Keep only the 5 most recent branch operations -->
1. **2026-05-05**: Working in worktree `vk/b210-i-only-initializ` for HoliCode bootstrap (no commits yet from this session).
2. **prior**: Worktree `vk/7e73-apparently-along` carries VIB-51 work
   (`f007d0c11` revert README banner, `2d19cfe40` revert route sunset, `b1204f0cb` deploy.sh fix).

## Active Branches
<!-- List currently active branches -->
- `main` - Default branch (tracks merges from upstream `BloopAI/vibe-kanban:main`)
- `vk/b210-i-only-initializ` - this worktree (HoliCode bootstrap)
- `vk/7e73-apparently-along` - VIB-51 worktree (UI sunset reverts + deploy.sh patch),
  effectively done, pending merge into fork `main`

## Uncommitted Changes
- **Count**: many `.holicode/**` files added by this session
- **Status**: Working directory contains new HoliCode framework + state files; nothing
  outside `.holicode/` is touched.

## Remote Status
- **Remote**: origin (`git@github.com:ciekawy/vibe-kanban.git`)
- **Upstream Remote**: upstream (`https://github.com/BloopAI/vibe-kanban.git`) — fetch only
- **Push Status**: not yet pushed for this session
- **Pull Status**: up to date with origin for `vk/b210-i-only-initializ` as of 2026-05-05
- **Offline Mode**: false

## PR Status
<!-- Current PR information if any -->
- **Open PRs**: 0 (this session writes no commits and opens no PRs)
- **Draft PRs**: 0
- **Ready for Review**: 0

## Release History
<!-- Track recent releases and their status -->

### Recent Releases
| Version | Date | Type | Status | Notes |
|---------|------|------|--------|--------|
| 0.1.32 | upstream | minor | released (upstream) | current version on fork main |
| 0.1.44 | upstream | minor | released (upstream) | sunset projects/org UI; fork reverts that |

### Pending Release
- Next Version: TBD (own pipeline not yet stood up)
- Planned Date: 2026-Q2
- Pending Changes:
  - Features: 0 published from fork yet
  - Fixes: 0 published from fork yet
  - Breaking Changes: 0

## CI/CD Status
<!-- Track CI/CD pipeline health and recent runs -->

### Pipeline Health
- Inherits upstream `.github/workflows/`; fork has no own publish pipeline yet.

### Recent CI Runs
| PR/Branch | Status | Duration | Timestamp | Issues |
|-----------|--------|----------|-----------|---------|
| main | inherited | n/a | 2026-05-05 | upstream-driven |

### Known CI Issues
- Flaky Tests: []
- Environment Issues: []
- Dependencies Issues: aws-lc-sys pinned to 0.37.0 for Windows cross-compile (upstream `1b43c06c7`).

## Deployment Status
<!-- Track deployment states across environments -->

### Environments
| Environment | Version | Last Deploy | Status | Health |
|-------------|---------|-------------|--------|--------|
| Self-hosted (fork) | TBD | TBD | TBD | TBD |

### Deployment History
- (none recorded for the fork yet)

## Configuration
- **User Name**: Szymon Stasik
- **User Email**: szymon.stasik@gmail.com
- **Default Branch**: main
- **Commit Convention**: Conventional Commits
- **Branch Convention**: `vk/<short-id>-<slug>` (and `vk/<vk-id>-<slug>` once VK IDs exist)

## Notes
<!-- Any important notes about Git state -->
- Periodic merges from `upstream/main` (BloopAI) into fork `main` are the norm; keep all
  patches revert/rebase-friendly.
- The fork uses git worktrees under `/var/tmp/vibe-kanban/worktrees/` for parallel agent
  sessions. This very session lives in `b210-i-only-initializ/`.
- Main checkout at `/home/coder/vibe-kanban/` is a sibling, not the same checkout as this
  worktree; templates were copied from there into this worktree's `.holicode/` to make the
  worktree self-contained.
