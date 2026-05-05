---
mb_meta:
  projectID: "vibe-kanban-fork"
  version: "0.1.0"
  lastUpdated: "2026-05-05"
  templateVersion: "1.0"
  fileType: "projectbrief"
---

# Vibe Kanban (ciekawy fork) - Project Brief

## Core Goal
Maintain a usable, self-hosted-friendly fork of `BloopAI/vibe-kanban` after upstream effectively
went on hold/sunset, landing a focused set of valuable improvements (own release pipeline,
latest LLM model support including Claude Opus 4.7 with extended thinking and 1M context, and
GPT 5.5; OpenCode executor parity with newest models) while remaining periodically rebaseable
on upstream `main`.

## Scope
- Track upstream `BloopAI/vibe-kanban` and merge in changes when they appear.
- Maintain the user's fork at `github.com/ciekawy/vibe-kanban` as the publishing surface for
  releases (npm CLI, Docker images, GitHub releases) under the user's own scope.
- Keep self-hosted projects/organizations features alive in the UI (upstream sunset them in
  v0.1.44; the fork has reverted that on branch `vk/7e73-apparently-along` via VIB-51 work).
- Add support for newest LLM models across all relevant executors (Anthropic, OpenAI,
  OpenCode, etc.) with proper streaming of extended thinking / chain-of-thought rendered
  consistently with how default models render their CoT.
- Use HoliCode for orchestration and Vibe Kanban itself (this very repo) as the issue tracker
  via the Vibe Kanban MCP server.

## Key Milestones
1. HoliCode bootstrap + initial orchestration session (this task) (2026-05-05)
2. Own release pipeline operational under ciekawy scope (npm + GitHub Releases + Docker) (2026-Q2)
3. Latest model support landed (Claude Opus 4.7 + 1M context + extended-thinking streaming;
   GPT 5.5; OpenCode executor parity) (2026-Q2/Q3)

## Success Metrics
- Release pipeline runnable on demand: green CI -> publishable artifacts in <30 min
- Newest models selectable in UI for every relevant executor with parity in CoT rendering
- Periodic upstream merges remain low-conflict (revert/rebase-friendly patches only)

## Scope Boundaries
### In Scope
- Maintaining the fork's `main` branch with periodic merges from `BloopAI/vibe-kanban`.
- Reverts of upstream sunset commits that disable features still useful to self-hosters.
- Executor and UI work to add new model families and their special features
  (extended thinking, 1M context, etc.) consistently across executors.
- Owned release pipeline (npm package, GitHub Releases, Docker tags under user's scope).
- Documentation and AGENTS.md updates as needed for the fork.

### Out of Scope
- Brand-new features that diverge significantly from upstream's architecture and would
  make rebases painful.
- Reviving or significantly extending features that upstream has actively removed unless
  there is a clear self-hosted user value (and even then, prefer revert + minimal upkeep).
- Maintaining BloopAI's published artifacts; this fork publishes under its own scope.
