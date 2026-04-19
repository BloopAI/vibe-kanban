# HANDOFF.md

## What Changed This Session

- Added codeblock-only copy controls for rendered markdown/code blocks in the shared web-core rendering path.
- Committed the branch changes as `d6ba4cdc2` with message:
  - `Add codeblock-only copy controls and sync related UI updates`
- Pushed branch `vk/3714-vk-codeblock-onl` to `fork`.
- Opened draft PR `#3371`:
  - `https://github.com/BloopAI/vibe-kanban/pull/3371`
- Started a branch frontend preview on `127.0.0.1:3002` against the live local VK backend on `127.0.0.1:4311`.
- Exposed that branch preview to the tailnet via:
  - `https://mcp-server.tail744c4.ts.net:18444/`

## What Is True Right Now

- The live local install is the source of truth.
- `/api/info` reports `shared_api_base: null`.
- The board/issue data now lives locally in `~/.local/share/vibe-kanban/db.v2.sqlite`.
- `staging` is still the intended local development base, but this stream is on `vk/3714-vk-codeblock-onl`.
- The git worktree is clean.
- The Tailscale preview currently depends on a live Vite process bound to `3002`.

## Known Good Access Points

- Local VK server:
  - `http://127.0.0.1:4311`
- Branch frontend preview:
  - `http://127.0.0.1:3002`
- Tailnet preview:
  - `https://mcp-server.tail744c4.ts.net:18444/`
- Draft PR:
  - `https://github.com/BloopAI/vibe-kanban/pull/3371`

## What The Next Agent Should Do

- Keep the local-only behavior intact unless there is an explicit reason to reintroduce remote/cloud functionality.
- If human QA is still needed, use the tailnet preview URL before tearing down the `3002` Vite process.
- If previewing must be restarted, use:
  - `cd packages/local-web && __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=mcp-server.tail744c4.ts.net BACKEND_PORT=4311 FRONTEND_PORT=3002 pnpm exec vite --host 0.0.0.0 --port 3002`
- Prefer verifying issue/workspace/project behavior through the live local API before assuming the UI is right.

## What The Next Agent Must Not Do

- Do not re-enable `VK_SHARED_API_BASE` or `VK_SHARED_RELAY_API_BASE` for the local install.
- Do not assume the tailnet preview will survive if the Vite process exits.
- Do not overwrite the existing Tailscale serve mappings on `18080`, `18081`, or `18443` unless explicitly asked.

## Verification Required Before Further Changes

- `curl -s http://127.0.0.1:4311/api/info` and confirm `shared_api_base` is `null`
- `git status --short --branch`
- `tailscale serve status`
- Task-specific validation for any runtime or UI change

## Verification Status From This Session

- `pnpm install`
- `pnpm run format`
- `pnpm --filter @vibe/web-core run check`
- `pnpm --filter @vibe/ui run lint`
- `curl -I http://127.0.0.1:3002` returned `200 OK`
- `curl -kI https://mcp-server.tail744c4.ts.net:18444/` returned `200 OK`
- `tailscale serve status` shows `https://mcp-server.tail744c4.ts.net:18444/ -> http://127.0.0.1:3002`

## Session Metadata

- Branch: `vk/3714-vk-codeblock-onl`
- Repo: `/home/mcp/code/worktrees/3714-vk-codeblock-onl/_vibe_kanban_repo`
- Focus: codeblock copy UX, PR publication, and Tailscale-accessible preview
