# Preview Mini DevTools & Navigation

## TL;DR

> **Quick Summary**: Add mini DevTools panel (Console, Network, Errors) and navigation controls (URL bar, back/forward) to the preview browser toolbar.
> 
> **Deliverables**: 
> - Injected script that captures console/network/errors and sends via postMessage
> - Navigation controls with URL display, back/forward buttons, history
> - Mini DevTools panel with Console/Network/Errors tabs
> - postMessage handlers for all new message types
> 
> **Estimated Effort**: Large
> **Parallel Execution**: YES - 3 waves
> **Critical Path**: Task 1 → Task 3 → Task 5 → Task 7

---

## Context

### Current State
- Preview proxy exists with script injection placeholder: `<script>/* vibe-kanban-devtools-placeholder */</script>`
- postMessage relay exists in proxy_page.html (filters by `source: 'click-to-component'`)
- ClickToComponentListener exists in previewBridge.ts
- PreviewBrowser.tsx has toolbar with URL input, screen size toggle, start/stop

### What We're Adding
1. **Injected DevTools Script**: Captures console, network, errors from iframe
2. **Navigation Controls**: Back/forward buttons, URL display with current page
3. **Mini DevTools Panel**: Collapsible panel showing Console/Network/Errors

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Vibe Kanban (localhost:3000)                                                │
│                                                                             │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │ PreviewBrowser                                                          │ │
│ │ ┌─────────────────────────────────────────────────────────────────────┐ │ │
│ │ │ Navigation Toolbar                                                   │ │ │
│ │ │ [◄] [►] [↻]  [ http://localhost:8080/dashboard          ] [⚙]      │ │ │
│ │ └─────────────────────────────────────────────────────────────────────┘ │ │
│ │ ┌─────────────────────────────────────────────────────────────────────┐ │ │
│ │ │ iframe (proxy)                                                       │ │ │
│ │ │                                                                      │ │ │
│ │ │   Dev Server Content + Injected Script                              │ │ │
│ │ │                                                                      │ │ │
│ │ └─────────────────────────────────────────────────────────────────────┘ │ │
│ │ ┌─────────────────────────────────────────────────────────────────────┐ │ │
│ │ │ Mini DevTools Panel (collapsible)                                   │ │ │
│ │ │ [Console] [Network] [Errors]                                        │ │ │
│ │ │ ────────────────────────────────────────────────────────────────    │ │ │
│ │ │ > log: "App mounted"                                                │ │ │
│ │ │ > warn: "Deprecation warning"                                       │ │ │
│ │ │ > error: "Cannot read property 'x'"                                 │ │ │
│ │ └─────────────────────────────────────────────────────────────────────┘ │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Work Objectives

### Core Objective
Enable developers to debug preview content without opening browser DevTools, and navigate within the preview without manual URL editing.

### Concrete Deliverables
1. `crates/server/src/preview_proxy/devtools_script.js` — Injected script
2. `frontend/src/utils/previewDevToolsBridge.ts` — postMessage handlers
3. `frontend/src/components/ui-new/views/PreviewNavigation.tsx` — Navigation toolbar
4. `frontend/src/components/ui-new/views/MiniDevTools.tsx` — DevTools panel
5. `frontend/src/hooks/usePreviewDevTools.ts` — State management for devtools data
6. Modified `PreviewBrowser.tsx` — Integration of new components
7. Modified `proxy_page.html` — Extended postMessage relay

### Definition of Done
- [ ] Console logs from iframe appear in Mini DevTools panel
- [ ] Network requests from iframe appear in Network tab
- [ ] Errors from iframe appear in Errors tab with stack traces
- [ ] Back/Forward buttons navigate iframe history
- [ ] URL bar shows current iframe URL and updates on navigation
- [ ] Navigation within iframe (link clicks) updates URL bar
- [ ] Panel is collapsible and remembers state

### Must Have
- Console capture (log, warn, error, info, debug)
- Network capture (fetch, XHR)
- Error capture (runtime errors, unhandled rejections)
- Navigation: back, forward, refresh
- URL display with real-time updates
- Collapsible DevTools panel

### Must NOT Have (Guardrails)
- ❌ Click-to-component (separate task)
- ❌ DOM inspector
- ❌ Performance profiling
- ❌ Memory profiling
- ❌ Full Chrome DevTools feature parity
- ❌ Source maps / debugger
- ❌ Edit and continue

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES (Vitest)
- **User wants tests**: NO (manual testing for this feature)
- **QA approach**: Manual verification with Playwright for visual checks

### Manual Verification Procedures

**Console Capture:**
```javascript
// In dev server app:
console.log('Test log');
console.warn('Test warning');
console.error('Test error');
// Should appear in Mini DevTools Console tab
```

**Network Capture:**
```javascript
// In dev server app:
fetch('/api/data');
// Should appear in Mini DevTools Network tab with URL, status, timing
```

**Navigation:**
```
1. Click link in preview → URL bar updates
2. Click Back → navigates back, URL updates
3. Click Forward → navigates forward, URL updates
4. Click Refresh → page reloads
```

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation):
├── Task 1: Define postMessage protocol types
├── Task 2: Create injected DevTools script
└── Task 3: Extend proxy_page.html message relay

Wave 2 (Frontend Hooks & State):
├── Task 4: Create usePreviewDevTools hook
└── Task 5: Create previewDevToolsBridge.ts

Wave 3 (UI Components):
├── Task 6: Create PreviewNavigation component
├── Task 7: Create MiniDevTools component
└── Task 8: Integrate into PreviewBrowser

Wave 4 (Backend Integration):
└── Task 9: Replace placeholder with real script in Rust proxy
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|---------------------|
| 1 | None | 2, 4, 5 | None |
| 2 | 1 | 9 | 3 |
| 3 | 1 | 5 | 2 |
| 4 | 1 | 6, 7, 8 | 5 |
| 5 | 1, 3 | 6, 7, 8 | 4 |
| 6 | 4, 5 | 8 | 7 |
| 7 | 4, 5 | 8 | 6 |
| 8 | 6, 7 | None | None |
| 9 | 2 | None | 6, 7, 8 |

---

## TODOs

### Task 1: Define postMessage Protocol Types

**What to do**:
- Create TypeScript types for all new postMessage events
- Define message structure for: console, network, errors, navigation
- Follow existing pattern from previewBridge.ts

**File**: `frontend/src/types/previewDevTools.ts` (new file)

**Types to define**:
```typescript
// Message source identifier
type PreviewDevToolsSource = 'vibe-devtools';

// Console message
interface ConsoleMessage {
  source: PreviewDevToolsSource;
  type: 'console';
  payload: {
    level: 'log' | 'warn' | 'error' | 'info' | 'debug';
    args: unknown[];
    timestamp: number;
    stack?: string;
  };
}

// Network message
interface NetworkMessage {
  source: PreviewDevToolsSource;
  type: 'network';
  payload: {
    id: string;
    method: string;
    url: string;
    status?: number;
    statusText?: string;
    duration?: number;
    requestHeaders?: Record<string, string>;
    responseHeaders?: Record<string, string>;
    phase: 'start' | 'end' | 'error';
    error?: string;
    timestamp: number;
  };
}

// Error message
interface ErrorMessage {
  source: PreviewDevToolsSource;
  type: 'error';
  payload: {
    message: string;
    filename?: string;
    lineno?: number;
    colno?: number;
    stack?: string;
    timestamp: number;
  };
}

// Navigation message
interface NavigationMessage {
  source: PreviewDevToolsSource;
  type: 'navigation';
  payload: {
    url: string;
    title?: string;
    canGoBack: boolean;
    canGoForward: boolean;
    timestamp: number;
  };
}

// Command from parent to iframe
interface NavigationCommand {
  source: PreviewDevToolsSource;
  type: 'navigate';
  payload: {
    action: 'back' | 'forward' | 'refresh' | 'goto';
    url?: string; // for 'goto' action
  };
}

// Ready message
interface ReadyMessage {
  source: PreviewDevToolsSource;
  type: 'ready';
}
```

**Acceptance Criteria**:
```bash
pnpm run check
# Assert: No TypeScript errors
```

**Commit**: NO (group with Task 2)

---

### Task 2: Create Injected DevTools Script

**What to do**:
- Create JavaScript file that will be injected into dev server pages
- Intercept console.log/warn/error/info/debug
- Intercept fetch and XMLHttpRequest
- Capture window.onerror and unhandledrejection
- Track navigation (popstate, pushState, replaceState)
- Send all data via postMessage to parent

**File**: `crates/server/src/preview_proxy/devtools_script.js` (new file)

**Script structure**:
```javascript
(function() {
  'use strict';
  
  const SOURCE = 'vibe-devtools';
  
  function send(type, payload) {
    window.parent.postMessage({ source: SOURCE, type, payload }, '*');
  }
  
  // === Console Interception ===
  const originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error,
    info: console.info,
    debug: console.debug,
  };
  
  function wrapConsole(level) {
    console[level] = function(...args) {
      send('console', {
        level,
        args: args.map(serializeArg),
        timestamp: Date.now(),
        stack: new Error().stack,
      });
      originalConsole[level].apply(console, args);
    };
  }
  
  ['log', 'warn', 'error', 'info', 'debug'].forEach(wrapConsole);
  
  // === Network Interception ===
  const originalFetch = window.fetch;
  let requestId = 0;
  
  window.fetch = async function(input, init) {
    const id = String(++requestId);
    const url = typeof input === 'string' ? input : input.url;
    const method = init?.method || 'GET';
    
    send('network', {
      id, method, url,
      phase: 'start',
      timestamp: Date.now(),
    });
    
    const startTime = Date.now();
    try {
      const response = await originalFetch.apply(this, arguments);
      send('network', {
        id, method, url,
        status: response.status,
        statusText: response.statusText,
        duration: Date.now() - startTime,
        phase: 'end',
        timestamp: Date.now(),
      });
      return response;
    } catch (error) {
      send('network', {
        id, method, url,
        error: error.message,
        phase: 'error',
        timestamp: Date.now(),
      });
      throw error;
    }
  };
  
  // Similar for XMLHttpRequest...
  
  // === Error Capture ===
  window.addEventListener('error', (event) => {
    send('error', {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      stack: event.error?.stack,
      timestamp: Date.now(),
    });
  });
  
  window.addEventListener('unhandledrejection', (event) => {
    send('error', {
      message: String(event.reason),
      stack: event.reason?.stack,
      timestamp: Date.now(),
    });
  });
  
  // === Navigation Tracking ===
  function sendNavigation() {
    send('navigation', {
      url: location.href,
      title: document.title,
      canGoBack: history.length > 1,
      canGoForward: false, // Can't detect reliably
      timestamp: Date.now(),
    });
  }
  
  // Intercept pushState/replaceState
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;
  
  history.pushState = function() {
    originalPushState.apply(this, arguments);
    sendNavigation();
  };
  
  history.replaceState = function() {
    originalReplaceState.apply(this, arguments);
    sendNavigation();
  };
  
  window.addEventListener('popstate', sendNavigation);
  
  // === Command Receiver ===
  window.addEventListener('message', (event) => {
    if (event.data?.source !== SOURCE || event.data?.type !== 'navigate') return;
    
    const { action, url } = event.data.payload;
    switch (action) {
      case 'back': history.back(); break;
      case 'forward': history.forward(); break;
      case 'refresh': location.reload(); break;
      case 'goto': if (url) location.href = url; break;
    }
  });
  
  // === Ready Signal ===
  send('ready', {});
  sendNavigation(); // Send initial navigation state
  
  // === Serialization Helper ===
  function serializeArg(arg) {
    if (arg === null) return null;
    if (arg === undefined) return undefined;
    if (typeof arg === 'string' || typeof arg === 'number' || typeof arg === 'boolean') {
      return arg;
    }
    if (arg instanceof Error) {
      return { __type: 'Error', message: arg.message, stack: arg.stack };
    }
    if (arg instanceof HTMLElement) {
      return { __type: 'HTMLElement', tagName: arg.tagName, id: arg.id, className: arg.className };
    }
    try {
      return JSON.parse(JSON.stringify(arg));
    } catch {
      return String(arg);
    }
  }
})();
```

**Acceptance Criteria**:
- Script is valid JavaScript
- Can be minified/bundled later
- No external dependencies

**Commit**: YES
- Message: `feat(preview-proxy): add devtools script for console/network/error capture`
- Files: `crates/server/src/preview_proxy/devtools_script.js`

---

### Task 3: Extend proxy_page.html Message Relay

**What to do**:
- Update postMessage filter to also relay `vibe-devtools` messages
- Add command forwarding from parent to iframe

**File**: `crates/server/src/preview_proxy/proxy_page.html`

**Changes**:
```javascript
// OLD:
if (!event.data || event.data.source !== 'click-to-component') {
  return;
}

// NEW:
const allowedSources = ['click-to-component', 'vibe-devtools'];
if (!event.data || !allowedSources.includes(event.data.source)) {
  return;
}
```

**Acceptance Criteria**:
```bash
cargo build --bin server
# Assert: Compiles
```

**Commit**: YES
- Message: `feat(preview-proxy): extend postMessage relay for devtools messages`
- Files: `crates/server/src/preview_proxy/proxy_page.html`

---

### Task 4: Create usePreviewDevTools Hook

**What to do**:
- Create hook to manage devtools state (console logs, network requests, errors)
- Provide actions to clear logs, filter by type
- Handle message buffering (limit to last N items)

**File**: `frontend/src/hooks/usePreviewDevTools.ts` (new file)

**Interface**:
```typescript
interface ConsoleEntry {
  id: string;
  level: 'log' | 'warn' | 'error' | 'info' | 'debug';
  args: unknown[];
  timestamp: number;
  stack?: string;
}

interface NetworkEntry {
  id: string;
  method: string;
  url: string;
  status?: number;
  statusText?: string;
  duration?: number;
  phase: 'start' | 'end' | 'error';
  error?: string;
  timestamp: number;
}

interface ErrorEntry {
  id: string;
  message: string;
  filename?: string;
  lineno?: number;
  colno?: number;
  stack?: string;
  timestamp: number;
}

interface NavigationState {
  url: string;
  title?: string;
  canGoBack: boolean;
  canGoForward: boolean;
}

interface UsePreviewDevToolsReturn {
  // State
  consoleLogs: ConsoleEntry[];
  networkRequests: NetworkEntry[];
  errors: ErrorEntry[];
  navigation: NavigationState | null;
  isReady: boolean;
  
  // Actions
  clearConsole: () => void;
  clearNetwork: () => void;
  clearErrors: () => void;
  clearAll: () => void;
  
  // Message handler (to be called from bridge)
  handleMessage: (message: PreviewDevToolsMessage) => void;
}
```

**Acceptance Criteria**:
```bash
pnpm run check
# Assert: No TypeScript errors
```

**Commit**: NO (group with Task 5)

---

### Task 5: Create previewDevToolsBridge.ts

**What to do**:
- Create class similar to ClickToComponentListener
- Listen for `vibe-devtools` messages
- Call hooks/callbacks when messages received
- Provide method to send commands to iframe

**File**: `frontend/src/utils/previewDevToolsBridge.ts` (new file)

**Interface**:
```typescript
interface PreviewDevToolsBridgeHandlers {
  onConsole?: (entry: ConsoleEntry) => void;
  onNetwork?: (entry: NetworkEntry) => void;
  onError?: (entry: ErrorEntry) => void;
  onNavigation?: (state: NavigationState) => void;
  onReady?: () => void;
}

class PreviewDevToolsBridge {
  private handlers: PreviewDevToolsBridgeHandlers;
  private iframeRef: React.RefObject<HTMLIFrameElement>;
  
  constructor(handlers: PreviewDevToolsBridgeHandlers, iframeRef: React.RefObject<HTMLIFrameElement>);
  
  start(): void;
  stop(): void;
  
  // Commands to iframe
  navigateBack(): void;
  navigateForward(): void;
  refresh(): void;
  navigateTo(url: string): void;
}
```

**Acceptance Criteria**:
```bash
pnpm run check
# Assert: No TypeScript errors
```

**Commit**: YES
- Message: `feat(frontend): add previewDevToolsBridge for devtools postMessage handling`
- Files: `frontend/src/types/previewDevTools.ts`, `frontend/src/hooks/usePreviewDevTools.ts`, `frontend/src/utils/previewDevToolsBridge.ts`

---

### Task 6: Create PreviewNavigation Component

**What to do**:
- Create navigation toolbar component
- Back/Forward/Refresh buttons
- URL display (read-only, shows current iframe URL)
- Integrate with previewDevToolsBridge for commands

**File**: `frontend/src/components/ui-new/views/PreviewNavigation.tsx` (new file)

**Props**:
```typescript
interface PreviewNavigationProps {
  navigation: NavigationState | null;
  onBack: () => void;
  onForward: () => void;
  onRefresh: () => void;
  onNavigateTo: (url: string) => void;
  isLoading?: boolean;
}
```

**UI Design**:
```
┌─────────────────────────────────────────────────────────────────────┐
│ [◄] [►] [↻]  │ http://localhost:8080/dashboard              │ [⋮] │
│ back fwd ref │              URL display                      │menu │
└─────────────────────────────────────────────────────────────────────┘

- Back button: disabled if !canGoBack
- Forward button: disabled if !canGoForward  
- Refresh button: spins while loading
- URL display: truncated with tooltip for full URL
- Menu: Copy URL, Open in new tab
```

**Acceptance Criteria**:
```bash
pnpm run check
# Assert: No TypeScript errors
```

**Commit**: NO (group with Task 7)

---

### Task 7: Create MiniDevTools Component

**What to do**:
- Create collapsible panel with tabs: Console, Network, Errors
- Console tab: list of log entries with level icons
- Network tab: list of requests with status
- Errors tab: list of errors with stack traces
- Clear button per tab
- Badge showing count of unread items

**File**: `frontend/src/components/ui-new/views/MiniDevTools.tsx` (new file)

**Props**:
```typescript
interface MiniDevToolsProps {
  consoleLogs: ConsoleEntry[];
  networkRequests: NetworkEntry[];
  errors: ErrorEntry[];
  onClearConsole: () => void;
  onClearNetwork: () => void;
  onClearErrors: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}
```

**UI Design**:
```
Collapsed:
┌─────────────────────────────────────────────────────────────────────┐
│ [▲] DevTools  [Console: 5] [Network: 12] [Errors: 2]               │
└─────────────────────────────────────────────────────────────────────┘

Expanded:
┌─────────────────────────────────────────────────────────────────────┐
│ [▼] DevTools                                                  [Clear]│
│ ┌────────┬─────────┬────────┐                                       │
│ │Console │ Network │ Errors │                                       │
│ └────────┴─────────┴────────┘                                       │
│ ────────────────────────────────────────────────────────────────────│
│ 12:34:56 [LOG]  User clicked button                                │
│ 12:34:57 [WARN] Deprecation warning: ...                           │
│ 12:34:58 [ERR]  Cannot read property 'x' of undefined              │
│          └─ at Component.render (App.tsx:42)                        │
│             at renderWithHooks (react-dom.js:1234)                  │
└─────────────────────────────────────────────────────────────────────┘
```

**Console Entry UI**:
```
[LEVEL_ICON] [TIMESTAMP] [FORMATTED_ARGS...]
```

**Network Entry UI**:
```
[STATUS_BADGE] [METHOD] [URL]                    [DURATION]
   200           GET     /api/users                 123ms
   404           POST    /api/missing               45ms
   ●             GET     /api/loading...            -
```

**Error Entry UI**:
```
[ERROR_ICON] [MESSAGE]
             [COLLAPSIBLE_STACK_TRACE]
```

**Acceptance Criteria**:
```bash
pnpm run check
# Assert: No TypeScript errors
```

**Commit**: YES
- Message: `feat(frontend): add PreviewNavigation and MiniDevTools components`
- Files: `frontend/src/components/ui-new/views/PreviewNavigation.tsx`, `frontend/src/components/ui-new/views/MiniDevTools.tsx`

---

### Task 8: Integrate into PreviewBrowser

**What to do**:
- Import and use PreviewNavigation component
- Import and use MiniDevTools component
- Initialize usePreviewDevTools hook
- Initialize PreviewDevToolsBridge with iframe ref
- Persist devtools panel collapsed state in usePreviewSettings
- Layout: Navigation → iframe → DevTools

**File**: `frontend/src/components/ui-new/views/PreviewBrowser.tsx`
**File**: `frontend/src/components/ui-new/containers/PreviewBrowserContainer.tsx`

**Changes to PreviewBrowser.tsx**:
```typescript
interface PreviewBrowserProps {
  // ... existing props
  
  // New props for devtools
  devTools: UsePreviewDevToolsReturn;
  bridge: PreviewDevToolsBridge;
  devToolsCollapsed: boolean;
  onToggleDevToolsCollapsed: () => void;
}

// In render:
<div className="flex flex-col h-full">
  {/* Navigation toolbar */}
  <PreviewNavigation
    navigation={devTools.navigation}
    onBack={() => bridge.navigateBack()}
    onForward={() => bridge.navigateForward()}
    onRefresh={() => bridge.refresh()}
    onNavigateTo={(url) => bridge.navigateTo(url)}
  />
  
  {/* Existing toolbar with URL override, screen size, etc. */}
  <div className="toolbar">...</div>
  
  {/* iframe container */}
  <div className="flex-1">
    <iframe ref={iframeRef} ... />
  </div>
  
  {/* DevTools panel */}
  <MiniDevTools
    consoleLogs={devTools.consoleLogs}
    networkRequests={devTools.networkRequests}
    errors={devTools.errors}
    onClearConsole={devTools.clearConsole}
    onClearNetwork={devTools.clearNetwork}
    onClearErrors={devTools.clearErrors}
    isCollapsed={devToolsCollapsed}
    onToggleCollapse={onToggleDevToolsCollapsed}
  />
</div>
```

**Changes to PreviewBrowserContainer.tsx**:
- Create iframe ref with useRef
- Initialize usePreviewDevTools
- Initialize PreviewDevToolsBridge in useEffect
- Pass devtools props to PreviewBrowser

**Acceptance Criteria**:
```bash
pnpm run check
pnpm run dev
# Manual: Open preview, verify navigation and devtools appear
```

**Commit**: YES
- Message: `feat(frontend): integrate navigation and devtools into PreviewBrowser`
- Files: `frontend/src/components/ui-new/views/PreviewBrowser.tsx`, `frontend/src/components/ui-new/containers/PreviewBrowserContainer.tsx`, `frontend/src/hooks/usePreviewSettings.ts`

---

### Task 9: Replace Placeholder with Real Script in Rust Proxy

**What to do**:
- Read devtools_script.js content using include_str!
- Replace DEVTOOLS_PLACEHOLDER_SCRIPT with real script
- Optionally minify the script at compile time

**File**: `crates/server/src/preview_proxy/mod.rs`

**Changes**:
```rust
// OLD:
const DEVTOOLS_PLACEHOLDER_SCRIPT: &str =
    "<script>/* vibe-kanban-devtools-placeholder */</script>";

// NEW:
const DEVTOOLS_SCRIPT: &str = include_str!("devtools_script.js");

// In http_proxy_handler, replace:
html.insert_str(pos, DEVTOOLS_PLACEHOLDER_SCRIPT);

// With:
html.insert_str(pos, &format!("<script>{}</script>", DEVTOOLS_SCRIPT));
```

**Acceptance Criteria**:
```bash
cargo build --bin server
cargo test --workspace
pnpm run dev
# Manual: Open preview, check console for devtools ready message
```

**Commit**: YES
- Message: `feat(preview-proxy): inject devtools script into preview pages`
- Files: `crates/server/src/preview_proxy/mod.rs`

---

## Commit Strategy

| After Task | Message | Files |
|------------|---------|-------|
| 2 | `feat(preview-proxy): add devtools script` | devtools_script.js |
| 3 | `feat(preview-proxy): extend postMessage relay` | proxy_page.html |
| 5 | `feat(frontend): add previewDevToolsBridge` | types, hooks, utils |
| 7 | `feat(frontend): add navigation and devtools UI` | components |
| 8 | `feat(frontend): integrate devtools into preview` | PreviewBrowser* |
| 9 | `feat(preview-proxy): inject devtools script` | mod.rs |

---

## Success Criteria

### Final Checklist
- [ ] Console logs appear in Mini DevTools
- [ ] Network requests appear with status and timing
- [ ] Errors appear with stack traces
- [ ] Back/Forward/Refresh buttons work
- [ ] URL bar shows current page
- [ ] Panel collapse state persists
- [ ] No console errors in Vibe Kanban itself
- [ ] Works with Next.js dev server
- [ ] Works with Vite dev server
