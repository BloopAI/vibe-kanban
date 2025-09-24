# WISH: Upstream-as-Library Completion (100/100 Target)

**Status:** IN_PROGRESS (Score: 88/100)

## 🎯 Objective
Elevate the newly merged PR-21 foundation to a production-ready upstream-as-library architecture that scores a perfect 100/100 by finishing extraction, wiring, validation, and documentation without modifying `upstream/` sources.

## 📊 Scoreboard & Gap Radar
| Track | Current | Target | Delta |
|-------|---------|--------|-------|
| Core Tasks | 40/40 | 40/40 | +0 |
| Code Quality | 22/25 | 25/25 | +3 |
| Testing Coverage | 16/20 | 20/20 | +4 |
| Documentation | 8/10 | 10/10 | +2 |
| Risk Mitigation | 2/5 | 5/5 | +3 |
| **Total** | **88/100** | **100/100** | **+12** |

**Scorekeeping Rule:** After each completed phase, increment the score and commit with message `feat: phase-<letter> complete (<new-score>/100)`.

## ✅ Success Criteria
- `upstream/` remains untouched; all forge logic lives in extension crates or `forge-app`.
- Forge app composes upstream services, migrates data into auxiliary tables, and serves `/` (forge) & `/legacy` (upstream) frontends.
- Omni, branch templates, and Config v7 run exclusively through extension crates backed by idempotent migrations.
- SQLx cache regenerated; unit, integration, E2E, and regression suites pass with captured evidence.
- Documentation & runbooks cover migration, rollback, upstream sync, and risk mitigations.

## ❌ Never Do Boundaries
- Modify files inside `upstream/` submodule.
- Reintroduce forked copies of upstream crates or frontend assets in root workspace.
- Ship migrations that are non-idempotent or lack rollback coverage.
- Skip regression/rollback drills prior to sign-off.

## 🛠️ Work Phases & Tasks

### Phase A – Architecture Hardening (+3 → 88)
- [x] **A1 Workspace Bridging:** Point workspace members to `upstream/crates/*`, removing duplicate crates while keeping extensions in `forge-extensions/*`.
- [x] **A2 Deployment Composition:** Update `forge-app/src/services/mod.rs` to initialize services from upstream deployment/config rather than stub values.
- [x] **A3 Migration Relocation:** Move PR-22 auxiliary migrations into `forge-app/migrations`, ensure paths & IDs align, and delete redundant upstream copies.

### Phase B – Data & Service Integrity (+3 → 91)
- [ ] **B1 Branch Templates:** Integrate PR-22 trigger + sync pattern via extension service with shared `SqlitePool`.
- [ ] **B2 Config Extraction:** Re-export config via `forge-extensions/config`, adjust upstream imports, verify `pnpm run generate-types` parity.
- [ ] **B3 Omni Integration:** Wire Omni service to real credentials/config from upstream deployment; remove duplicate logic from upstream routes in favor of extension adapters.

### Phase C – Frontend Completion (+3 → 94)
- [ ] **C1 Forge UI Port:** Populate `frontend-forge/` with forge-specific components, build pipeline, and asset embedding.
- [ ] **C2 Dual Routing:** Serve upstream bundle at `/legacy` and forge bundle at `/` via `forge-app` using `RustEmbed` or static file proxy.
- [ ] **C3 API Integration:** Implement remaining forge-specific API endpoints for CLI + UI integration.

### Phase D – Validation & Testing (+4 → 98)
- [ ] **D1 SQLx Cache:** Regenerate `.sqlx/*` with merged migrations.
- [ ] **D2 Unit & Integration Coverage:** Add tests for Omni, Branch Templates, Config, and forge routes; target ≥80% coverage delta.
- [ ] **D3 Frontend Quality:** Resolve lint warnings, run `pnpm run lint -- --max-warnings=0`, `pnpm run test:e2e`.
- [ ] **D4 Regression Harness:** Execute `./scripts/run-forge-regression.sh backend|frontend|cli|all`, archive logs + checksums under `docs/regression/latest/`.

### Phase E – Documentation & Risk Closure (+2 → 100)
- [ ] **E1 Runbooks:** Produce `docs/runbooks/production-migration.md`, `rollback-procedures.md`, and update divergence analysis + sign-off report.
- [ ] **E2 Risk Drills:** Perform rollback rehearsal (migrate → snapshot → revert → reapply) and upstream sync dry run (`cd upstream && git fetch && git status`); document outcomes.

## 📂 Deliverables
- Updated extension crates (`forge-extensions/*`), `forge-app`, `frontend-forge`.
- Purged fork duplicates; workspace relies on `upstream/` for shared code.
- `forge-app/migrations` with auxiliary schema + sync triggers.
- `.sqlx` cache refreshed.
- Test & regression logs under `docs/regression/latest/` with checksums.
- Documentation bundle (runbooks, sign-off, divergence audit).
- Progress log `analysis/perfect-migration.log` summarizing each completed phase.

## 🧪 Verification Commands
```bash
# Build & Tests
cargo fmt --all
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
pnpm run lint -- --max-warnings=0
pnpm run test:e2e

# SQLx & Migrations
DATABASE_URL=sqlite:dev_assets/db.sqlite cargo sqlx prepare --merged
sqlx migrate run --source forge-app/migrations
sqlx migrate revert --source forge-app/migrations

# Regression & Drill
./scripts/run-forge-regression.sh backend
./scripts/run-forge-regression.sh frontend
./scripts/run-forge-regression.sh cli
(cd upstream && git fetch && git status)
```

## 📈 Reporting Protocol
- Log ongoing findings in `analysis/perfect-migration.log`.
- After each phase completion, commit with format `feat: phase-<letter> complete (<score>/100)`.
- Capture regression outputs & rollback evidence for reviewer hand-off.

Let’s complete the migration, prove independence, and lock in a zero-diff future with a full 100/100 score.
