# Task 1 – Foundation Scaffold for Upstream-as-Library Migration

## Objective
Establish the minimal but working project scaffold for the upcoming migration so that forge-specific code can be extracted in later tasks without touching upstream sources. This task sets up directories, workspace membership, build wiring, and documentation so the repository compiles with the new layout in place.

## Scope
- Represent upstream `vibe-kanban` as an isolated git submodule (or sandbox-safe placeholder with restoration instructions).
- Create empty-but-compiling crates/modules for `forge-extensions/*` and `forge-app/`.
- Update the workspace manifests and tooling (Cargo, pnpm) to recognise the new structure.
- Provide developer documentation describing the scaffold, submodule restoration steps, and next-task expectations.
- Ensure the repository builds (`cargo check --workspace`) after restructuring, with no behavioural feature moves yet.

## Non-Goals
- Do **not** move any Omni, branch-template, config v7, Genie, or frontend logic in this task.
- Do **not** modify files under `upstream/` beyond the minimal placeholder allowed below.
- Do **not** introduce runtime behavioural changes besides the new composition skeleton needed for compilation.

## Deliverables
1. `upstream/` contains either:
   - the actual git submodule reference (if the environment allows `git submodule add`), **or**
   - a README that documents the exact commands to initialise the submodule locally and explicitly states that no upstream files were modified.
2. New directory layout in place:
   - `forge-extensions/{omni,branch-templates,config,genie}/` with `Cargo.toml` and a minimal `src/lib.rs` that compiles.
   - `forge-app/` with `Cargo.toml`, `src/main.rs`, `src/router.rs` (stub returning `/health`), and `src/services/mod.rs` scaffolding.
   - `forge-overrides/` exists (empty except for `.gitkeep` or README describing its future use).
3. Root `Cargo.toml` updated:
   - Includes the new crates in `workspace.members`.
   - Shared dependencies moved into `[workspace.dependencies]` as needed for compilation.
4. Scripts/tooling touched by the restructure (e.g., Makefile targets, `pnpm-workspace.yaml`) updated so they reference the new paths without breaking existing commands.
5. Documentation update:
   - append to `/docs` or create `/docs/upstream-as-library-foundation.md` summarising the structure, how to restore the submodule, and listing next-step tasks.

## Acceptance Checklist (must be demonstrably satisfied)
- [ ] Repository builds: `cargo check --workspace` completes successfully and output snippet is provided in the PR description / testing section.
- [ ] No files inside `upstream/` (other than placeholder README instructions) are changed.
- [ ] `pnpm install` still completes (or a note is given if not run due to sandbox limits) and `pnpm-workspace.yaml` recognises the new frontend location.
- [ ] `forge-app` binary runs `cargo check` (`cargo check -p forge-app`). The binary may only log/print but must compile.
- [ ] README or docs call out open items for Task 2 (feature extraction) and explicitly warn that forge features are still in their original locations.

## Required Verification Steps
Include in your PR/testing notes:
1. `cargo check --workspace`
2. `cargo check -p forge-app`
3. Result of attempting the submodule command (`git submodule add …`) or confirmation that the README fallback was written.

## References
- `@genie/wishes/restructure-upstream-library-wish.md` – canonical architecture plan.
- `.claude/commands/prompt-to-wish.md` – describes living-document workflow; update prep doc status to reflect completion of this scaffold stage.

## Handoff to Next Task
The follow-up task will consume this scaffold to migrate backend features (Omni, branch templates, config). List any blockers discovered (e.g., missing dependencies, build quirks) in the documentation so Task 2 can address them immediately.
