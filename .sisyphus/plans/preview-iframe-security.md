# Preview iframe Security Isolation

## TL;DR

> **Quick Summary**: Fix critical security vulnerability where dev server JavaScript can access Vibe Kanban's parent window. Implement double-iframe architecture via proxy server on separate port for origin isolation.
> 
> **Deliverables**: 
> - Preview Proxy server on separate dynamic port
> - Reverse proxy with script injection capability
> - Proxy page HTML with postMessage relay
> - Frontend integration with new proxy architecture
> - Port discovery for dev and prod modes
> 
> **Estimated Effort**: Large (backend + frontend + devops)
> **Parallel Execution**: YES - 3 waves
> **Critical Path**: Task 1 → Task 2 → Task 3 → Task 6 → Task 7

---

## Context

### Original Request
Fix security vulnerability in dev server preview iframe. Currently uses `allow-scripts allow-same-origin` which allows dev server JS to access parent window. Implement double-iframe architecture with proxy on separate port for origin isolation.

### Interview Summary
**Key Decisions**:
- Double iframe architecture (as per user's diagram)
- Same process, two listeners (simpler than separate binary)
- Reverse proxy with script injection
- UI stays in PROD (Vibe Kanban), proxy page only relays postMessage
- Manual testing only

**Research Findings**:
- Current vulnerability: `sandbox="allow-scripts allow-same-origin"` in PreviewBrowser.tsx
- Ports are dynamic (setup-dev-environment.js manages them)
- Existing postMessage: ClickToComponentListener in previewBridge.ts
- Backend is single axum listener, needs restructuring for dual listener

### Metis Review
**Identified Gaps (addressed)**:
- File paths were imprecise → corrected in this plan
- Backend architecture needs clarification → using tokio::spawn for dual listener
- WebSocket proxy is non-trivial → using tokio-tungstenite
- URL handling flow clarified → proxy URL constructed from detected dev server port

---

## Work Objectives

### Core Objective
Isolate dev server preview in a cross-origin iframe to prevent malicious JavaScript from accessing Vibe Kanban's window, cookies, or DOM.

### Concrete Deliverables
- `crates/server/src/preview_proxy/` — New module for proxy server
- `crates/server/src/preview_proxy/proxy_page.html` — Proxy page with postMessage relay
- Modified `crates/server/src/main.rs` — Dual listener setup
- Modified `frontend/src/components/ui-new/views/PreviewBrowser.tsx` — Use proxy iframe
- Modified `frontend/src/components/ui-new/hooks/usePreviewUrl.ts` — Construct proxy URL
- Modified `scripts/setup-dev-environment.js` — Add PREVIEW_PROXY_PORT
- Modified `crates/server/src/routes/config.rs` — Add preview_proxy_port to UserSystemInfo

### Definition of Done
- [ ] `parent.document.cookie` from dev server iframe throws SecurityError (cross-origin)
- [ ] HMR works (edit file → preview updates without full reload)
- [ ] Click-to-component continues to work (postMessage relay)
- [ ] Dev mode works with PREVIEW_PROXY_PORT env var
- [ ] Prod mode auto-assigns proxy port, discoverable via API

### Must Have
- Cross-origin isolation (different ports = different origins)
- HTTP reverse proxy for dev server content
- WebSocket proxy for HMR (Hot Module Replacement)
- postMessage relay for existing functionality
- Script injection placeholder (for future Phase 2 features)

### Must NOT Have (Guardrails)
- ❌ Touch previewBridge.ts ClickToComponentListener (Phase 2)
- ❌ Add DevTools injection (Phase 2)
- ❌ Support multiple simultaneous dev servers per workspace
- ❌ Add SSL/HTTPS support
- ❌ Add proxy caching/optimization
- ❌ Add new frontend npm dependencies
- ❌ Create automated tests
- ❌ Change existing URL detection logic fundamentally

---

## Verification Strategy (MANDATORY)

### Test Decision
- **Infrastructure exists**: YES (cargo test)
- **User wants tests**: NO (manual testing)
- **Framework**: Manual verification

### Manual Verification Procedures

**Security Verification (CRITICAL):**
```bash
# After implementation, in browser console on dev server iframe:
# Press F12 → Select iframe context → Console

parent.document.cookie
# Expected: Uncaught DOMException: Blocked a frame with origin "http://localhost:PROXY_PORT"

window.parent.location.href  
# Expected: Uncaught DOMException: Blocked a frame with origin "http://localhost:PROXY_PORT"
```

**HMR Verification:**
```
1. Start dev server via Vibe Kanban UI
2. Wait for preview to load
3. Edit a source file in the dev server project
4. Observe: Preview should update WITHOUT full page reload
```

**postMessage Verification (Click-to-Component):**
```
1. Ensure dev server project has vibe-kanban-web-companion installed
2. Start dev server, wait for preview
3. Alt+Click on any component in preview
4. Observe: Message should be received, editor should open file
```

**Port Discovery Verification:**
```bash
# Dev mode
PREVIEW_PROXY_PORT=5555 pnpm run dev
# Check: Proxy accessible at http://localhost:5555

# Prod mode
npx vibe-kanban
# Check: GET /api/system/info returns preview_proxy_port field
```

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately):
├── Task 1: Backend - Dual listener infrastructure
└── Task 4: DevOps - Port management setup

Wave 2 (After Wave 1):
├── Task 2: Backend - Proxy page HTML
├── Task 3: Backend - HTTP reverse proxy
└── Task 5: Backend - WebSocket proxy

Wave 3 (After Wave 2):
├── Task 6: Frontend - Proxy iframe integration
└── Task 7: Integration - End-to-end verification

Critical Path: Task 1 → Task 3 → Task 6 → Task 7
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|---------------------|
| 1 | None | 2, 3, 5 | 4 |
| 2 | 1 | 6 | 3, 5 |
| 3 | 1 | 6 | 2, 5 |
| 4 | None | 6 | 1 |
| 5 | 1 | 7 | 2, 3 |
| 6 | 2, 3, 4 | 7 | None |
| 7 | 5, 6 | None | None (final) |

### Agent Dispatch Summary

| Wave | Tasks | Recommended Category |
|------|-------|-------------------|
| 1 | 1, 4 | `quick` for Task 4, `unspecified-high` for Task 1 |
| 2 | 2, 3, 5 | `unspecified-high` for all (Rust work) |
| 3 | 6, 7 | `visual-engineering` for Task 6, `quick` for Task 7 |

---

## TODOs

### Task 1: Backend - Dual Listener Infrastructure

**What to do**:
- Create new module `crates/server/src/preview_proxy/mod.rs`
- Refactor `main.rs` to spawn two tokio tasks for main and proxy listeners
- Add `PREVIEW_PROXY_PORT` env var reading (fallback to port 0 for auto-assign)
- Add `preview_proxy_port` field to `UserSystemInfo` struct in `config.rs`
- Write port file with both ports for MCP discovery

**Must NOT do**:
- Don't add proxy routes yet (Task 2, 3)
- Don't change graceful shutdown logic significantly

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
  - Reason: Significant Rust backend restructuring, requires careful async handling
- **Skills**: `[]`
  - No special skills needed, standard Rust work

**Parallelization**:
- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 1 (with Task 4)
- **Blocks**: Tasks 2, 3, 5
- **Blocked By**: None

**References**:

**Pattern References**:
- `crates/server/src/main.rs:86-128` — Current single listener setup, need to refactor to dual
- `crates/server/src/routes/config.rs:83-122` — UserSystemInfo struct definition

**API/Type References**:
- `crates/server/src/routes/config.rs:UserSystemInfo` — Add `preview_proxy_port: Option<u16>`

**External References**:
- tokio docs: spawning multiple tasks with shared state
- axum docs: running multiple routers

**Acceptance Criteria**:

```bash
# Agent runs after implementation:
cargo build --bin server
# Assert: Compiles without errors

cargo run --bin server &
sleep 3
curl -s http://localhost:$(cat ~/.vibe-kanban/port)/api/system/info | jq '.data.preview_proxy_port'
# Assert: Returns non-null port number
```

**Commit**: YES
- Message: `feat(server): add dual listener infrastructure for preview proxy`
- Files: `crates/server/src/main.rs`, `crates/server/src/preview_proxy/mod.rs`, `crates/server/src/routes/config.rs`

---

### Task 2: Backend - Proxy Page HTML

**What to do**:
- Create `crates/server/src/preview_proxy/proxy_page.html` with:
  - Nested iframe pointing to `/dev-server-entry/`
  - postMessage listener for parent (Vibe Kanban) commands
  - postMessage relay from inner iframe to parent
  - URL parsing from query params (`?target=3000&path=/`)
- Add `GET /proxy` route that serves this HTML

**Must NOT do**:
- Don't add complex UI in proxy page (Phase 2)
- Don't add DevTools functionality
- Keep HTML under 100 lines

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
  - Reason: Rust route + HTML template, requires understanding of postMessage
- **Skills**: `[]`

**Parallelization**:
- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 2 (with Tasks 3, 5)
- **Blocks**: Task 6
- **Blocked By**: Task 1

**References**:

**Pattern References**:
- `frontend/src/utils/previewBridge.ts:59-135` — Existing postMessage protocol to relay
- `frontend/src/utils/StyleOverride.tsx:30-62` — postMessage listener pattern

**External References**:
- MDN: Window.postMessage() API

**Acceptance Criteria**:

```bash
# Agent runs:
cargo run --bin server &
sleep 3
PROXY_PORT=$(curl -s http://localhost:$(cat ~/.vibe-kanban/port)/api/system/info | jq -r '.data.preview_proxy_port')
curl -s "http://localhost:$PROXY_PORT/proxy?target=3000"
# Assert: Returns HTML with iframe src containing "/dev-server-entry/"
# Assert: HTML contains postMessage listener code
```

**Commit**: YES (groups with Task 3)
- Message: `feat(server): add proxy page HTML with postMessage relay`
- Files: `crates/server/src/preview_proxy/proxy_page.html`, `crates/server/src/preview_proxy/mod.rs`

---

### Task 3: Backend - HTTP Reverse Proxy

**What to do**:
- Implement `GET /dev-server-entry/*` route that reverse proxies to target dev server
- Handle all HTTP methods (GET, POST, PUT, DELETE, etc.)
- Forward headers (except Host, add X-Forwarded-* headers)
- Forward request body
- Forward response headers and body (streaming for large responses)
- Inject placeholder `<script>` tag before `</body>` in HTML responses
- Strip CSP and X-Frame-Options headers from proxied responses

**Must NOT do**:
- Don't implement full DevTools injection (placeholder script only)
- Don't cache responses
- Don't modify non-HTML responses

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
  - Reason: Complex HTTP proxying with streaming, header manipulation
- **Skills**: `[]`

**Parallelization**:
- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 2 (with Tasks 2, 5)
- **Blocks**: Task 6
- **Blocked By**: Task 1

**References**:

**Pattern References**:
- `crates/server/src/routes/images.rs:200-260` — Example of serving content with custom headers

**External References**:
- reqwest docs: making HTTP requests
- hyper docs: streaming bodies
- axum docs: custom extractors and responses

**Acceptance Criteria**:

```bash
# Start a simple HTTP server on port 3000 first (e.g., python -m http.server 3000)
# Agent runs:
cargo run --bin server &
sleep 3
PROXY_PORT=$(curl -s http://localhost:$(cat ~/.vibe-kanban/port)/api/system/info | jq -r '.data.preview_proxy_port')
curl -s "http://localhost:$PROXY_PORT/dev-server-entry/?target=3000" | grep -q "<script"
# Assert: Response contains injected script tag
# Assert: HTTP 200 status
```

**Commit**: YES (groups with Task 2)
- Message: `feat(server): implement HTTP reverse proxy for dev server`
- Files: `crates/server/src/preview_proxy/mod.rs`
- Pre-commit: `cargo test --workspace`

---

### Task 4: DevOps - Port Management Setup

**What to do**:
- Modify `scripts/setup-dev-environment.js`:
  - Add `preview_proxy` port allocation (after backend port)
  - Save to `.dev-ports.json`: `{ frontend, backend, preview_proxy }`
  - Add `preview_proxy` CLI command
- Modify `package.json` dev script to export `PREVIEW_PROXY_PORT`
- Add `VITE_PREVIEW_PROXY_PORT` to frontend env

**Must NOT do**:
- Don't change existing frontend/backend port logic
- Don't add complex port management

**Recommended Agent Profile**:
- **Category**: `quick`
  - Reason: Simple JavaScript/JSON changes
- **Skills**: `[]`

**Parallelization**:
- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 1 (with Task 1)
- **Blocks**: Task 6
- **Blocked By**: None

**References**:

**Pattern References**:
- `scripts/setup-dev-environment.js:85-146` — Existing port allocation pattern to extend
- `package.json:16` — Dev script with env vars

**Acceptance Criteria**:

```bash
# Agent runs:
node scripts/setup-dev-environment.js get
# Assert: Output includes "preview_proxy" port

node scripts/setup-dev-environment.js preview_proxy
# Assert: Returns valid port number

cat package.json | grep PREVIEW_PROXY_PORT
# Assert: Dev script exports PREVIEW_PROXY_PORT
```

**Commit**: YES
- Message: `feat(devops): add PREVIEW_PROXY_PORT to port management`
- Files: `scripts/setup-dev-environment.js`, `package.json`

---

### Task 5: Backend - WebSocket Proxy

**What to do**:
- Implement WebSocket upgrade handling for `/dev-server-entry/**` paths
- Proxy WebSocket frames bidirectionally (dev server ↔ client)
- Support common HMR paths: `/_vite/ws`, `/_next/webpack-hmr`, `/ws`, `/sockjs-node`
- Handle connection close gracefully

**Must NOT do**:
- Don't add reconnection logic (browser handles this)
- Don't buffer WebSocket messages

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
  - Reason: WebSocket proxying is non-trivial, requires async stream handling
- **Skills**: `[]`

**Parallelization**:
- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 2 (with Tasks 2, 3)
- **Blocks**: Task 7
- **Blocked By**: Task 1

**References**:

**Pattern References**:
- `crates/server/src/routes/config.rs:509-572` — Existing WebSocket handler pattern
- `crates/server/src/routes/execution_processes.rs` — WebSocket streaming patterns

**External References**:
- tokio-tungstenite docs: WebSocket client/server
- axum docs: WebSocket upgrade handling

**Acceptance Criteria**:

```bash
# Requires a dev server with HMR running on port 3000
# Agent runs:
cargo run --bin server &
sleep 3
PROXY_PORT=$(curl -s http://localhost:$(cat ~/.vibe-kanban/port)/api/system/info | jq -r '.data.preview_proxy_port')

# Test WebSocket upgrade (using websocat if available)
websocat "ws://localhost:$PROXY_PORT/dev-server-entry/_vite/ws?target=3000" --ping-interval 5 -1
# Assert: Connection established (may close if no Vite server, but upgrade should work)
```

**Commit**: YES
- Message: `feat(server): implement WebSocket proxy for HMR`
- Files: `crates/server/src/preview_proxy/mod.rs`
- Pre-commit: `cargo test --workspace`

---

### Task 6: Frontend - Proxy iframe Integration

**What to do**:
- Modify `PreviewBrowser.tsx`:
  - Change iframe src to use proxy URL: `http://localhost:${proxyPort}/proxy?target=${devServerPort}&path=${path}`
  - Keep existing `sandbox` attribute
- Modify `usePreviewUrl.ts` or create new hook:
  - Construct proxy URL from detected dev server URL
  - Get proxy port from API (prod) or env var (dev)
- Add proxy port to config hook or create `usePreviewProxyPort.ts`
- Update `PreviewBrowserContainer.tsx` to pass proxy URL

**Must NOT do**:
- Don't change postMessage handling in frontend (proxy relays it)
- Don't modify ClickToComponentListener

**Recommended Agent Profile**:
- **Category**: `visual-engineering`
  - Reason: Frontend React/TypeScript work with UI component changes
- **Skills**: `["frontend-ui-ux"]`
  - frontend-ui-ux: Component modification pattern

**Parallelization**:
- **Can Run In Parallel**: NO
- **Parallel Group**: Wave 3 (sequential with Task 7)
- **Blocks**: Task 7
- **Blocked By**: Tasks 2, 3, 4

**References**:

**Pattern References**:
- `frontend/src/components/ui-new/views/PreviewBrowser.tsx:310-336` — Current iframe implementation
- `frontend/src/components/ui-new/hooks/usePreviewUrl.ts:81-126` — URL detection hook
- `frontend/src/components/ui-new/containers/PreviewBrowserContainer.tsx:50-54` — URL usage

**API/Type References**:
- `frontend/src/lib/api.ts` — API client for fetching config

**Acceptance Criteria**:

```bash
# Agent runs after building:
pnpm run dev &
sleep 10

# Check that iframe src uses proxy port, not direct dev server
# (Manual verification in browser DevTools)
```

**Manual Verification:**
```
1. Run pnpm run dev
2. Open workspace with dev server configured
3. Start dev server
4. Open DevTools → Elements
5. Find iframe in DOM
6. Assert: src contains "proxy?target=" not direct "localhost:3000"
```

**Commit**: YES
- Message: `feat(frontend): integrate proxy iframe for security isolation`
- Files: `frontend/src/components/ui-new/views/PreviewBrowser.tsx`, `frontend/src/components/ui-new/containers/PreviewBrowserContainer.tsx`, `frontend/src/components/ui-new/hooks/usePreviewUrl.ts`
- Pre-commit: `pnpm run check`

---

### Task 7: Integration - End-to-End Verification

**What to do**:
- Create verification checklist document
- Perform all manual verification steps:
  - Security verification (cross-origin block)
  - HMR verification (hot reload works)
  - postMessage verification (click-to-component works)
  - Port discovery (dev and prod modes)
- Document any issues found
- Fix minor issues if any

**Must NOT do**:
- Don't add automated tests
- Don't implement new features

**Recommended Agent Profile**:
- **Category**: `quick`
  - Reason: Verification and minor fixes only
- **Skills**: `["playwright"]`
  - playwright: For browser verification if needed

**Parallelization**:
- **Can Run In Parallel**: NO
- **Parallel Group**: Wave 3 (final)
- **Blocks**: None
- **Blocked By**: Tasks 5, 6

**References**:

**Test References**:
- Verification commands listed in this plan's "Verification Strategy" section

**Acceptance Criteria**:

**Security Verification:**
```javascript
// In browser console, select iframe context:
parent.document.cookie
// Assert: Throws DOMException with "Blocked a frame" message
```

**HMR Verification:**
```
1. Start Vite dev server via UI
2. Edit src/App.tsx
3. Assert: Preview updates without full page reload
```

**Commit**: NO (verification only)

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1 | `feat(server): add dual listener infrastructure` | main.rs, preview_proxy/mod.rs, config.rs | cargo build |
| 2+3 | `feat(server): add proxy page and HTTP reverse proxy` | preview_proxy/* | cargo test |
| 4 | `feat(devops): add PREVIEW_PROXY_PORT` | setup-dev-environment.js, package.json | node script |
| 5 | `feat(server): implement WebSocket proxy for HMR` | preview_proxy/mod.rs | cargo test |
| 6 | `feat(frontend): integrate proxy iframe` | PreviewBrowser.tsx, etc. | pnpm run check |

---

## Success Criteria

### Verification Commands
```bash
# Security (in browser console on iframe context):
parent.document.cookie  # Expected: SecurityError

# Port discovery (prod mode):
curl /api/system/info | jq '.data.preview_proxy_port'  # Expected: non-null port

# HMR: Edit file → observe hot reload in preview
```

### Final Checklist
- [ ] Cross-origin isolation verified (parent.document.cookie throws error)
- [ ] HMR works (file edit → preview updates)
- [ ] Click-to-component works (Alt+click → editor opens)
- [ ] Dev mode works with PREVIEW_PROXY_PORT
- [ ] Prod mode auto-assigns and exposes proxy port via API
- [ ] No new npm dependencies added to frontend
- [ ] Existing functionality preserved
