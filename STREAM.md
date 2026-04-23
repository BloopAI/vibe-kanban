# STREAM.md

## Stream Identifier

- Branch: `staging`
- Repo: `/home/mcp/code/worktrees/3714-vk-codeblock-onl/_vibe_kanban_repo`
- Working mode: codeblock copy regression fix on staging with local-only VK validation and tailnet preview

## Objective

- Ship codeblock-only copy controls in chat/markdown rendering without disturbing the local-only VK runtime.

## In Scope

- Codeblock-only copy affordance for rendered markdown/code blocks
- Local validation against the running VK install
- Branch PR and a Tailscale-accessible preview for review

## Out of Scope

- Reviving the old cloud-backed board model
- Depending on `api.vibekanban.com` for local board state
- Broad cleanup unrelated to codeblock copy behavior

## Stream-Specific Decisions

- `staging` is currently checked out after the feature branch was merged locally.
- The local install must keep `shared_api_base` disabled.
- The live local backend on `127.0.0.1:4311` remains the backend source for branch previewing.
- The branch preview is served via Tailscale HTTPS at `https://mcp-server.tail744c4.ts.net:18444/`, proxied to the branch frontend on `127.0.0.1:3002`.

## Relevant Files / Modules

- `packages/web-core/src/shared/components/CodeBlockCopyButton.tsx`
- `packages/web-core/src/shared/components/ReadOnlyCodeBlockCopyPlugin.tsx`
- `packages/web-core/src/shared/components/MarkdownPreview.tsx`
- `packages/web-core/src/shared/components/WYSIWYGEditor.tsx`
- PR: `#3371`
- tailnet preview: `https://mcp-server.tail744c4.ts.net:18444/`

## Current Status

- Confirmed:
  - original codeblock-only copy controls were committed and merged into local `staging`
  - branch `vk/3714-vk-codeblock-onl` was pushed to `fork/vk/3714-vk-codeblock-onl`
  - draft PR `#3371` was opened and later closed
  - tailnet preview responds with HTTP 200 at `https://mcp-server.tail744c4.ts.net:18444/`
  - local VK backend remains live on `127.0.0.1:4311`
- In progress:
  - regression fix replaces brittle read-only Lexical DOM scanning with CodeNode mutation/update tracking
  - codeblock copy buttons are visible by default instead of hover-only
  - fixed preview is running from this worktree on `127.0.0.1:3002`
- Pending:
  - commit and push regression fix to `fork/staging`
  - human UI smoke test against the tailnet preview

## Risks / Regression Traps

- Stopping the Vite process on `3002` will break the Tailscale preview.
- A stale Vite process can keep serving the pre-fix frontend even after the source is corrected.
- The old read-only implementation used `querySelectorAll('code.block')`, which did not reliably match Lexical-rendered codeblocks.
- Repointing the local runtime back to cloud/shared API config is still forbidden
- Assuming the upstream GitHub repo still exposes `staging`; at time of verification only `main` was visible remotely

## Next Safe Steps

1. Use the Tailscale preview URL for human QA of the codeblock copy behavior.
2. Commit and push the regression fix to `fork/staging`.
