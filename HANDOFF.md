# HANDOFF.md

## What Changed This Session

- Investigated the codeblock-only copy regression after the staged change did not expose usable copy controls.
- Replaced the brittle read-only Lexical DOM selector path with CodeNode mutation/update tracking.
- Made codeblock copy buttons visible by default in both read-only Lexical content and markdown preview rendering.

## What Is True Right Now

- This worktree is on `staging`, tracking `fork/staging`.
- The previous PR `#3371` was closed after the work was merged to `staging`.
- The regression fix is currently local and must still be committed and pushed.
- Formatter, focused lint, and focused web-core typecheck pass:
  - `pnpm run format`
  - `NODE_OPTIONS=--max-old-space-size=4096 pnpm --filter @vibe/web-core run check`
  - `pnpm --filter @vibe/ui run lint`
- The fixed preview is running on `127.0.0.1:3002` and responds through Tailscale.

## Known Good Access Points

- Local VK server:
  - `http://127.0.0.1:4311`
- Tailnet preview route:
  - `https://mcp-server.tail744c4.ts.net:18444/`
- Worktree:
  - `/home/mcp/code/worktrees/3714-vk-codeblock-onl/_vibe_kanban_repo`

## What The Next Agent Should Do

- Commit and push the regression fix to `fork/staging`.
- Human-smoke a rendered codeblock through the tailnet preview.

## What The Next Agent Must Not Do

- Do not assume the old `code.block` DOM selector path works for read-only Lexical content.
- Do not reopen PR `#3371`; it was intentionally closed after merging the earlier staged change.
- Do not repoint the local runtime to cloud/shared API config.

## Verification Required Before Further Changes

- `git status --short --branch`
- `pnpm run format`
- `NODE_OPTIONS=--max-old-space-size=4096 pnpm --filter @vibe/web-core run check`
- `pnpm --filter @vibe/ui run lint`
- Human UI smoke test against a codeblock in the tailnet preview or local VK runtime

## Verification Status From This Session

- Formatter, focused web-core check, and UI package lint passed.
- Full repo validation was not rerun for this targeted regression step.

## Session Metadata

- Branch: `staging`
- Repo: `/home/mcp/code/worktrees/3714-vk-codeblock-onl/_vibe_kanban_repo`
- Focus: codeblock-only copy regression fix
