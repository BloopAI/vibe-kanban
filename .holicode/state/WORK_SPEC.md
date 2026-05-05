# Work Specification: Vibe Kanban (ciekawy fork)

**Status:** active
**Created:** 2026-05-05
**Last Updated:** 2026-05-05
**Total Context Size:** <2KB (optimized for AI context loading)

## Issue Tracker
**This file is a LOCAL CACHE of issue tracker state.**
- The configured issue tracker is the single source of truth for task management.
- Tracker: `vibe_kanban` (this very project, dogfooded). MCP server: `vibe_kanban`.
- VK organization: `vibe kanban` (slug `vibe-kanban`, id `c09339ba-7ab5-48cf-9cf4-1cc9888b6ca2`).
- VK project: `Vibe Kanban` (id `fd38a3f1-c54c-4282-8194-b975de43d5ff`) — single shared project for both upstream and fork work; ID prefix `VIB-`.
- Run `issue-sync` skill to refresh this cache from the configured tracker in `.holicode/state/techContext.md`.
- Local specs in `.holicode/specs/` are for technical details only.

## Project Overview
Maintained fork of `BloopAI/vibe-kanban` (`github.com/ciekawy/vibe-kanban`) keeping
self-hosted features alive after upstream's apparent hold/sunset, plus an own release
pipeline and modern LLM-model support across executors.

## Features (Epics)
<!-- Issue tracker epics linked here by issue-sync skill -->
- VIB-61: Latest Model Support — Claude (Opus 4.7, 1M, CoT streaming), GPT 5.5,
  OpenCode parity (To do) [Type: epic / umbrella]

## Active Stories
<!-- Issue tracker stories linked here by issue-sync skill -->
- VIB-46: Enable chain-of-thought display for all Claude models and custom agent profiles —
  covers Opus 4.7, 1M context, architectural separation of `context_window` from model ID
  (To do) [Type: story, Related-to: VIB-61, has its own parent VIB-? upstream]
- VIB-62: GPT 5.5 model support across applicable executors (To do)
  [Type: story, Parent: VIB-61]
- VIB-63: OpenCode executor: latest-model parity (Opus 4.7 incl. 1M, GPT 5.5) +
  CoT streaming (To do) [Type: story, Parent: VIB-61]

## Current Tasks
<!-- Issue tracker tasks linked here by issue-sync skill -->
- VIB-59: Initialize HoliCode state + orchestration for the fork (In progress) [Type: task]
  - State init done in this session. Remaining: handoff doc + first orchestration run.
- VIB-60: Set up own release pipeline for the fork (npm + GitHub Releases + Docker)
  (To do) [Type: task]

## Completed
<!-- Completed issues linked here by issue-sync skill -->
- VIB-51 (sibling worktree `vk/7e73-apparently-along`): Revert UI sunset of projects/orgs
  (`f007d0c11` README banner revert, `2d19cfe40` route revert) + remote `deploy.sh` patch
  with `--force-recreate --remove-orphans` (`b1204f0cb`). Effectively done; pending merge
  into fork `main`. [Type: task, Status in tracker: In progress]

## Technical Design Documents
<!-- TD tracker summaries and local TD paths linked here by issue-sync skill -->
- (none yet — first TD likely belongs to the architectural change in VIB-46
  (separate `context_window` field from model ID))

## Implementation Status
### Completed Components
- HoliCode framework files in this worktree under `.holicode/` (state, templates, scripts,
  manifest copied from `/home/coder/vibe-kanban/.holicode/`).
- VIB-51 reverts (in sibling worktree, pending merge).

### In Progress Components
- `.holicode/handoff/active/2026-05-05-orchestration.md` — handoff doc to spin up the first
  orchestration session.

### Planned Components
- `crates/executors/src/executors/claude.rs` (lines 275-298) — model definitions, add
  Opus 4.7 entries, separate `context_window` field (per VIB-46).
- `packages/web-core/src/shared/lib/aggregateEntries.ts` — thinking aggregation, ensure
  no executor-gating (VIB-46).
- `packages/web-core/src/features/workspace-chat/ui/DisplayConversationEntry.tsx` (lines
  660-706) — thinking rendering across all executors (VIB-46, VIB-63).
- OpenCode executor crate — model list refresh + CoT normalization (VIB-63).
- OpenAI / Codex executors — GPT 5.5 entries (VIB-62).
- `npx-cli/package.json` + `.github/workflows/` — own release pipeline (VIB-60).

## Hierarchy Map
```
├── VIB-61 (umbrella): Latest Model Support
│   ├── VIB-46 (related, existing): Claude CoT/Opus 4.7/1M-context architecture
│   ├── VIB-62: GPT 5.5 across executors
│   └── VIB-63: OpenCode executor parity
├── VIB-59: Init HoliCode + Orchestration (this session)
└── VIB-60: Own Release Pipeline
```

## Context Optimization Notes
- **Tracker First**: All IDs above are real VK simple IDs in the existing "Vibe Kanban" project.
- **Local Cache**: This file is a reference cache updated by tracker sync workflows.
- **Component SPECs**: Technical contracts remain co-located with code where relevant.
- **Cross-references**: VIB-46 is owned by an upstream parent issue; treat it as a related
  child of VIB-61 for orchestration purposes (it is the Claude-side delivery of VIB-61).

## Validation Status
- [ ] All chunks validate against .holicode/specs/SCHEMA.md
- [ ] Hierarchical links resolve correctly
- [ ] No orphaned specifications
- [ ] Component SPECs exist for all referenced components

---
*This manifest is a LOCAL CACHE maintained by HoliCode workflows.*
*The configured issue tracker is the PRIMARY source of truth.*
