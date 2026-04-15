# Repo Identity

## What This Repo Is

- This repository is a Vibe Kanban fork and local operator workspace used to develop, validate, and harden changes before they are proposed upstream.
- It is not the canonical upstream repository. `origin/main` is the upstream truth this fork should stay close to.

## Operating Model

- Feature work happens on short-lived task branches.
- Each branch is validated in the local Vibe Kanban instance before it is proposed upstream.
- Upstream promotion happens by PR into `main` after local validation, repo checks, and branch freshness.

## Why The Continuity Docs Exist

- `STATE.md` carries repo-wide truth.
- `STREAM.md` carries the current branch scope.
- `HANDOFF.md` makes the next pickup safe.
- `DELTA.md` keeps a compact ledger of meaningful checkpoints.

## Current Adaptation From Ops Playbook

- The playbook assumes `main` plus `staging`. This repo currently has `main` only.
- Until a dedicated `staging` branch exists, the local validation gate replaces the staging branch for normal feature work.
- If a future `staging` branch is introduced, the docs and CI should be updated so normal work starts from `origin/staging` and promotion into `main` happens from that branch.
