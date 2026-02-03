# WebSocket HMR Cookie Fix

## TL;DR

> **Quick Summary**: Fix WebSocket HMR failures by adding cookie-based port detection as fallback.
> 
> **Deliverables**: 
> - Cookie-based port detection for WebSocket requests
> - Fallback chain: Referer → Cookie → 404
> 
> **Estimated Effort**: Quick
> **Root Cause**: WebSocket connections don't send Referer headers with `/p/{port}/` pattern

---

## Problem Analysis

### Current Broken Flow
1. Browser loads `/p/8080/` → HTML proxied
2. Next.js initializes WebSocket: `ws://localhost:3005/_next/webpack-hmr`
3. WebSocket request has NO Referer with `/p/{port}/` pattern
4. `catchall_proxy` returns 404 → HMR fails

### Why Referer Doesn't Work for WebSocket
- HTTP subresource requests (`<script>`, `fetch()`) → Referer header ✅
- WebSocket upgrade requests → No useful Referer ❌

---

## Solution: Cookie-Based Fallback

### How It Works
1. When `/p/{port}/` is accessed, set cookie `_vk_proxy_target={port}`
2. Browser stores cookie
3. WebSocket request includes cookie (same origin)
4. `catchall_proxy` tries Referer first, then cookie
5. Extracts port from cookie → proxy to correct dev server

---

## TODOs

- [x] 1. Add cookie-based port detection

  **What to do**:
  - Add `PROXY_TARGET_COOKIE` constant
  - Add `extract_target_from_cookie()` function
  - Add `add_target_cookie()` function
  - Modify `proxy_target_root` and `proxy_target_path` to set cookie
  - Modify `catchall_proxy` to try Referer then cookie

  **File**: `crates/server/src/preview_proxy/mod.rs`

  **Acceptance Criteria**:
  ```bash
  cargo build --bin server
  # Assert: Compiles
  ```

  **Commit**: YES
  - Message: `fix(preview-proxy): add cookie-based port detection for WebSocket HMR`
  - Files: `crates/server/src/preview_proxy/mod.rs`

---

## Verification

After implementation:
1. Start Vibe Kanban: `pnpm run dev`
2. Start Next.js dev server
3. Open preview in Vibe Kanban
4. Check DevTools Network tab: WebSocket connections should succeed
5. Edit a file → HMR should work (no full page reload)
