# VK_WORKFLOW.md

## Canonical Paths

- Canonical Vibe Kanban source repo:
  - `/home/mcp/_vibe_kanban_repo`
- Live service wrapper:
  - `/home/mcp/.local/bin/vibe-kanban-serve`
- Live deployed binary:
  - `/home/mcp/.local/bin/vibe-kanban-server-cleanfix`
- Live VK state:
  - `/home/mcp/.local/share/vibe-kanban`
- VK-created workspaces/worktrees:
  - `/home/mcp/code/worktrees/...`

## What Is And Is Not Canonical

- The only canonical VK codebase is `/home/mcp/_vibe_kanban_repo`.
- `/home/mcp/code/worktrees/...` contains task-specific worktrees and agent workspaces, not the canonical product repo.
- `/home/mcp/code/vibe-kanban` does not exist and must not be treated as a real repo path.
- `/home/mcp/code/vibe-kanban-orchestrator` is a different repo.

## External Agent Rule

- If an external Codex agent is fixing Vibe Kanban itself, start it from:
  - `/home/mcp/_vibe_kanban_repo`
- Only start an agent inside `/home/mcp/code/worktrees/...` when the task is explicitly about a specific workspace or reproducing behavior inside that exact worktree.

## Deploy Model

Production does not run directly from the repo checkout.

The deploy flow is:

1. edit code in `/home/mcp/_vibe_kanban_repo`
2. build `/home/mcp/_vibe_kanban_repo/target/release/server`
3. copy that binary to `/home/mcp/.local/bin/vibe-kanban-server-cleanfix`
4. restart `vibe-kanban.service`

Implications:

- repo changes are not live until build + copy + restart happen
- merging to `staging` does not automatically deploy production
- worktrees are not production

## Branch Rules

- `staging` is the integration base for ongoing VK work
- `main` is the production branch and the only valid base for direct live hotfixes
- production changes should be deliberate, not accidental side effects of branch movement
- do not assume the currently running binary matches GitHub or even the current repo commit unless you verify it

## Hotfix Procedure

Use this path when you must change the live VK service before the normal
`staging -> main` promotion flow.

1. Start from the latest `origin/main`, not `staging`.
2. Create a dedicated `hotfix/<scope>` branch with the smallest possible scope.
3. Reproduce and validate the fix in an isolated local or detached deploy worktree.
4. Build and deploy from a clean worktree, never from a dirty canonical checkout.
5. Record the deployed commit, binary hash, and validation in `LIVE_DEPLOYMENT.json`.
6. Merge the hotfix into `main`.
7. Backfill the exact fix into `staging` immediately so future rebases do not lose it.

Rules:

- Do not bundle unrelated cleanup into a hotfix.
- Do not deploy directly from a feature branch or local-only rescue branch.
- Do not leave a live-only fix sitting outside both `main` and `staging`.

## Live Deploy Guardrails

Before restarting `vibe-kanban.service`:

- check whether live coding agents are still running
- assume a restart will kill those runs
- either wait for them to finish or explicitly accept that interruption

Safe deploy rules:

- prefer deploying from a clean detached worktree rooted at the intended branch head
- do not deploy from `/home/mcp/_vibe_kanban_repo` when it is dirty
- verify `/api/info`, `/`, and the current `/assets/index-*.js` after every swap
- treat service restarts during active agent execution as destructive actions, not neutral maintenance

## Post-merge Worktree Cleanup

- When VK tracks a PR for a workspace and that PR is merged into `staging`, VK now archives the workspace and deletes its worktree folder immediately instead of waiting for the normal archived-workspace cleanup window.
- Moving a linked local issue into `In Staging` archives its linked local workspace and cleans up its worktree folder.
- If the workspace has an archive script, VK waits for that archive script to finish before deleting the worktree folder.
- The workspace row remains in VK; reopening it recreates the worktree if needed.
- This immediate cleanup path depends on tracked PR metadata, so untracked or non-`staging` merges still follow the regular cleanup schedule.
- Pinned workspaces keep the existing exception because they are not auto-archived on merge.

## Agent Startup Checklist

Give every new VK-fixing agent these files first:

- `/home/mcp/_vibe_kanban_repo/HANDOFF.md`
- `/home/mcp/_vibe_kanban_repo/STATE.md`
- `/home/mcp/_vibe_kanban_repo/DELTA.md`
- `/home/mcp/_vibe_kanban_repo/VK_WORKFLOW.md`

Then tell the agent:

- canonical repo is `/home/mcp/_vibe_kanban_repo`
- do not treat `/home/mcp/code/worktrees/...` as canonical unless the task is workspace-specific
- production is copy-deployed from the built binary, not live-from-checkout
- do not touch tmux or unrelated Codex sessions

## Stable Working Model

- Source of truth for code: `/home/mcp/_vibe_kanban_repo`
- Source of truth for deployed runtime: `vibe-kanban.service` + `/home/mcp/.local/bin/vibe-kanban-server-cleanfix`
- Source of truth for live board data: `/home/mcp/.local/share/vibe-kanban/db.v2.sqlite`
- Source of truth for task-specific workspace state: `/home/mcp/code/worktrees/...`

If an agent is unclear which place to use, it should default to `/home/mcp/_vibe_kanban_repo` and only move to a worktree when the task explicitly requires it.
