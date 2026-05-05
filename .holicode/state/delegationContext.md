---
mb_meta:
  projectID: "vibe-kanban-fork"
  version: "0.1.0"
  lastUpdated: "2026-05-05"
  templateVersion: "1.0"
  fileType: "delegationContext"
---

# Delegation Context - Vibe Kanban (ciekawy fork)

## Decision Delegation Settings

### Business Decisions
- **Default Mode**: require_human_approval
- **Delegated to AI**: false
- **Approval Roles**: [Product_Owner (= the user)]
- **Delegation Scope**: []
- **Explicit Opt-outs**: []

### Technical Decisions
- **Default Mode**: require_human_approval
- **Delegated to AI**: false
- **Approval Roles**: [Architect / Tech_Lead (= the user)]
- **Delegation Scope**: []
- **Explicit Opt-outs**: []

### UI/Design Decisions
- **Default Mode**: require_human_approval
- **Delegated to AI**: false
- **Approval Roles**: [Designer / UX_Lead (= the user)]
- **Delegation Scope**: []
- **Explicit Opt-outs**: []

### Autonomous Roles

#### TPM (Tech Project Manager)
- **Enabled**: false
- **Cadence**: on_demand

## Maturity Indicators

### Business Context
- **Quality Level**: medium
  (clear high-level goals from the user; specific success metrics for the new model work
  still to be defined per executor)
- **Assessment Date**: 2026-05-05
- **Indicators**:
  - [x] Clear problem statement exists
  - [ ] Success metrics defined (per-executor parity criteria still to write)
  - [x] Stakeholders identified (single primary maintainer)
  - [x] Constraints documented (revert/rebase-friendly, ts-rs round-trip)
  - [x] Scope boundaries clear

### Technical Architecture
- **Maturity Level**: defined
  (architecture inherited from upstream, well-understood; only incremental changes planned)
- **Assessment Date**: 2026-05-05
- **Indicators**:
  - [x] Architecture patterns established (inherited from upstream Vibe Kanban)
  - [x] Technology stack finalized (Rust workspace + React/TS)
  - [x] Security model defined (trusted-key auth for remote)
  - [ ] Performance requirements clear (need explicit numbers for streaming/CoT for new models)
  - [x] Operational model documented (self-hosted via Docker / npx CLI)

### Team Experience
- **Level**: expert (single maintainer with deep familiarity with the codebase)
- **With HoliCode**: intermediate
- **Domain Expertise**: expert (LLM tooling, Rust, React)
- **AI Collaboration**: expert

## Delegation History
<!-- Track when and why delegation settings changed -->

### 2026-05-05 - Initial Setup
- All decisions default to human approval (single-maintainer fork).
- No delegations configured.
- Reason: New project initialization in this fork; orchestration session has not yet run.
  Re-evaluate after first orchestration cycle.

## Notes
- Delegation requires explicit opt-out with documented reasoning.
- Orchestration continues in a follow-up session per:
  `.holicode/handoff/active/2026-05-05-orchestration.md`.
- Handoff file path: `.holicode/handoff/active/2026-05-05-orchestration.md`.
- Regular review recommended (monthly/quarterly).
