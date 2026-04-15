# Repo Identity

## What This Repo Is

- This repository is a Vibe Kanban fork and local operator workspace used to develop, validate, and harden changes before they are proposed upstream.
- It is not the canonical upstream repository. `origin/main` is the upstream truth this fork should stay close to.

## Operating Model

- Feature work happens on short-lived task branches.
- Each branch is validated in the local Vibe Kanban instance before it is proposed to `staging`.
- `staging` is the integration branch for normal work.
- Production promotion happens by PR from `staging` into `main` after repo checks, branch freshness, and human QA.

## Why The Continuity Docs Exist

- `STATE.md` carries repo-wide truth.
- `STREAM.md` carries the current branch scope.
- `HANDOFF.md` makes the next pickup safe.
- `DELTA.md` keeps a compact ledger of meaningful checkpoints.

## Current Adoption Notes

- The repo now adopts the playbook's `staging` plus `main` model in docs and CI.
- GitHub still needs the actual `staging` branch created and protected for the model to be fully active.
