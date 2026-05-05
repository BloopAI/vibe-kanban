---
mb_meta:
  projectID: "vibe-kanban-fork"
  version: "0.1.0"
  lastUpdated: "2026-05-05"
  templateVersion: "1.1"
  fileType: "activeContext"
---

# Vibe Kanban (ciekawy fork) - Active Context

## Current Focus
HoliCode bootstrap session (VIB-59). State init complete. Five tracker issues seeded
(VIB-59, VIB-60, VIB-61, VIB-62, VIB-63) and linked to the existing Claude-CoT issue
(VIB-46). Next: orchestration session picks up from handoff
`.holicode/handoff/active/2026-05-05-orchestration.md` and begins spec-workflow on the
seed issues. No code changes outside `.holicode/` in this session.

### Priority Tasks
- [VIB-59] Init HoliCode + Orchestration in this fork (this very task — finish handoff doc).
- [VIB-60] Own Release Pipeline under `ciekawy` scope (npm + GitHub Releases + Docker).
- [VIB-61] Latest Model Support umbrella; decomposed into:
  - [VIB-46] Claude Opus 4.7 + 1M context + CoT display (existing, related).
  - [VIB-62] GPT 5.5 across executors.
  - [VIB-63] OpenCode executor parity.

## Ready to Start
- Write the orchestration handoff doc and dispatch the first orchestration session.
- Spec-workflow / orchestrate-story on VIB-46 (well-scoped) for early momentum.
- Intake-triage on VIB-60 (release pipeline) to confirm npm scope + Docker question.

## Blockers
- Open scoping questions (npm scope, Docker yes/no, OpenCode CoT scope) — see Open Questions.
  Non-blocking for spec-workflow start; orchestrator should surface to maintainer.

## Recent Changes
<!-- APPEND-ONLY — Add new entries at the top, format: [ISO_DATE ISSUE_ID] description -->
- [2026-05-05 VIB-59] Created VIB-59, VIB-60, VIB-61, VIB-62, VIB-63 in VK project
  `Vibe Kanban` (id `fd38a3f1-…`). Linked VIB-61 ↔ VIB-46 (`related`). Tagged VIB-59
  `documentation`, VIB-60/VIB-61 `feature`.
- [2026-05-05 VIB-59] HoliCode `.holicode/` structure initialized in worktree
  `vk/b210-i-only-initializ`; templates/scripts copied from `/home/coder/vibe-kanban/.holicode/`,
  state files populated with project-specific context.
- [2026-05-05 VIB-51] (sibling worktree `vk/7e73-apparently-along`, already done) Reverted
  upstream UI sunset of projects/organizations (`f007d0c11`, `2d19cfe40`); patched remote
  `deploy.sh` with `--force-recreate --remove-orphans` (`b1204f0cb`). Treat VIB-51 as
  merged-pending-merge into the fork's `main`.

## Immediate Next Steps
<!-- APPEND-ONLY — Add new entries at the top -->
1. Resume / spawn an orchestration session per
   `.holicode/handoff/active/2026-05-05-orchestration.md`.
2. Begin spec-workflow / orchestrate-story on VIB-46 (Claude CoT/Opus 4.7), as it is the
   most concretely-scoped child of VIB-61 and unblocks the architectural pattern
   (`context_window` field separation) that VIB-63 will reuse.
3. Intake-triage on VIB-60 (release pipeline) to lock the open questions before any code.

## Open Questions/Decisions
<!-- APPEND-ONLY — Prefix with tracker ID -->
- [VIB-60] Confirm npm scope (`@ciekawy/...`?) and Docker registry/tag scheme.
- [VIB-60] Maintain a `CHANGELOG-fork.md` or rely on git/tags?
- [VIB-63] Scope of OpenCode parity: at minimum match Opus 4.7 + GPT 5.5; decide whether
  to also harmonize CoT streaming there (umbrella says yes — confirm).
- [VIB-51] Schedule the merge of `vk/7e73-apparently-along` into fork `main`
  (not blocking other work, but worth landing soon).

## Active Handoffs
### Outgoing
- 2026-05-05 → orchestration session: `.holicode/handoff/active/2026-05-05-orchestration.md`
  (entry-point for the next session; see `delegationContext.md`).

### Incoming
- (none)
