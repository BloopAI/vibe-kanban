# Workspace Polling Regression Draft

Status: local draft only, do not post upstream yet

## Purpose

This document is the prepared upstream issue/PR draft for the workspace-loading memory regression that reproduced after the earlier kanban/sidebar fix.

It stays local until the fix has enough real-world soak time in the live local install.

## Issue Draft

Title:

`Workspace views still poll branch/task state aggressively and can re-bloat the local server`

Body:

We found a second frontend request-churn path after fixing the earlier kanban/sidebar polling regression.

The remaining problem was in mounted workspace views:

- `packages/web-core/src/shared/hooks/useBranchStatus.ts`
- `packages/web-core/src/shared/hooks/useTaskWorkspaces.ts`

These hooks were still polling every 5 seconds by default. Under real workspace usage, that caused repeated calls to:

- `/api/workspaces/:id/git/status`
- `/api/workspaces?task_id=...`

In practice this produced:

- repeated git status load across mounted workspaces
- fallback `git inspection timeout` warnings
- server memory growth over time
- eventually severe UI slowness / hangs in the local install

This did not show up in the first round of synthetic HTTP stress tests because those tests did not reproduce the mounted browser/UI polling pattern.

### Reproduction

Open several active workspaces and leave them mounted in the UI, especially workspaces with linked tasks and git panels. Over time the server begins to accumulate memory and workspace status endpoints start slowing down.

### Fix

Stop the default 5-second refetch loop in both hooks and make them behave like cached state unless a caller explicitly opts into polling.

Applied changes:

- disable default `refetchInterval`
- add `staleTime`
- disable `refetchOnWindowFocus`
- disable `refetchOnMount`

### Validation

After the fix, repeated browser-like workspace-open traffic against the previously problematic workspaces stayed roughly in the `32–51 MB` range with no endpoint failures and no fresh timeout/slow-query churn in logs.

### Notes

This appears to be a repo bug in the frontend request strategy, not an install-specific or local-only-config-specific issue.

## PR Draft

Title:

`fix: stop workspace status polling churn`

Summary:

- stop default 5-second polling in `useBranchStatus`
- stop default 5-second polling in `useTaskWorkspaces`
- add cache/staleness settings so mounted workspace UI does not hammer git/task endpoints continuously

Validation summary:

- single problematic workspace loop: stable, no failures
- three problematic workspaces together: stable, no failures
- three workspaces plus workspace summaries load: stable, no failures

## Gate Before Posting Upstream

Do not open or reopen an upstream issue/PR until all of these are true:

1. The local install has survived more than one real working session without re-bloating.
2. `Wire Ntfy`, `Vk::Ops`, and `OpsPB::Linking in reports` all open normally in actual UI use.
3. No fresh `git inspection timeout`, `PoolTimedOut`, or similar server churn appears in logs during normal use.
4. We are confident this is not hiding a deeper remaining leak path.

