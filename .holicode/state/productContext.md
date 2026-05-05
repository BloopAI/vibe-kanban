---
mb_meta:
  projectID: "vibe-kanban-fork"
  version: "0.1.0"
  lastUpdated: "2026-05-05"
  templateVersion: "1.0"
  fileType: "productContext"
---

# Vibe Kanban (ciekawy fork) - Product Context

## Why We're Building This
- Upstream `BloopAI/vibe-kanban` appears to be on hold or being sunset; users who rely on it
  (especially self-hosted users) need a maintained fork that keeps the product viable.
- Upstream v0.1.44 sunset the projects/organizations UI even though the backend still supports
  it (commit `97123d526`). Self-hosted deployments lose value without that UI; the fork keeps it.
- Frontier LLM capabilities (Claude Opus 4.7 with extended thinking + 1M context, GPT 5.5,
  newest OpenAI/Anthropic releases) move fast; a maintained fork lets the user keep the tool
  in step with what models can actually do, including proper CoT/thinking streaming in the UI.

## Target Users
1. **The user (primary maintainer)**: runs Vibe Kanban for personal/team workflows including
   the HoliCode framework and AI coding sessions; wants the latest model support, particularly
   reliable extended-thinking streaming.
2. **Self-hosted Vibe Kanban operators**: small teams/individuals running the server who want
   the full feature surface (projects/organizations) and modern executor support.
3. **AI coding agents (incl. Claude Code, OpenCode)**: consume Vibe Kanban as their task/issue
   tracker via MCP and expect modern model selection / CoT presentation.

## Problem Solving
- Restores feature surface that upstream removed but is still valuable to self-hosters
  (project/org UI revert).
- Adds newest model families end-to-end (config UI, executors, streaming pipeline) so the
  tool stays useful as model capabilities expand.
- Provides a release pipeline owned by the fork so the user is no longer blocked on upstream
  publishing cadence.

## Key Benefits
- Fork remains a drop-in replacement for upstream Vibe Kanban with feature parity-or-better
  for self-hosted use.
- Modern model support (extended thinking, 1M context) is first-class instead of bolted on.
- Independent release cadence under user's own scope (npm, GitHub Releases, Docker).

## How It Should Work (High-Level Flow)
The fork lives at `github.com/ciekawy/vibe-kanban`, periodically merges from
`BloopAI:main`, and ships its own releases. New model support follows the existing patterns
in `crates/executors/` and the model-config UI; reverts of unwanted upstream sunset patches
remain isolated commits so future merges stay manageable. HoliCode at `.holicode/` drives
planning, with VK MCP holding lightweight ticket records and `.holicode/specs/` holding
detailed specs and TDs.
