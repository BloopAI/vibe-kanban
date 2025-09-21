# Task 2 – Backend Feature Extraction to Forge Extensions

## Objective
Move forge-specific backend features out of the forked crates and into the new extension architecture created in Task 1 while keeping upstream untouched. Deliver a compiling backend that routes Omni notifications, branch templates, and config v7 through the composition layer (`forge-app`).

## Prerequisites
- Task 1 scaffold merged and `cargo check --workspace` green.
- `forge-extensions/*` crates and `forge-app` skeleton exist as described in Task 1 documentation.

## In-Scope Work
1. **Omni notification system**
   - Relocate code from `crates/services/src/services/omni` into `forge-extensions/omni` (client, service, types, tests).
   - Remove Omni-specific code from the downstream fork crates; replace with calls to the new extension crate.
2. **Branch template feature**
   - Move branch-template logic (models, helpers, DB access) into `forge-extensions/branch-templates`.
   - Replace the old logic in `crates/db`/`crates/services` with composition hooks that call the extension.
3. **Config v7 upgrade path**
   - Extract the v7 config structs and helpers to `forge-extensions/config`, ensuring `ts-rs` generation still works.
4. **Database migrations**
   - Implement auxiliary tables (`forge_task_extensions`, `forge_project_settings`, `forge_omni_notifications`) and views in `forge-app/migrations/*.sql`.
   - Write a data-migration script (`002_migrate_data.sql`) that copies branch_template data out of upstream tables and nulls the original column (without dropping it yet).
5. **Composition wiring**
   - Flesh out `forge-app/src/services` with a `ForgeServices` container and a `ForgeTaskService` that wraps upstream services, including branch template persistence and Omni trigger stubs.
   - Provide a `/health` route plus `/api/forge/*` endpoints returning JSON placeholders for now (actual behaviour can be filled in Task 3).
6. **Unit tests**
   - Ensure existing Omni tests compile in the new location; add smoke tests for branch template name helpers.
7. **Docs**
   - Update the living preparation doc (`/genie/prep/wish-prep-*.md`) and add migration notes summarising what moved and how to roll back.

## Out of Scope
- Frontend migration (kept for Task 3).
- Genie/Claude automation extraction (unless it blocks compilation; otherwise move in Task 3).
- Removing the `branch_template` column from upstream tables (deferred until after verification of auxiliary table flow).

## Deliverables
- Updated Rust code compiling with functionality wired through extensions.
- SQL migrations in `forge-app/migrations/001_auxiliary_tables.sql` and `002_migrate_data.sql` (with idempotent guards and comments explaining rollback).
- Updated `Cargo.toml` dependencies referencing new crates; upstream crates no longer depend on forge-only code paths.
- Removal of obsolete forge-specific code from original `crates/*` modules (keep only what upstream needs).
- Documentation (`docs/upstream-as-library-foundation.md` or follow-up file) describing backend extraction, migration steps, and manual verification commands.

## Acceptance Checklist
- [ ] `cargo fmt` & `cargo clippy --workspace --all-targets` run clean or deviations documented.
- [ ] `cargo check --workspace` and `cargo test -p forge-extensions-omni` (plus any other new tests) succeed; include command outputs in the PR.
- [ ] Running `sqlx migrate` (or `cargo sqlx migrate run` if configured) against a sqlite dev DB succeeds; provide transcript or describe dry-run steps.
- [ ] No remaining references to forge-specific code under `crates/services/src/services/omni` or equivalent legacy locations.
- [ ] `forge-app` exposes `/api/forge/omni/instances` and `/api/forge/branch-templates/:task_id` routes returning stub JSON responses backed by the extension services.
- [ ] Living doc updated to “Ready for Task 3” with known limitations (e.g., frontend still calling legacy APIs).

## Required Verification Steps (include results in PR notes)
1. `cargo check --workspace`
2. `cargo clippy --workspace --all-targets`
3. `cargo test -p forge-extensions-omni`
4. Migrations dry run (e.g., `cargo sqlx migrate run --dry-run` or manual `sqlite3` commands).
5. `curl` or `httpie` call to the new `/health` and `/api/forge/omni/instances` endpoints served via `cargo run -p forge-app` (it may return stub data but must respond 200).

## Handoff to Next Task
Document any remaining TODOs for:
- Frontend updates referencing the new API routes.
- Genie/Claude integration points.
- Decisions about dropping legacy columns once auxiliary tables are proven.
