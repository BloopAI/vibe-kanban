# Preview Proxy Architecture: Cookie/Origin Analysis and Known Limitations

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Cookie and Origin Analysis](#2-cookie-and-origin-analysis)
   - [Same-Origin Policy and Cookies](#21-the-same-origin-policy-and-cookies)
   - [Does the Subdomain Proxy Solve This?](#22-does-our-subdomain-proxy-solve-this)
   - [Verdict](#23-verdict)
3. [Architectural Disadvantages](#3-architectural-disadvantages)
4. [Improvement Recommendations](#4-improvement-recommendations)
5. [File References](#5-file-references)

---

## 1. Architecture Overview

Vibe Kanban's preview system lets users view their running dev servers inside the main application UI. The core pieces:

- **Vibe Kanban app**: runs at `http://localhost:3001`
- **Preview proxy server**: runs at `http://localhost:9099`
- **Preview iframe URL pattern**: `http://{devPort}.localhost:{proxyPort}/path`
  - Example: `http://3000.localhost:9099/` proxies requests to `http://localhost:3000/`

When a user opens a preview, the proxy intercepts HTML responses and injects four scripts:

1. **bippy_bundle** (React DevTools fiber inspection)
2. **eruda_init** (mobile-style developer console)
3. **devtools_script** (framework detection and diagnostics)
4. **click_to_component_script** (click any element to find its source component)

Communication between the iframe (preview) and the parent window (Vibe Kanban) happens through `postMessage`. The proxy also handles WebSocket connections for HMR (Hot Module Replacement) passthrough.

```
┌──────────────────────────────────────────────────────────────────┐
│  Vibe Kanban App (http://localhost:3001)                         │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  <iframe src="http://3000.localhost:9099/">                │  │
│  │                                                            │  │
│  │    Browser sees origin: http://3000.localhost:9099         │  │
│  │    Proxy forwards to:   http://localhost:3000              │  │
│  │                                                            │  │
│  │    Injected: bippy_bundle.js                               │  │
│  │    Injected: eruda_init.js                                 │  │
│  │    Injected: devtools_script.js                            │  │
│  │    Injected: click_to_component_script.js                  │  │
│  │                                                            │  │
│  └────────────────────────────────────────────────────────────┘  │
│                          ▲                                       │
│                          │ postMessage('*')                      │
│                          ▼                                       │
│  Parent window receives component info, navigation events, etc.  │
└──────────────────────────────────────────────────────────────────┘
```

This architecture gives each dev server preview its own subdomain, which provides origin-level isolation for JavaScript APIs. But cookies are a different story entirely.

---

## 2. Cookie and Origin Analysis

This section is the heart of the document. Cookies and origins follow different rules in browsers, and the distinction matters enormously for a proxy architecture like ours.

### 2.1 The Same-Origin Policy and Cookies

**Origin** in browser security means scheme + host + port. These are three different origins:

- `http://localhost:3000`
- `http://localhost:3001`
- `http://localhost:9099`

JavaScript running in one origin can't read the DOM, storage, or network responses from another origin. This is the Same-Origin Policy, and it's the foundation of web security.

**Cookies don't follow the same rules.** This is the critical distinction.

Cookies are matched by **domain** and **path**. Port is irrelevant. Per RFC 6265 Section 8.5:

> *"Cookies do not provide isolation by port. If a cookie is readable by a service running on one port, the cookie is also readable by a service running on another port of the same server."*

What this means in practice:

- `http://localhost:3000` sets a cookie: `session=abc; Domain=localhost; Path=/`
- `http://localhost:3001` **can read this cookie** because `Domain=localhost` matches both
- `http://localhost:5173` can also read it
- Every dev server on every port shares the same cookie jar for `localhost`

Real consequences:

- **Authentication sessions leak between projects.** If Project A sets a session cookie on `localhost`, Project B's dev server can read it.
- **CSRF tokens collide.** Two apps using the same CSRF cookie name will overwrite each other's tokens.
- **Session stores interfere.** A logout in one project might invalidate sessions in another if they share a session store keyed by cookie.

This isn't a theoretical concern. Anyone running multiple dev servers simultaneously has likely hit mysterious auth failures caused by cookie collisions.

### 2.2 Does Our Subdomain Proxy Solve This?

Our proxy rewrites URLs so that `localhost:3000` becomes `3000.localhost:9099`. The question: does this fix the cookie problem?

**How browsers treat `localhost` subdomains:**

Modern browsers (Chrome 94+, Firefox 84+, Safari 15+) treat `localhost` as a special domain. The subdomain `3000.localhost` is recognized as a valid, distinct hostname from `5173.localhost`. But cookie handling for `localhost` subdomains is inconsistent across browsers, and the details matter.

**Scenario analysis:**

| Cookie Set By | Domain Attribute | Accessible from `3000.localhost:9099`? | Accessible from `5173.localhost:9099`? |
|---|---|---|---|
| `localhost:3000` | `Domain=localhost` | Depends on browser | Depends on browser |
| `localhost:3000` | (no Domain attr) | No (host-only cookie) | No |
| `3000.localhost:9099` | `Domain=.localhost` | Yes | Yes (LEAK!) |
| `3000.localhost:9099` | `Domain=3000.localhost` | Yes | No (isolated) |
| `3000.localhost:9099` | (no Domain attr) | Yes | No (host-only) |

Let's walk through each row.

**Row 1: Dev server sets `Domain=localhost`.**
The original dev server at `localhost:3000` sets a cookie with an explicit `Domain=localhost`. Through the proxy, the browser receives this `Set-Cookie` header but associates it with the proxy's domain (`3000.localhost`). Whether the browser accepts a cookie with `Domain=localhost` when the request was to `3000.localhost` depends on domain-matching rules. Most browsers will accept it because `3000.localhost` is a subdomain of `localhost`. This cookie then becomes visible to ALL `*.localhost` subdomains. This is a leak.

**Row 2: Dev server sets no Domain attribute.**
Without an explicit Domain, the cookie becomes "host-only" for the exact hostname the browser contacted. Since the browser contacted `3000.localhost`, the cookie is locked to `3000.localhost`. Other subdomains can't see it. This is the safe case.

**Row 3: Proxy-side script sets `Domain=.localhost`.**
If any JavaScript running on `3000.localhost` explicitly sets `document.cookie` with `Domain=.localhost`, that cookie is shared across all `*.localhost` subdomains. Cross-project leakage.

**Row 4: Proxy-side script sets `Domain=3000.localhost`.**
Properly scoped. Only `3000.localhost` can read it.

**Row 5: Proxy-side script sets no Domain.**
Host-only cookie for `3000.localhost`. Safe and isolated.

**The public suffix list complication:**

Chrome and Firefox maintain a Public Suffix List (PSL) that determines which domains are "registrable" vs. "public suffixes." A public suffix is a domain under which anyone can register subdomains (like `.com`, `.co.uk`).

`localhost` is treated as a public suffix in some browser implementations. When a domain is on the PSL, browsers reject cookies with `Domain=.localhost` because setting cookies on a public suffix would affect all subdomains, which is a security risk.

This is actually *good* for our architecture. If the browser rejects `Domain=.localhost` cookies, it prevents the leakage scenario in Row 3. But this behavior is browser-specific and not guaranteed.

**The cookie domain rewriting problem:**

Here's a subtler issue. When the dev server at `localhost:3000` sends a response with `Set-Cookie: session=abc; Domain=localhost; Path=/`, the proxy forwards this header unchanged. But the browser received this response from `3000.localhost:9099`, not from `localhost:3000`.

The browser now has to decide: should it accept a cookie with `Domain=localhost` from a response that came from `3000.localhost`? Domain-matching says yes (a subdomain can set cookies for its parent domain, unless the parent is a public suffix). But the cookie is now associated with `localhost`, not `3000.localhost`, meaning it's shared across all ports and subdomains.

The proxy doesn't rewrite `Set-Cookie` headers. It doesn't modify the `Domain` attribute to match the proxy subdomain. This means cookies that the dev server intended for `localhost` end up in an ambiguous state.

```
┌─────────────────────────────────────────────────────────────┐
│ Browser Cookie Jar                                          │
│                                                             │
│  Domain: localhost         → shared by ALL localhost ports  │
│    session=abc             ⚠️ LEAKS between projects        │
│                                                             │
│  Domain: 3000.localhost    → isolated to project A          │
│    auth_token=xyz          ✅ Safe, only project A sees it  │
│                                                             │
│  Domain: 5173.localhost    → isolated to project B          │
│    auth_token=def          ✅ Safe, only project B sees it  │
│                                                             │
│  Domain: .localhost        → SHARED between ALL subdomains  │
│    tracking=ghi            ⚠️ LEAKS, Chrome may reject this │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 2.3 Verdict

**The subdomain proxy architecture partially solves the cookie problem.**

What works:

- **Host-only cookies are isolated.** Cookies set without an explicit `Domain` attribute (the most common case for modern frameworks) are scoped to the specific subdomain (`3000.localhost`). They won't leak to `5173.localhost`. This covers the majority of cookie usage in development.
- **JavaScript storage is fully isolated.** `localStorage`, `sessionStorage`, and IndexedDB are all per-origin (scheme + host + port). `3000.localhost:9099` and `5173.localhost:9099` have completely separate storage. This is a real win.
- **Origin checks work correctly.** `postMessage` origin verification, `document.domain`, and `window.opener` all see distinct origins per dev server.

What doesn't work:

- **Dev server `Set-Cookie` headers get misattributed.** The browser associates cookies from the dev server's response with the proxy domain, not the original `localhost:{port}`. Authentication flows that rely on cookies being sent back to `localhost:{port}` will break because the browser sends them to `3000.localhost:9099` instead.
- **`Domain=.localhost` cookies leak.** If any code sets a cookie with `Domain=.localhost`, it's visible to all subdomains. Browser PSL behavior may block this, but it's not guaranteed.
- **The proxy doesn't intercept `Set-Cookie` headers.** No rewriting happens in either direction. Cookie domains pass through unchanged, creating the mismatch described above.

Summary table:

| Concern | Status | Notes |
|---|---|---|
| Origin isolation (JS) | ✅ Solved | postMessage, document.domain, window.opener |
| Storage isolation | ✅ Solved | localStorage, sessionStorage, IndexedDB |
| CSP/X-Frame-Options bypass | ✅ Solved | Headers stripped by proxy |
| Script injection | ✅ Solved | DevTools, navigation, click-to-component |
| Cookie isolation (host-only) | ✅ Mostly solved | Works when no explicit Domain is set |
| Cookie isolation (Domain=localhost) | ⚠️ Partial | Browser-dependent, PSL may help |
| Cookie isolation (Domain=.localhost) | ⚠️ Leaks | Chrome/Firefox PSL may reject |
| Dev server auth cookies | ❌ Broken | Domain mismatch through proxy |
| Service Worker scopes | ❌ Not solved | All under localhost |
| `window.name` persistence | ❌ Not solved | Shared across navigations |

---

## 3. Architectural Disadvantages

Beyond the cookie problem, the proxy architecture has several structural limitations worth documenting.

### 3.1 Unconditional Script Injection

All four scripts (bippy_bundle, eruda_init, devtools_script, click_to_component_script) are injected into every HTML response. There's no conditional logic.

**Performance impact.** The combined payload is roughly 800KB+ of JavaScript. The bippy_bundle alone is substantial. Every page load, every HTML response, every navigation within the iframe pays this cost.

**Compatibility waste.** VKBippy installs React DevTools hooks. On a Vue, Svelte, or plain HTML page, this work is entirely wasted. The hooks sit there doing nothing, consuming memory and potentially interfering with the page's own tooling.

**Interference risk.** The injected scripts could conflict with the dev server's own scripts. If a developer has the React DevTools browser extension installed, VKBippy's fiber inspection might clash with it. Two systems trying to instrument the same React fiber tree is a recipe for subtle bugs.

**CDN dependency.** Eruda is loaded from an external CDN on every page load. If the CDN is unreachable (corporate firewall, offline development, CDN outage), eruda fails silently. The page still works, but the developer console is gone without explanation.

A better approach: detect the framework at the proxy level by scanning the HTML content for markers (React root elements, Vue app mounts, Svelte component signatures) and inject only the relevant scripts.

### 3.2 Full HTML Buffering

The proxy buffers the entire HTML response in memory before injecting scripts and forwarding to the client.

**Memory pressure.** Large HTML pages (SPAs with significant inline data, server-rendered pages with embedded JSON payloads) consume proxy memory proportional to their size. The hardcoded 50MB body size limit caps this, but 50MB is still a lot of memory per request.

**Latency.** Time-to-first-byte (TTFB) increases because the client receives nothing until the proxy has the complete response, injects the scripts, and starts forwarding. For streaming SSR (Server-Side Rendering), this is a dealbreaker. Frameworks like Next.js and Remix can stream HTML chunks progressively. The proxy kills this by buffering everything.

**The fix** would be a streaming HTML parser that watches for `<head>` or `<body>` tags, injects the scripts at the right position, and passes everything else through unchanged. This is significantly more complex to implement but would preserve streaming SSR and reduce TTFB.

### 3.3 No HTTPS Support

The proxy handles only `http://` connections. Dev servers running HTTPS aren't supported.

In practice, this is less severe than it sounds. Most browsers treat `localhost` as a secure context regardless of scheme, so APIs like Web Crypto, Geolocation, and Notifications still work. Service Workers are the main exception: they require HTTPS in production, and while `localhost` gets a pass, the proxy's subdomain (`3000.localhost`) might not in all browsers.

Mixed content warnings could also appear if the main Vibe Kanban app ever moves to HTTPS while previews remain on HTTP.

### 3.4 Single-Host Architecture

The proxy only forwards to `localhost:{port}`. It assumes the dev server runs on the same machine.

This breaks for:

- **Docker-based development.** Dev servers inside containers run on different network interfaces. `localhost` inside the container isn't `localhost` on the host.
- **Remote development.** SSH tunnels, WSL2 (which has its own network namespace), and cloud development environments all have scenarios where the dev server isn't reachable at `127.0.0.1`.
- **IPv6.** Only IPv4 `localhost` (127.0.0.1) is supported. `[::1]` won't work.

### 3.5 No Redirect Rewriting

The proxy uses `redirect(Policy::none())`, passing redirect responses through without modification.

Here's the problem: if a dev server at `localhost:3000` redirects from `/` to `/login`, it sends a `302` with `Location: http://localhost:3000/login`. The proxy forwards this header unchanged. The browser follows the redirect to `localhost:3000/login` directly, bypassing the proxy entirely.

The user's preview iframe suddenly navigates away from the proxy URL to the raw dev server URL. The injected scripts are gone. PostMessage communication breaks. The preview is effectively broken.

```
┌─────────────────────────────────────────────────────────────┐
│  Redirect Flow (Current, Broken)                            │
│                                                             │
│  Browser → GET http://3000.localhost:9099/                  │
│  Proxy   → GET http://localhost:3000/                       │
│  Server  → 302 Location: http://localhost:3000/login        │
│  Proxy   → 302 Location: http://localhost:3000/login        │
│  Browser → GET http://localhost:3000/login  ← BYPASSES PROXY│
│                                                             │
│  Redirect Flow (Fixed)                                      │
│                                                             │
│  Browser → GET http://3000.localhost:9099/                  │
│  Proxy   → GET http://localhost:3000/                       │
│  Server  → 302 Location: http://localhost:3000/login        │
│  Proxy   → 302 Location: http://3000.localhost:9099/login   │
│  Browser → GET http://3000.localhost:9099/login ← STAYS     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

The fix: rewrite `Location` headers in 3xx responses, replacing `localhost:{port}` with `{port}.localhost:{proxyPort}`.

### 3.6 WebSocket Path Handling

WebSocket connections are proxied to `ws://localhost:{port}/{path}`, but some dev servers use specific WebSocket paths with query parameters for HMR.

Vite, for example, uses `/__vite_hmr` or `/_vite/hmr` with specific query parameters. If the proxy doesn't preserve these exactly, HMR breaks. The fallback routing partially mitigates this, but edge cases exist, particularly with dev servers that negotiate WebSocket upgrades on non-standard paths.

### 3.7 Svelte 5 Runes Detection

Svelte 5 with runes mode deliberately removed `__svelte_meta` (Svelte issue #11389). There is no runtime detection method for Svelte 5 runes components.

The click-to-component feature relies on runtime metadata to map DOM elements back to source components. Without `__svelte_meta`, the Svelte adapter can't find component boundaries or source locations. As Svelte 5 runes becomes the default, this adapter will stop working for new Svelte projects.

This isn't a bug in our code. It's a deliberate framework decision that makes external tooling harder.

### 3.8 Vue Line Numbers

Vue 3's runtime exposes component file paths via `instance.type.__file` but not source line numbers. Users see which file a component lives in, but not which line.

For small single-file components, the file path is enough. For large SFCs with hundreds of lines, it's much less helpful. Getting line numbers would require a build plugin like `unplugin-vue-source` that embeds source maps or line metadata at compile time. This is outside the proxy's control.

### 3.9 PostMessage Wildcard Origin

All `postMessage` calls use `window.parent.postMessage(msg, '*')` with a wildcard origin.

In the current localhost-only architecture, this is acceptable. Any window on the same machine could receive these messages, but the attack surface is minimal. For remote or cloud deployments, though, the wildcard means any parent window could intercept component detection data, navigation events, and diagnostic information.

The fix is straightforward: replace `'*'` with the specific Vibe Kanban origin URL (e.g., `http://localhost:3001`). This requires the injected scripts to know the parent origin, which could be passed as a configuration parameter during injection.

### 3.10 Race Condition in Framework Detection

`detectFrameworks()` runs on `DOMContentLoaded`, but some frameworks aren't fully initialized at that point. React with lazy loading, Vue with async components, and any framework that defers initialization will be missed.

The diagnostic log may show `[vk-ctc] Detected frameworks: none` even though a framework loads moments later. This is misleading but not functionally broken: the actual adapter dispatch happens on each click event, by which time the framework is typically initialized. The detection log is purely diagnostic.

---

## 4. Improvement Recommendations

Ordered by priority and impact:

| Priority | Improvement | Effort | Impact |
|---|---|---|---|
| **HIGH** | Redirect URL rewriting | Low | Fixes broken navigation in previews |
| **HIGH** | PostMessage origin restriction | Low | Security hardening for remote deployments |
| **MEDIUM** | Conditional script injection | Medium | ~800KB less JS on non-React pages |
| **MEDIUM** | Set-Cookie domain rewriting | Medium | Fixes auth flows through the proxy |
| **LOW** | Streaming HTML injection | High | Preserves SSR streaming, reduces TTFB |
| **LOW** | HTTPS proxy support | High | Enables secure-context-only APIs |

### Redirect URL rewriting (HIGH)

Intercept 3xx responses and rewrite `Location` headers. Replace `http://localhost:{port}/path` with `http://{port}.localhost:{proxyPort}/path`. This is a small change with outsized impact: without it, any dev server that uses redirects (login flows, OAuth callbacks, route guards) breaks the preview.

### PostMessage origin restriction (HIGH)

Replace `'*'` with the Vibe Kanban app's origin in all `postMessage` calls. Pass the origin as a variable during script injection. Minimal effort, meaningful security improvement.

### Conditional script injection (MEDIUM)

Before injecting scripts, scan the HTML response for framework markers. Only inject bippy_bundle if React markers are found. Only inject framework-specific detection code for detected frameworks. Eruda could be opt-in rather than always-on.

### Set-Cookie domain rewriting (MEDIUM)

Intercept `Set-Cookie` response headers and rewrite `Domain=localhost` to `Domain={port}.localhost`. This ensures cookies set by the dev server are properly scoped to the proxy subdomain. Also intercept outgoing `Cookie` request headers and reverse the rewriting so the dev server sees the cookies it expects.

### Streaming HTML injection (LOW)

Replace the full-buffer approach with a streaming HTML parser. Watch for `<head>` or `</head>` tags in the stream, inject scripts at the right position, and pass everything else through. This preserves streaming SSR and reduces TTFB. The implementation is complex (handling chunked transfer encoding, partial tag boundaries) but the payoff is significant for Next.js/Remix users.

### HTTPS proxy support (LOW)

Add TLS termination to the proxy, or support proxying to HTTPS dev servers. This is low priority because `localhost` is already treated as a secure context in most browsers, but it becomes important for cloud/remote deployments.

---

## 5. File References

| File | Lines | Purpose |
|---|---|---|
| `crates/server/src/preview_proxy/mod.rs` | ~407 | Main proxy server implementation |
| `frontend/src/components/ui-new/containers/PreviewBrowserContainer.tsx` | - | Frontend URL construction for preview iframes |
| `crates/server/src/preview_proxy/bippy_bundle.js` | - | React fiber inspection script |
| `crates/server/src/preview_proxy/eruda_init.js` | - | Mobile developer console initialization |
| `crates/server/src/preview_proxy/devtools_script.js` | - | Framework detection and diagnostics |
| `crates/server/src/preview_proxy/click_to_component_script.js` | - | Click-to-source-component mapping |
