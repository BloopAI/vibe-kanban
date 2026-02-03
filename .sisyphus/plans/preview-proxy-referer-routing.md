# Preview Proxy: Universal Referer-Based Routing

## TL;DR

> **Quick Summary**: Fix preview proxy to work with ANY dev server framework by using Referer header for routing instead of hardcoded URL patterns.
> 
> **Deliverables**: 
> - Universal catch-all route that extracts target port from Referer
> - Remove hardcoded Next.js/Vite URL patterns
> - Works for ALL frameworks: Next.js, Vite, CRA, Webpack, etc.
> 
> **Estimated Effort**: Quick
> **Root Cause**: Absolute URLs (`/_next/...`, `/@vite/...`) bypass path prefix `/p/{port}/`

---

## Problem Analysis

### Current Broken Flow
1. iframe loads `/p/8080/` → HTML proxied from port 8080
2. HTML contains `<script src="/_next/static/chunk.js">`
3. Browser requests `http://localhost:3005/_next/static/chunk.js`
4. No route matches → 404

### Why Hardcoded Patterns Don't Work
- Next.js: `/_next/static/...`
- Vite: `/@vite/client`, `/src/...`, `/@fs/...`
- CRA/Webpack: `/static/js/...`
- Each framework has different paths → can't hardcode them all

---

## Solution: Referer-Based Routing

### How It Works
1. Browser loads `/p/8080/` → sets Referer for subsequent requests
2. Request comes: `GET /_next/static/chunk.js`
3. Check Referer header: `http://localhost:3005/p/8080/`
4. Extract port 8080 from Referer using regex `/p/(\d+)/`
5. Proxy request to `localhost:8080/_next/static/chunk.js`

### Why This Is Universal
- Works for ANY framework
- No URL rewriting needed
- Browser automatically sends Referer for all subresource requests
- Handles: `<script>`, `<link>`, `<img>`, `fetch()`, CSS `url()`, etc.

---

## TODOs

- [x] 1. Add Referer extraction function

  **What to do**:
  - Add `fn extract_target_from_referer(headers: &HeaderMap) -> Option<u16>`
  - Use regex `/p/(\d+)/` to extract port from Referer header
  - Add `regex` crate to Cargo.toml if not present

  **References**:
  - `crates/server/src/preview_proxy/mod.rs` - add function before `proxy_impl`
  - `crates/server/Cargo.toml` - add `regex = "1"` dependency

  **Acceptance Criteria**:
  ```bash
  cargo build --bin server
  # Assert: Compiles
  ```

  **Commit**: NO (group with task 2)

---

- [x] 2. Add catch-all fallback route

  **What to do**:
  - Add `async fn catchall_proxy(request: Request) -> Response`
  - Extract target port from Referer header
  - If no valid Referer, return 404
  - Call `proxy_impl(target_port, path, request)`
  - Add `.fallback(catchall_proxy)` to router

  **References**:
  - `crates/server/src/preview_proxy/mod.rs:401-409` - router function

  **Acceptance Criteria**:
  ```bash
  cargo build --bin server
  # Assert: Compiles
  ```

  **Commit**: NO (group with task 3)

---

- [x] 3. Remove hardcoded URL rewriting

  **What to do**:
  - Delete `rewrite_absolute_urls` function
  - Remove call to `rewrite_absolute_urls` in `http_proxy_handler`
  - Keep DEVTOOLS_PLACEHOLDER_SCRIPT injection

  **References**:
  - `crates/server/src/preview_proxy/mod.rs:118-139` - function to delete
  - `crates/server/src/preview_proxy/mod.rs:254-255` - call to remove

  **Acceptance Criteria**:
  ```bash
  cargo build --bin server
  cargo test --workspace
  pnpm run check
  # All pass
  ```

  **Commit**: YES
  - Message: `fix(preview-proxy): use Referer-based routing for universal framework support`
  - Files: `crates/server/src/preview_proxy/mod.rs`, `crates/server/Cargo.toml`

---

## Verification

After implementation, test with Next.js dev server:
1. Start Vibe Kanban: `pnpm run dev`
2. Start Next.js project dev server on port 8080
3. Open preview in Vibe Kanban
4. Check DevTools Network tab: all `/_next/...` requests should return 200
5. Page should render with styles and scripts

---

## Why This Is Better

| Approach | Hardcoded Patterns | Referer-Based |
|----------|-------------------|---------------|
| Next.js | ✅ (hardcoded) | ✅ |
| Vite | ❌ (need more patterns) | ✅ |
| CRA | ❌ (need more patterns) | ✅ |
| Custom bundler | ❌ | ✅ |
| Maintenance | High (update for each framework) | Zero |
