# STREAM.md

## Stream Identifier

- Branch: `vk/3714-vk-codeblock-onl`
- Repo: `/home/mcp/code/worktrees/3714-vk-codeblock-onl/_vibe_kanban_repo`
- Working mode: codeblock copy UX update with local-only VK validation and tailnet preview

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

- `staging` remains the intended local development base, but the current stream branch is `vk/3714-vk-codeblock-onl`.
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
  - codeblock-only copy controls are committed on this branch
  - branch pushed to `fork/vk/3714-vk-codeblock-onl`
  - draft PR opened as `#3371`
  - tailnet preview responds with HTTP 200 at `https://mcp-server.tail744c4.ts.net:18444/`
  - local VK backend remains live on `127.0.0.1:4311`
- Pending:
  - human UI smoke test against the tailnet preview
  - PR base branch follow-up if upstream `staging` is restored on GitHub

## Risks / Regression Traps

- Stopping the Vite process on `3002` will break the Tailscale preview
- Repointing the local runtime back to cloud/shared API config is still forbidden
- Assuming the upstream GitHub repo still exposes `staging`; at time of verification only `main` was visible remotely

## Next Safe Steps

1. Keep the Vite session for port `3002` running while the preview is needed.
2. Use the Tailscale preview URL for human QA of the codeblock copy behavior.
3. If the preview is no longer needed, remove it with `tailscale serve --https=18444 off`.
