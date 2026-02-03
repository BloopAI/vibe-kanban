# Click-to-Component: Inspect Mode for Preview Browser

## TL;DR

> **Quick Summary**: Add an inspect mode to the preview browser that lets users click any element in the previewed app, detect its React component hierarchy (using bippy for fiber introspection), and paste the component context into the workspace chat input — replicating react-grab's output format.
>
> **Deliverables**:
> - Bippy IIFE bundle (hook installer + core fiber utilities) vendored into Rust proxy
> - Click-to-component detection script injected into proxied HTML
> - Second injection point in Rust proxy (after `<head>` for bippy hook, before `</body>` for detection script)
> - Inspect mode toolbar button + overlay highlighting in preview
> - Zustand store for cross-component data flow (preview → chat)
> - Auto-paste of component context markdown into chat input
> - Mobile iframe ref support
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 3 waves
> **Critical Path**: Task 1 → Task 3 → Task 4 → Task 6 → Task 7

---

## Context

### Original Request

User wants a "click-to-component" feature for the preview browser: click a toolbar button to enter inspect mode, click any element in the iframe preview, detect the React component stack (like react-grab), and paste the info into the workspace chat.

### Interview Summary

**Key Discussions**:
- **Cross-component data flow**: Zustand store (`useInspectModeStore`) bridges preview container and chat box — both are deeply nested with no shared parent
- **Inspect mode behavior**: Auto-exit after single click (click → paste → inspect off)
- **Output format**: react-grab style — HTML preview + component stack with file paths
- **Non-React fallback**: Show DOM info (tag, id, className) + "no React component detected"
- **Mobile iframe**: Currently missing `ref` — needs one for inspect mode toggle messaging

**Research Findings**:
- **bippy architecture**: Two separate modules needed:
  - `install-hook-only.iife.js` (~2.5KB IIFE) — installs `__REACT_DEVTOOLS_GLOBAL_HOOK__` before React loads
  - `bippy` core (14KB IIFE) — provides `getFiberFromHostInstance`, `getDisplayName`, `isCompositeFiber`, `traverseFiber`, `isInstrumentationActive`
  - `bippy/source` (19KB ESM, NOT IIFE) — provides `getOwnerStack`, `normalizeFileName`, `isSourceFile`. Has external dependency on `@jridgewell/sourcemap-codec`
- **Bundle strategy**: We need to create a custom IIFE bundle of `bippy/source` + its dependency because no pre-built IIFE exists. Use esbuild to bundle `getOwnerStack`, `normalizeFileName`, `isSourceFile` into a self-contained IIFE alongside bippy core
- **react-grab's `getElementContext()`**: The function we're replicating — calls `getFiberFromHostInstance(element)` → `getOwnerStack(fiber)` → formats with `getHTMLPreview()` + stack frames
- **Existing protocol**: `proxy_page.html` already relays `source: 'click-to-component'` messages. `ClickToComponentListener` class in `previewBridge.ts` handles the frontend side
- **Existing injection**: `devtools_script.js` is injected before `</body>` via `include_str!()` in `mod.rs`. New bippy hook must inject after `<head>` (before React loads)

### Metis Review

**Identified Gaps** (addressed):
- **bippy/source has no IIFE build**: Resolved — Task 1 creates a custom esbuild bundle
- **Two injection points needed**: Resolved — Task 3 adds `<head>` injection in Rust proxy
- **Mobile iframe missing ref**: Resolved — Task 8 adds ref
- **Cross-component data flow**: Resolved — Zustand store pattern (Task 6)
- **Non-React fallback**: Resolved — detection script handles missing fiber gracefully (Task 4)

---

## Work Objectives

### Core Objective

Enable users to inspect React components in the preview iframe and paste component context (HTML preview + component stack with file paths) into the workspace chat, replicating react-grab's output.

### Concrete Deliverables

- `scripts/build-bippy-bundle.mjs` — esbuild script to create vendored bippy IIFE
- `crates/server/src/preview_proxy/bippy_bundle.js` — vendored bippy IIFE (hook + core + source)
- `crates/server/src/preview_proxy/click_to_component_script.js` — detection/overlay/messaging script
- Updated `crates/server/src/preview_proxy/mod.rs` — dual injection points
- `frontend/src/stores/useInspectModeStore.ts` — Zustand store
- Updated `PreviewBrowser.tsx` — inspect mode button
- Updated `PreviewBrowserContainer.tsx` — inspect mode orchestration
- Updated `SessionChatBoxContainer.tsx` — auto-paste from store

### Definition of Done

- [x] Clicking inspect button → clicking element in preview → component info appears in chat input
- [x] Non-React elements show DOM fallback info
- [x] Inspect mode auto-exits after click
- [x] Mobile preview also supports inspect mode
- [x] `cargo check --workspace` passes
- [x] `pnpm run check` passes (frontend type checks)

### Must Have

- Bippy hook injected BEFORE React loads (after `<head>`)
- Detection script injected AFTER DOM ready (before `</body>`)
- react-grab-style output format with HTML preview + component stack
- Auto-exit inspect mode after single click
- Visual overlay on hovered elements during inspect mode
- Graceful fallback for non-React elements

### Must NOT Have (Guardrails)

- DO NOT support Vue, Svelte, or Angular — React only
- DO NOT use CDN links for bippy — vendor via `include_str!()`
- DO NOT modify old `PreviewPanel.tsx` — workspace UI only
- DO NOT add npm dependencies to the Rust crates — bippy is bundled as a static JS file
- DO NOT create automated tests — no frontend test framework exists
- DO NOT commit changes unless user explicitly asks
- DO NOT over-engineer the overlay — simple colored border is sufficient
- DO NOT add `bippy` as a frontend npm dependency — it runs inside the proxied iframe, not in Vibe Kanban's React app

---

## Verification Strategy

> **UNIVERSAL RULE: ZERO HUMAN INTERVENTION**
>
> ALL tasks are verified by agent-executed QA scenarios using Playwright and Bash tools.

### Test Decision

- **Infrastructure exists**: NO (no frontend test framework)
- **Automated tests**: NO
- **Framework**: none
- **Agent-Executed QA**: ALWAYS (primary verification method)

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately):
├── Task 1: Build bippy IIFE bundle (esbuild script)
├── Task 2: Create useInspectModeStore (Zustand)
└── Task 5: Add inspect mode button to toolbar

Wave 2 (After Task 1):
├── Task 3: Add dual injection points in Rust proxy (depends: 1)
└── Task 4: Create click-to-component detection script (depends: 1)

Wave 3 (After Wave 2 + Tasks 2, 5):
├── Task 6: Wire up PreviewBrowserContainer inspect mode (depends: 2, 3, 4, 5)
├── Task 7: Wire up SessionChatBoxContainer auto-paste (depends: 6)
└── Task 8: Add iframeRef to mobile iframe (depends: 6)

Final:
└── Task 9: Integration verification & cargo/pnpm checks (depends: all)
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|---------------------|
| 1 | None | 3, 4 | 2, 5 |
| 2 | None | 6 | 1, 5 |
| 3 | 1 | 6 | 4 |
| 4 | 1 | 6 | 3 |
| 5 | None | 6 | 1, 2 |
| 6 | 2, 3, 4, 5 | 7, 8 | None |
| 7 | 6 | 9 | 8 |
| 8 | 6 | 9 | 7 |
| 9 | 7, 8 | None | None (final) |

### Agent Dispatch Summary

| Wave | Tasks | Recommended Agents |
|------|-------|-------------------|
| 1 | 1, 2, 5 | 3x parallel: quick (Task 2, 5), unspecified-high (Task 1) |
| 2 | 3, 4 | 2x parallel: quick (Task 3), deep (Task 4) |
| 3 | 6, 7, 8 | Sequential: deep (Task 6), quick (Task 7), quick (Task 8) |
| Final | 9 | quick (Task 9) |

---

## IMPORTANT: Git State Pre-Requisite

**Before ANY task begins, the executor MUST ensure the local branch matches the remote:**

```bash
git checkout vdmkotai/dev-mode-updates
git reset --hard origin/vdmkotai/dev-mode-updates
```

**WHY**: The proxy files (`crates/server/src/preview_proxy/`) exist ONLY on the remote branch `origin/vdmkotai/dev-mode-updates`. Local HEAD diverged due to a rebase. Without this reset, Tasks 3 and 4 will fail because `mod.rs`, `devtools_script.js`, and `proxy_page.html` won't exist on disk.

**Verify after reset:**
```bash
ls crates/server/src/preview_proxy/
# Expected: mod.rs  devtools_script.js  proxy_page.html
```

---

## TODOs

- [x] 0. Sync local branch with remote

  **What to do**:
  - Run `git checkout vdmkotai/dev-mode-updates`
  - Run `git reset --hard origin/vdmkotai/dev-mode-updates`
  - Verify `ls crates/server/src/preview_proxy/` shows `mod.rs`, `devtools_script.js`, `proxy_page.html`

  **Must NOT do**:
  - Do NOT create a new branch
  - Do NOT commit anything

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`git-master`]
    - `git-master`: Git branch operations

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Must run FIRST before all other tasks
  - **Blocks**: All tasks (1-9)
  - **Blocked By**: None

  **References**:
  - Remote branch: `origin/vdmkotai/dev-mode-updates` at commit `39142ebb`
  - Local HEAD is at `e25ed66e` (diverged)

  **Acceptance Criteria**:
  - [x] `git branch --show-current` → `vdmkotai/dev-mode-updates`
  - [x] `ls crates/server/src/preview_proxy/mod.rs` → file exists
  - [x] `ls crates/server/src/preview_proxy/devtools_script.js` → file exists
  - [x] `ls crates/server/src/preview_proxy/proxy_page.html` → file exists

  **Agent-Executed QA Scenarios**:

  ```
  Scenario: Local branch matches remote after reset
    Tool: Bash
    Preconditions: Git repo at /Users/vkotai/work/vibe-kanban
    Steps:
      1. Run: git checkout vdmkotai/dev-mode-updates
      2. Run: git reset --hard origin/vdmkotai/dev-mode-updates
      3. Run: git log --oneline -1
      4. Assert: output contains "39142ebb" or matches remote HEAD
      5. Run: ls crates/server/src/preview_proxy/
      6. Assert: output contains "mod.rs", "devtools_script.js", "proxy_page.html"
    Expected Result: Local branch synchronized with remote
    Evidence: git log and ls output captured
  ```

  **Commit**: NO

---

- [x] 1. Build vendored bippy IIFE bundle

  **What to do**:
  - Install `bippy@0.5.28` and `esbuild` as dev dependencies: `pnpm add -D bippy@0.5.28 esbuild`
  - Create `scripts/build-bippy-bundle.mjs` — an esbuild script that:
    1. Creates a tiny entrypoint file that imports and re-exports the functions we need from both `bippy` and `bippy/source`
    2. Bundles it as a self-contained IIFE with `globalName: 'VKBippy'`
    3. Outputs to `crates/server/src/preview_proxy/bippy_bundle.js`
  - The bundle must export these functions on `window.VKBippy`:
    - From `bippy`: `getFiberFromHostInstance`, `getDisplayName`, `isCompositeFiber`, `traverseFiber`, `isInstrumentationActive`, `installRDTHook` (or `safelyInstallRDTHook`)
    - From `bippy/source`: `getOwnerStack`, `normalizeFileName`, `isSourceFile`
  - The IIFE must ALSO call `installRDTHook()` immediately on load (so the hook is set up before React runs). Look at `install-hook-only.iife.js` — it calls setup at module level. Our bundle should do the same.
  - Add a `pnpm` script: `"build:bippy-bundle": "node scripts/build-bippy-bundle.mjs"`
  - Run the script and verify the output file exists and is a valid IIFE
  - The generated `bippy_bundle.js` should be committed to the repo (it's a vendored artifact used by `include_str!()`)

  **Must NOT do**:
  - Do NOT add bippy as a runtime dependency to the frontend — it only runs inside the proxied iframe
  - Do NOT use CDN links
  - Do NOT manually copy-paste bippy source code — use esbuild bundling

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []
    - No special skills needed — standard Node.js/esbuild task

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 5)
  - **Blocks**: Tasks 3, 4
  - **Blocked By**: Task 0

  **References**:

  **Pattern References**:
  - `crates/server/src/preview_proxy/devtools_script.js` — Existing vendored JS pattern (loaded via `include_str!()`)
  - `/Users/vkotai/work/react-grab/node_modules/.pnpm/bippy@0.5.28_@types+react@19.2.7_react@19.2.1/node_modules/bippy/dist/install-hook-only.iife.js` — The 2.5KB IIFE that installs the React DevTools hook. Our bundle must replicate this behavior (install hook on load) PLUS export core functions.
  - `/Users/vkotai/work/react-grab/node_modules/.pnpm/bippy@0.5.28_@types+react@19.2.7_react@19.2.1/node_modules/bippy/dist/index.iife.js` — The 14KB core IIFE that exports `Bippy.*` functions. Shows the pattern for IIFE global exports.

  **API/Type References**:
  - `bippy` package exports: `getFiberFromHostInstance`, `getDisplayName`, `isCompositeFiber`, `traverseFiber`, `isInstrumentationActive`, `installRDTHook`, `safelyInstallRDTHook`
  - `bippy/source` package exports: `getOwnerStack` (async, returns `Promise<StackFrame[]>`), `normalizeFileName`, `isSourceFile`, `StackFrame` type

  **External References**:
  - bippy npm: `https://www.npmjs.com/package/bippy` — React fiber inspection library by aidenybai
  - esbuild IIFE format: `https://esbuild.github.io/api/#format-iife` — `format: 'iife'` + `globalName: 'VKBippy'`

  **WHY Each Reference Matters**:
  - `install-hook-only.iife.js`: Shows exactly how hook installation works at module level — our bundle must do the same
  - `index.iife.js`: Shows the IIFE export pattern (`var Bippy = function(exports) { ... }({})`) — our bundle follows similar structure
  - `devtools_script.js`: Shows how vendored JS is already used in the proxy via `include_str!()`

  **Acceptance Criteria**:
  - [x] `scripts/build-bippy-bundle.mjs` exists and runs without errors
  - [x] `node scripts/build-bippy-bundle.mjs` produces `crates/server/src/preview_proxy/bippy_bundle.js`
  - [x] The output file is a valid IIFE (starts with `(function` or `var VKBippy`)
  - [x] The output file size is under 50KB
  - [x] `window.VKBippy.getFiberFromHostInstance` is a function in the bundle
  - [x] `window.VKBippy.getOwnerStack` is a function in the bundle
  - [x] `window.VKBippy.isInstrumentationActive` is a function in the bundle
  - [x] The bundle auto-installs the React DevTools hook on load (grep for `__REACT_DEVTOOLS_GLOBAL_HOOK__`)

  **Agent-Executed QA Scenarios**:

  ```
  Scenario: esbuild script produces valid bippy bundle
    Tool: Bash
    Preconditions: bippy@0.5.28 and esbuild installed as devDeps
    Steps:
      1. Run: node scripts/build-bippy-bundle.mjs
      2. Assert: exit code 0
      3. Run: ls -la crates/server/src/preview_proxy/bippy_bundle.js
      4. Assert: file exists, size < 50KB
      5. Run: head -5 crates/server/src/preview_proxy/bippy_bundle.js
      6. Assert: output shows IIFE pattern or globalName assignment
      7. Run: grep -c "getFiberFromHostInstance" crates/server/src/preview_proxy/bippy_bundle.js
      8. Assert: count > 0
      9. Run: grep -c "getOwnerStack" crates/server/src/preview_proxy/bippy_bundle.js
      10. Assert: count > 0
      11. Run: grep -c "__REACT_DEVTOOLS_GLOBAL_HOOK__" crates/server/src/preview_proxy/bippy_bundle.js
      12. Assert: count > 0 (hook installation code present)
    Expected Result: Self-contained IIFE with all required exports
    Evidence: File listing and grep output captured

  Scenario: Bundle can be loaded in a browser context
    Tool: Bash (node eval)
    Preconditions: bippy_bundle.js exists
    Steps:
      1. Run: node -e "const fs = require('fs'); const code = fs.readFileSync('crates/server/src/preview_proxy/bippy_bundle.js', 'utf8'); try { new Function(code); console.log('VALID JS'); } catch(e) { console.log('INVALID:', e.message); }"
      2. Assert: output is "VALID JS"
    Expected Result: Bundle is syntactically valid JavaScript
    Evidence: Node eval output captured
  ```

  **Commit**: YES (groups with Task 3, 4)
  - Message: `feat(preview-proxy): add vendored bippy bundle for React fiber inspection`
  - Files: `scripts/build-bippy-bundle.mjs`, `crates/server/src/preview_proxy/bippy_bundle.js`, `package.json`, `pnpm-lock.yaml`
  - Pre-commit: `node scripts/build-bippy-bundle.mjs`

---

- [x] 2. Create useInspectModeStore (Zustand)

  **What to do**:
  - Create `frontend/src/stores/useInspectModeStore.ts`
  - Zustand store with the following state:
    ```typescript
    interface InspectModeState {
      isInspectMode: boolean;
      setInspectMode: (active: boolean) => void;
      toggleInspectMode: () => void;
      pendingComponentMarkdown: string | null;
      setPendingComponentMarkdown: (markdown: string | null) => void;
      clearPendingComponentMarkdown: () => void;
    }
    ```
  - Use `create` from zustand (NOT persist — this is ephemeral session state)
  - When `setPendingComponentMarkdown` is called with a value, auto-set `isInspectMode` to `false` (auto-exit on click)

  **Must NOT do**:
  - Do NOT use `persist` middleware — inspect mode state doesn't survive page refreshes
  - Do NOT add complex logic — keep it minimal

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 5)
  - **Blocks**: Task 6
  - **Blocked By**: Task 0

  **References**:

  **Pattern References**:
  - `frontend/src/stores/useUiPreferencesStore.ts:1-3` — Zustand import pattern (`import { create } from 'zustand'`)
  - `frontend/src/stores/useTaskDetailsUiStore.ts` — Simple Zustand store pattern without persist
  - `frontend/src/stores/useDiffViewStore.ts` — Another simple ephemeral store example

  **Acceptance Criteria**:
  - [x] `frontend/src/stores/useInspectModeStore.ts` exists
  - [x] Exports `useInspectModeStore` hook
  - [x] Has `isInspectMode`, `pendingComponentMarkdown`, `setInspectMode`, `setPendingComponentMarkdown`, `clearPendingComponentMarkdown`
  - [x] Setting `pendingComponentMarkdown` auto-exits inspect mode (`isInspectMode` → `false`)
  - [x] `pnpm run check` passes (no type errors)

  **Agent-Executed QA Scenarios**:

  ```
  Scenario: Zustand store type-checks correctly
    Tool: Bash
    Preconditions: Store file created
    Steps:
      1. Run: pnpm run check
      2. Assert: exit code 0 (no type errors)
      3. Run: grep "useInspectModeStore" frontend/src/stores/useInspectModeStore.ts
      4. Assert: exported store hook found
    Expected Result: Store compiles without errors
    Evidence: pnpm run check output captured
  ```

  **Commit**: NO (groups with Task 6)

---

- [x] 3. Add dual injection points in Rust proxy

  **What to do**:
  - In `crates/server/src/preview_proxy/mod.rs`:
    1. Add a new const: `const BIPPY_BUNDLE: &str = include_str!("bippy_bundle.js");`
    2. In the `http_proxy_handler` function, in the `if is_html` block where HTML injection happens:
       - FIRST: Find `<head>` (case-insensitive) and insert `<script>{BIPPY_BUNDLE}</script>` immediately AFTER it
       - THEN: Find `</body>` (existing logic) and insert `<script>{DEVTOOLS_SCRIPT}</script>` AND `<script>{CLICK_TO_COMPONENT_SCRIPT}</script>` before it
    3. Add a new const: `const CLICK_TO_COMPONENT_SCRIPT: &str = include_str!("click_to_component_script.js");`
  - The order is critical: bippy hook MUST load before React's `<script>` tags (which are typically in `<head>` or early `<body>`). Injecting right after `<head>` ensures this.

  **Must NOT do**:
  - Do NOT change the WebSocket proxy logic
  - Do NOT modify the routing logic (Referer/Cookie fallback)
  - Do NOT change the response header stripping logic

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 4)
  - **Blocks**: Task 6
  - **Blocked By**: Tasks 0, 1

  **References**:

  **Pattern References**:
  - `crates/server/src/preview_proxy/mod.rs` (on branch `origin/vdmkotai/dev-mode-updates`) — The existing HTML injection logic:
    ```rust
    if let Some(pos) = html.to_lowercase().rfind("</body>") {
        let script_tag = format!("<script>{}</script>", DEVTOOLS_SCRIPT);
        html.insert_str(pos, &script_tag);
    }
    ```
    This pattern needs to be extended with a SECOND injection after `<head>`.

  **API/Type References**:
  - `include_str!()` macro — Rust's compile-time file embedding

  **WHY Each Reference Matters**:
  - `mod.rs` injection block: Shows exact location where new injection code goes. The `<head>` injection must come BEFORE the `</body>` injection in the code to maintain correct insertion positions (inserting into the string shifts positions).

  **Acceptance Criteria**:
  - [x] `BIPPY_BUNDLE` const added with `include_str!("bippy_bundle.js")`
  - [x] `CLICK_TO_COMPONENT_SCRIPT` const added with `include_str!("click_to_component_script.js")`
  - [x] `<head>` injection inserts bippy bundle script
  - [x] `</body>` injection inserts both devtools AND click-to-component scripts
  - [x] `cargo check --workspace` passes (requires Task 4's file to exist, even if empty)

  **Agent-Executed QA Scenarios**:

  ```
  Scenario: Rust proxy compiles with new injection points
    Tool: Bash
    Preconditions: bippy_bundle.js and click_to_component_script.js exist in preview_proxy/
    Steps:
      1. Run: cargo check --workspace
      2. Assert: exit code 0 (compilation succeeds)
      3. Run: grep "BIPPY_BUNDLE" crates/server/src/preview_proxy/mod.rs
      4. Assert: include_str! declaration found
      5. Run: grep "CLICK_TO_COMPONENT_SCRIPT" crates/server/src/preview_proxy/mod.rs
      6. Assert: include_str! declaration found
      7. Run: grep -c "<head>" crates/server/src/preview_proxy/mod.rs
      8. Assert: count > 0 (head injection logic exists)
    Expected Result: Dual injection points compile correctly
    Evidence: cargo check output captured
  ```

  **Commit**: YES (groups with Tasks 1, 4)
  - Message: `feat(preview-proxy): add bippy hook and click-to-component script injection`
  - Files: `crates/server/src/preview_proxy/mod.rs`, `crates/server/src/preview_proxy/bippy_bundle.js`, `crates/server/src/preview_proxy/click_to_component_script.js`
  - Pre-commit: `cargo check --workspace`

---

- [x] 4. Create click-to-component detection script

  **What to do**:
  - Create `crates/server/src/preview_proxy/click_to_component_script.js`
  - This script is injected before `</body>` and runs in the proxied dev server's page context
  - It has access to `window.VKBippy` (from the bippy bundle injected after `<head>`)
  - The script must:

  **A. Listen for inspect mode toggle messages:**
  ```javascript
  window.addEventListener('message', function(event) {
    if (event.data && event.data.source === 'click-to-component' && event.data.type === 'toggle-inspect') {
      setInspectMode(event.data.payload.active);
    }
  });
  ```

  **B. When inspect mode is ON:**
  - Intercept `mouseover` events: show a highlight overlay (colored border/background) on the hovered element
  - Intercept `click` events: prevent default, detect component, send result, exit inspect mode
  - Add a `cursor: crosshair` style to body

  **C. On click in inspect mode:**
  1. Call `VKBippy.getFiberFromHostInstance(element)` to get the fiber
  2. If fiber found AND `VKBippy.isInstrumentationActive()`:
     - Call `VKBippy.getOwnerStack(fiber)` (async — returns `Promise<StackFrame[]>`)
     - Format output like react-grab's `getElementContext()`:
       - Generate HTML preview of clicked element (tag, attributes, truncated text content)
       - Format stack frames: `\n  in ComponentName (at /path/to/file.tsx:12:3)`
       - Filter out internal React/Next.js component names (use `checkIsSourceComponentName` logic from react-grab)
     - If stack has source files (file paths): show full format with file paths
     - If stack has only component names (no source maps): show `\n  in ComponentName` without file paths
  3. If fiber NOT found (non-React element):
     - Format fallback: `<tag id="..." class="...">` + `\n  (no React component detected)`
  4. Send result via postMessage:
     ```javascript
     window.parent.postMessage({
       source: 'click-to-component',
       type: 'component-detected',
       payload: { markdown: formattedString }
     }, '*');
     ```

  **D. Overlay implementation:**
  - Create a single absolutely-positioned div overlay element
  - On mouseover: position overlay over hovered element using `getBoundingClientRect()`
  - Style: `border: 2px solid #3b82f6; background: rgba(59, 130, 246, 0.1); pointer-events: none; z-index: 999999`
  - Show component name label on overlay (use `VKBippy.getDisplayName` from nearest composite fiber)
  - On inspect mode OFF: remove overlay

  **E. Important edge cases:**
  - Use `{ capture: true }` for event listeners to intercept before app handlers
  - Call `event.preventDefault()` and `event.stopPropagation()` on click
  - Handle async `getOwnerStack` errors gracefully — fall back to fiber-walk-based names
  - Debounce/throttle mouseover to avoid excessive fiber lookups

  **Must NOT do**:
  - Do NOT use any ES module imports — this is an IIFE injected as raw JS
  - Do NOT depend on any DOM libraries — vanilla JS only
  - Do NOT try to detect Vue/Svelte/Angular components
  - Do NOT send postMessage with source `'vibe-devtools'` — use `'click-to-component'`

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []
    - Deep category because this task requires careful logic for fiber walking, async handling, and react-grab format replication

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 3)
  - **Blocks**: Task 6
  - **Blocked By**: Tasks 0, 1

  **References**:

  **Pattern References**:
  - `crates/server/src/preview_proxy/devtools_script.js` (on remote branch) — Existing injected script pattern: IIFE structure, `window.parent.postMessage`, `'use strict'`, event listener patterns. The click-to-component script follows the same self-contained IIFE style.
  - `/Users/vkotai/work/react-grab/packages/react-grab/src/core/context.ts:188-252` — `getElementContext()` function: the EXACT output format we're replicating. Study the stack frame formatting, HTML preview generation, and fallback logic.
  - `/Users/vkotai/work/react-grab/packages/react-grab/src/core/context.ts:309-365` — `getHTMLPreview()` function: generates the HTML preview portion. Study attribute truncation, child element formatting, and text content handling.
  - `/Users/vkotai/work/react-grab/packages/react-grab/src/core/context.ts:73-79` — `checkIsSourceComponentName()`: filtering logic for component names (skip internal/framework names, require capitalization).
  - `/Users/vkotai/work/react-grab/packages/react-grab/src/core/context.ts:22-56` — `NEXT_INTERNAL_COMPONENT_NAMES` and `REACT_INTERNAL_COMPONENT_NAMES` sets: exact list of framework component names to filter out.

  **API/Type References**:
  - `window.VKBippy.getFiberFromHostInstance(element)` → returns Fiber or null
  - `window.VKBippy.getOwnerStack(fiber)` → returns `Promise<StackFrame[]>` where `StackFrame = { functionName?, fileName?, lineNumber?, columnNumber?, isServer? }`
  - `window.VKBippy.getDisplayName(fiberType)` → returns string or null
  - `window.VKBippy.isCompositeFiber(fiber)` → returns boolean
  - `window.VKBippy.traverseFiber(fiber, callback, goUp)` → walks fiber tree
  - `window.VKBippy.isInstrumentationActive()` → returns boolean
  - `window.VKBippy.normalizeFileName(fileName)` → strips protocol prefixes from file paths
  - `window.VKBippy.isSourceFile(fileName)` → returns boolean (is it a user source file vs vendor)

  **External References**:
  - bippy README: fiber inspection API
  - react-grab source: `/Users/vkotai/work/react-grab/packages/react-grab/src/` — reference implementation

  **WHY Each Reference Matters**:
  - `devtools_script.js`: Copy its IIFE structure, postMessage pattern, and self-contained style
  - `getElementContext()`: This is THE function we're replicating — study every line for format accuracy
  - `checkIsSourceComponentName()`: Critical for filtering out React/Next.js internals from the component stack
  - VKBippy API references: These are the exact functions available in the iframe context after bippy bundle loads

  **Acceptance Criteria**:
  - [x] `click_to_component_script.js` exists in `crates/server/src/preview_proxy/`
  - [x] Script is a self-contained IIFE (no imports)
  - [x] Listens for `source: 'click-to-component'` toggle messages
  - [x] On click: calls `VKBippy.getFiberFromHostInstance()` → `VKBippy.getOwnerStack()`
  - [x] Formats output matching react-grab style (HTML preview + stack frames)
  - [x] Sends `source: 'click-to-component', type: 'component-detected'` postMessage
  - [x] Shows highlight overlay on hover during inspect mode
  - [x] Handles non-React elements with DOM fallback
  - [x] File is valid JavaScript (no syntax errors)

  **Agent-Executed QA Scenarios**:

  ```
  Scenario: Detection script is valid self-contained JavaScript
    Tool: Bash (node eval)
    Preconditions: click_to_component_script.js created
    Steps:
      1. Run: node -e "const fs = require('fs'); const code = fs.readFileSync('crates/server/src/preview_proxy/click_to_component_script.js', 'utf8'); try { new Function(code); console.log('VALID'); } catch(e) { console.log('ERROR:', e.message); }"
      2. Assert: output is "VALID"
      3. Run: grep "click-to-component" crates/server/src/preview_proxy/click_to_component_script.js
      4. Assert: postMessage source identifier present
      5. Run: grep "component-detected" crates/server/src/preview_proxy/click_to_component_script.js
      6. Assert: message type present
      7. Run: grep "getFiberFromHostInstance" crates/server/src/preview_proxy/click_to_component_script.js
      8. Assert: bippy API call present
      9. Run: grep "getOwnerStack" crates/server/src/preview_proxy/click_to_component_script.js
      10. Assert: owner stack call present
    Expected Result: Script is syntactically valid and contains all required patterns
    Evidence: Node eval and grep output captured
  ```

  **Commit**: YES (groups with Tasks 1, 3)
  - Message: `feat(preview-proxy): add bippy hook and click-to-component script injection`
  - Files: (grouped commit with Task 3)
  - Pre-commit: `cargo check --workspace`

---

- [x] 5. Add inspect mode button to PreviewBrowser toolbar

  **What to do**:
  - In `frontend/src/components/ui-new/views/PreviewBrowser.tsx`:
    1. Import `CrosshairIcon` from `@phosphor-icons/react`
    2. Add new props to `PreviewBrowserProps`:
       - `isInspectMode: boolean`
       - `onToggleInspectMode: () => void`
    3. Add a new `IconButtonGroupItem` in the toolbar, placed in its OWN `IconButtonGroup` right after the PreviewNavigation component (before the URL input):
       ```tsx
       <IconButtonGroup>
         <IconButtonGroupItem
           icon={CrosshairIcon}
           onClick={onToggleInspectMode}
           active={isInspectMode}
           disabled={!isServerRunning}
           aria-label="Inspect component"
           title="Inspect component"
         />
       </IconButtonGroup>
       ```

  **Must NOT do**:
  - Do NOT add state management here — this is a view component (stateless)
  - Do NOT wire up the actual inspect mode logic — that's Task 6
  - Do NOT modify old `PreviewPanel.tsx`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Toolbar button placement and styling

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: Task 6
  - **Blocked By**: Task 0

  **References**:

  **Pattern References**:
  - `frontend/src/components/ui-new/views/PreviewBrowser.tsx:173-200` (on remote branch) — Existing `IconButtonGroup` patterns in the toolbar. The inspect button follows the exact same `IconButtonGroupItem` pattern with `active` prop for toggle state.
  - `frontend/src/components/ui-new/primitives/IconButtonGroup.tsx` — The `IconButtonGroupItem` component API: `icon`, `onClick`, `active`, `disabled`, `aria-label`, `title` props.

  **API/Type References**:
  - `CrosshairIcon` from `@phosphor-icons/react` — Already used in the project (in `RepoCard.tsx`), no new dependency needed.

  **WHY Each Reference Matters**:
  - Toolbar pattern: Copy exact structure for consistency. The `active` prop highlights the button when inspect mode is on.

  **Acceptance Criteria**:
  - [x] `CrosshairIcon` imported from `@phosphor-icons/react`
  - [x] `isInspectMode` and `onToggleInspectMode` added to `PreviewBrowserProps`
  - [x] New `IconButtonGroupItem` with CrosshairIcon visible in toolbar
  - [x] Button shows active state when `isInspectMode` is true
  - [x] Button is disabled when server not running
  - [x] `pnpm run check` passes (type check — will show errors for missing props, but the file itself must be valid)

  **Agent-Executed QA Scenarios**:

  ```
  Scenario: PreviewBrowser accepts new inspect mode props
    Tool: Bash
    Preconditions: PreviewBrowser.tsx updated
    Steps:
      1. Run: grep "isInspectMode" frontend/src/components/ui-new/views/PreviewBrowser.tsx
      2. Assert: prop declaration and usage found
      3. Run: grep "CrosshairIcon" frontend/src/components/ui-new/views/PreviewBrowser.tsx
      4. Assert: import and usage found
      5. Run: grep "onToggleInspectMode" frontend/src/components/ui-new/views/PreviewBrowser.tsx
      6. Assert: prop declaration and onClick handler found
    Expected Result: Toolbar button added with correct props
    Evidence: grep output captured
  ```

  **Commit**: NO (groups with Task 6)

---

- [x] 6. Wire up PreviewBrowserContainer inspect mode orchestration

  **What to do**:
  - In `frontend/src/components/ui-new/containers/PreviewBrowserContainer.tsx`:

  **A. Import and use the Zustand store:**
  ```typescript
  import { useInspectModeStore } from '@/stores/useInspectModeStore';
  
  // Inside component:
  const isInspectMode = useInspectModeStore((s) => s.isInspectMode);
  const toggleInspectMode = useInspectModeStore((s) => s.toggleInspectMode);
  const setPendingComponentMarkdown = useInspectModeStore((s) => s.setPendingComponentMarkdown);
  ```

  **B. Send inspect mode toggle to iframe:**
  ```typescript
  useEffect(() => {
    // Send toggle message to inner iframe via the bridge
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;
    
    iframe.contentWindow.postMessage({
      source: 'click-to-component',
      type: 'toggle-inspect',
      payload: { active: isInspectMode }
    }, '*');
  }, [isInspectMode]);
  ```

  **C. Listen for component-detected messages:**
  Add a `useEffect` that listens for `window.addEventListener('message', ...)` with `source: 'click-to-component'` and `type: 'component-detected'`. When received, call `setPendingComponentMarkdown(event.data.payload.markdown)`.

  Note: The message passes through two iframe layers:
  - Inner iframe (detection script) → proxy_page.html (relay) → Vibe Kanban (this component)
  - The relay in `proxy_page.html` already allows `source: 'click-to-component'` messages through

  **D. Pass new props to PreviewBrowser view:**
  ```typescript
  <PreviewBrowser
    // ... existing props
    isInspectMode={isInspectMode}
    onToggleInspectMode={toggleInspectMode}
  />
  ```

  **E. Update the proxy_page.html relay** to also handle `type: 'toggle-inspect'` messages going DOWNWARD (from Vibe Kanban → inner iframe). Check if the existing relay already handles this — it currently relays based on `source` only, so `click-to-component` toggle messages should already pass through. Verify this.

  **Must NOT do**:
  - Do NOT add inspect mode logic to the view component (`PreviewBrowser.tsx`)
  - Do NOT create a new message listener class — use inline `useEffect` with `addEventListener`

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: React component wiring, hooks, effects
    - Deep category: Multiple interconnected state flows and message channels

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (sequential)
  - **Blocks**: Tasks 7, 8
  - **Blocked By**: Tasks 2, 3, 4, 5

  **References**:

  **Pattern References**:
  - `frontend/src/components/ui-new/containers/PreviewBrowserContainer.tsx` (on remote branch) — Entire file. Study the existing `useEffect` for `PreviewDevToolsBridge` (lines near `bridgeRef.current = new PreviewDevToolsBridge(...)`) — the inspect mode listener follows a similar pattern but is simpler (direct `addEventListener` instead of bridge class).
  - `frontend/src/utils/previewDevToolsBridge.ts` (on remote branch) — `PreviewDevToolsBridge` class pattern. Shows how to listen for postMessage events. The inspect mode listener is simpler but follows same structure.
  - `crates/server/src/preview_proxy/proxy_page.html` (on remote branch) — The relay script. Check that `allowedSources` array includes `'click-to-component'` (it does). Messages with `source: 'click-to-component'` from EITHER direction (parent → iframe, iframe → parent) pass through. `toggle-inspect` goes DOWN, `component-detected` goes UP.

  **API/Type References**:
  - `useInspectModeStore` — `isInspectMode: boolean`, `toggleInspectMode: () => void`, `setPendingComponentMarkdown: (md: string | null) => void`
  - `PreviewBrowserProps` — new props: `isInspectMode: boolean`, `onToggleInspectMode: () => void`

  **WHY Each Reference Matters**:
  - `PreviewBrowserContainer.tsx`: The file being modified — need to understand existing state, effects, and prop drilling
  - `proxy_page.html`: Must verify relay handles bidirectional `click-to-component` messages (it does)
  - `PreviewDevToolsBridge`: Shows existing postMessage listener pattern in this codebase

  **Acceptance Criteria**:
  - [x] `useInspectModeStore` imported and used in container
  - [x] `isInspectMode` and `onToggleInspectMode` passed to `PreviewBrowser` view
  - [x] `useEffect` sends `toggle-inspect` message to iframe when `isInspectMode` changes
  - [x] `useEffect` listens for `component-detected` messages and calls `setPendingComponentMarkdown`
  - [x] `pnpm run check` passes

  **Agent-Executed QA Scenarios**:

  ```
  Scenario: Container compiles with inspect mode wiring
    Tool: Bash
    Preconditions: Tasks 2-5 completed
    Steps:
      1. Run: pnpm run check
      2. Assert: exit code 0
      3. Run: grep "useInspectModeStore" frontend/src/components/ui-new/containers/PreviewBrowserContainer.tsx
      4. Assert: import and usage found
      5. Run: grep "toggle-inspect" frontend/src/components/ui-new/containers/PreviewBrowserContainer.tsx
      6. Assert: postMessage send found
      7. Run: grep "component-detected" frontend/src/components/ui-new/containers/PreviewBrowserContainer.tsx
      8. Assert: message listener found
    Expected Result: All wiring in place and type-safe
    Evidence: pnpm check output captured
  ```

  **Commit**: YES
  - Message: `feat(preview): add inspect mode with click-to-component detection`
  - Files: `frontend/src/stores/useInspectModeStore.ts`, `frontend/src/components/ui-new/views/PreviewBrowser.tsx`, `frontend/src/components/ui-new/containers/PreviewBrowserContainer.tsx`
  - Pre-commit: `pnpm run check`

---

- [x] 7. Wire up SessionChatBoxContainer auto-paste

  **What to do**:
  - In `frontend/src/components/ui-new/containers/SessionChatBoxContainer.tsx`:
    1. Import `useInspectModeStore`
    2. Subscribe to `pendingComponentMarkdown`
    3. When it changes to a non-null value:
       - Call `handleInsertMarkdown(pendingComponentMarkdown)` (existing function at line ~298)
       - Then call `clearPendingComponentMarkdown()` to reset the store
    4. Use a `useEffect` for this:
       ```typescript
       const pendingComponentMarkdown = useInspectModeStore(
         (s) => s.pendingComponentMarkdown
       );
       const clearPendingComponentMarkdown = useInspectModeStore(
         (s) => s.clearPendingComponentMarkdown
       );
       
       useEffect(() => {
         if (pendingComponentMarkdown) {
           handleInsertMarkdown(pendingComponentMarkdown);
           clearPendingComponentMarkdown();
         }
       }, [pendingComponentMarkdown, handleInsertMarkdown, clearPendingComponentMarkdown]);
       ```

  **Must NOT do**:
  - Do NOT modify `handleInsertMarkdown` logic — just call it
  - Do NOT add UI changes to this file
  - Do NOT wrap the markdown in extra formatting — the detection script already formats it

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Task 8)
  - **Blocks**: Task 9
  - **Blocked By**: Task 6

  **References**:

  **Pattern References**:
  - `frontend/src/components/ui-new/containers/SessionChatBoxContainer.tsx:298-306` — `handleInsertMarkdown` function: appends markdown to current message with `\n\n` separator. This is the function we call when component markdown arrives.
  - `frontend/src/components/ui-new/containers/SessionChatBoxContainer.tsx:281` — `setLocalMessage` from `useSessionMessageEditor` hook. `handleInsertMarkdown` uses this internally.

  **API/Type References**:
  - `handleInsertMarkdown(markdown: string)` — Existing callback that appends markdown to chat input
  - `useInspectModeStore.pendingComponentMarkdown` — `string | null`, set by PreviewBrowserContainer when component detected
  - `useInspectModeStore.clearPendingComponentMarkdown` — `() => void`, resets to null after consumption

  **WHY Each Reference Matters**:
  - `handleInsertMarkdown`: This is THE insertion point. We don't reinvent message editing — we use the existing mechanism that's already tested with image attachments.

  **Acceptance Criteria**:
  - [x] `useInspectModeStore` imported in `SessionChatBoxContainer.tsx`
  - [x] `useEffect` watches `pendingComponentMarkdown` and calls `handleInsertMarkdown`
  - [x] `clearPendingComponentMarkdown` called after insertion
  - [x] `pnpm run check` passes

  **Agent-Executed QA Scenarios**:

  ```
  Scenario: Chat container subscribes to inspect mode store
    Tool: Bash
    Preconditions: SessionChatBoxContainer.tsx updated
    Steps:
      1. Run: pnpm run check
      2. Assert: exit code 0
      3. Run: grep "useInspectModeStore" frontend/src/components/ui-new/containers/SessionChatBoxContainer.tsx
      4. Assert: import found
      5. Run: grep "pendingComponentMarkdown" frontend/src/components/ui-new/containers/SessionChatBoxContainer.tsx
      6. Assert: subscription and usage found
      7. Run: grep "clearPendingComponentMarkdown" frontend/src/components/ui-new/containers/SessionChatBoxContainer.tsx
      8. Assert: cleanup call found
    Expected Result: Auto-paste wiring compiles correctly
    Evidence: pnpm check output captured
  ```

  **Commit**: YES (groups with Task 8)
  - Message: `feat(preview): auto-paste component context into chat from inspect mode`
  - Files: `frontend/src/components/ui-new/containers/SessionChatBoxContainer.tsx`
  - Pre-commit: `pnpm run check`

---

- [x] 8. Add iframeRef to mobile iframe

  **What to do**:
  - In `frontend/src/components/ui-new/views/PreviewBrowser.tsx`:
    - Find the mobile mode iframe (inside the phone frame `<div>` in the `screenSize === 'mobile'` branch)
    - Add `ref={iframeRef}` to this iframe element
    - Currently, only the desktop/responsive iframe has `ref={iframeRef}` — the mobile one is missing it
    - This ensures inspect mode toggle messages can be sent to the mobile iframe too

  **Must NOT do**:
  - Do NOT create a second ref — reuse the existing `iframeRef`
  - Do NOT change the mobile frame styling

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Task 7)
  - **Blocks**: Task 9
  - **Blocked By**: Task 6

  **References**:

  **Pattern References**:
  - `frontend/src/components/ui-new/views/PreviewBrowser.tsx` (on remote branch) — The mobile iframe block:
    ```tsx
    {screenSize === 'mobile' ? (
      // Phone frame for mobile mode
      <div ...>
        <div ...>
          <iframe
            src={url}
            title={t('preview.browser.title')}
            className="w-full h-full border-0"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
            referrerPolicy="no-referrer"
          />  {/* <-- Missing ref={iframeRef} here */}
    ```
    Compare with desktop iframe which HAS `ref={iframeRef}`.

  **WHY Each Reference Matters**:
  - Shows exact location of the missing ref — one-line fix

  **Acceptance Criteria**:
  - [x] Mobile iframe has `ref={iframeRef}` attribute
  - [x] `pnpm run check` passes

  **Agent-Executed QA Scenarios**:

  ```
  Scenario: Mobile iframe has ref
    Tool: Bash
    Preconditions: PreviewBrowser.tsx updated
    Steps:
      1. Run: grep -A5 "Phone frame for mobile" frontend/src/components/ui-new/views/PreviewBrowser.tsx | grep "ref="
      2. Assert: "ref={iframeRef}" found within mobile iframe section
    Expected Result: Mobile iframe has ref attribute
    Evidence: grep output captured
  ```

  **Commit**: YES (groups with Task 7)
  - Message: `feat(preview): auto-paste component context into chat from inspect mode`
  - Files: (grouped with Task 7)
  - Pre-commit: `pnpm run check`

---

- [x] 9. Integration verification & build checks

  **What to do**:
  - Run full verification:
    1. `cargo check --workspace` — Rust compilation
    2. `pnpm run check` — Frontend type checks
    3. `pnpm run lint` — ESLint
    4. `cargo test --workspace` — Rust tests (should all pass, no new tests added)
  - Fix any issues found

  **Must NOT do**:
  - Do NOT commit — just verify and fix
  - Do NOT skip any check command

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Final (after all tasks)
  - **Blocks**: None
  - **Blocked By**: Tasks 7, 8

  **References**: None needed — verification only

  **Acceptance Criteria**:
  - [x] `cargo check --workspace` → exit code 0
  - [x] `pnpm run check` → exit code 0
  - [x] `pnpm run lint` → exit code 0 (or warnings only)
  - [x] `cargo test --workspace` → all tests pass

  **Agent-Executed QA Scenarios**:

  ```
  Scenario: Full project builds and passes checks
    Tool: Bash
    Preconditions: All tasks 0-8 completed
    Steps:
      1. Run: cargo check --workspace
      2. Assert: exit code 0
      3. Run: pnpm run check
      4. Assert: exit code 0
      5. Run: pnpm run lint
      6. Assert: exit code 0 or warnings only
      7. Run: cargo test --workspace
      8. Assert: all tests pass
    Expected Result: Project is in clean, buildable state
    Evidence: All command outputs captured

  Scenario: Inspect mode end-to-end flow (manual smoke test guide)
    Tool: Playwright (playwright skill)
    Preconditions: pnpm run dev started, workspace with React dev server running
    Steps:
      1. Navigate to: http://localhost:3000 (Vibe Kanban)
      2. Open a workspace with a running React dev server
      3. Switch to Preview tab
      4. Wait for: iframe to load with dev server content
      5. Click: CrosshairIcon button in toolbar
      6. Assert: button shows active/highlighted state
      7. Move mouse over element in preview iframe
      8. Assert: blue highlight overlay appears over hovered element
      9. Click: any element in preview iframe
      10. Assert: component context markdown appears in chat input
      11. Assert: inspect mode button returns to inactive state
      12. Screenshot: .sisyphus/evidence/task-9-e2e-inspect.png
    Expected Result: Full inspect flow works end-to-end
    Evidence: .sisyphus/evidence/task-9-e2e-inspect.png
  ```

  **Commit**: NO (verification only)

---

## Commit Strategy

| After Task(s) | Message | Key Files | Verification |
|------------|---------|-------|--------------|
| 1, 3, 4 | `feat(preview-proxy): add bippy hook and click-to-component script injection` | `mod.rs`, `bippy_bundle.js`, `click_to_component_script.js`, `scripts/build-bippy-bundle.mjs` | `cargo check --workspace` |
| 2, 5, 6 | `feat(preview): add inspect mode with click-to-component detection` | `useInspectModeStore.ts`, `PreviewBrowser.tsx`, `PreviewBrowserContainer.tsx` | `pnpm run check` |
| 7, 8 | `feat(preview): auto-paste component context into chat from inspect mode` | `SessionChatBoxContainer.tsx`, `PreviewBrowser.tsx` (mobile ref) | `pnpm run check` |

---

## Success Criteria

### Verification Commands
```bash
cargo check --workspace          # Expected: Compiles successfully
pnpm run check                   # Expected: No type errors
pnpm run lint                    # Expected: No errors (warnings OK)
cargo test --workspace           # Expected: All tests pass
```

### Final Checklist
- [x] Bippy hook loads before React in proxied pages
- [x] Click-to-component detection works for React elements
- [x] Non-React elements show DOM fallback
- [x] Inspect mode auto-exits after click
- [x] Component context pastes into chat input
- [x] Mobile preview supports inspect mode
- [x] All "Must NOT Have" constraints honored
- [x] No new npm dependencies in frontend (bippy only in devDeps for build script)
