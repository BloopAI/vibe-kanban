# Learnings - Preview iframe Security

## Session: ses_3f19c31deffe38wTo0LT0AnXIP

### Key Architecture Decisions
- Double iframe for origin isolation (different ports = different origins)
- Same process, two listeners (tokio::spawn)
- Reverse proxy with script injection
- UI stays in main app, proxy page only relays postMessage

### File Locations (verified)
- `frontend/src/components/ui-new/views/PreviewBrowser.tsx` - iframe rendering
- `frontend/src/components/ui-new/hooks/usePreviewUrl.ts` - URL detection
- `crates/server/src/main.rs` - single listener, needs dual
- `crates/server/src/routes/config.rs` - UserSystemInfo struct
- `scripts/setup-dev-environment.js` - port management

### Security Context
- Current: `sandbox="allow-scripts allow-same-origin"` is VULNERABLE
- Solution: Different port = different origin = secure
### Task 1 Implementation Details (Dual Listener Infrastructure)

**Pattern for Dual Listeners:**
- Use `tokio::select!` to coordinate main server and proxy server
- Both listeners share shutdown signal via select
- Preview proxy port stored in static `OnceLock<u16>` for API access

**Port File Format:**
- Updated to JSON format: `{"main_port": N, "preview_proxy_port": M}`
- Backward compatible reader: tries JSON first, falls back to plain number
- `PortInfo` struct with serde derive for serialization

**Key Code Locations:**
- `crates/server/src/preview_proxy/mod.rs` - module with empty router, port storage
- `crates/utils/src/port_file.rs` - JSON port file with backward compat

**Environment Variables:**
- `PREVIEW_PROXY_PORT` - set proxy port (default 0 for auto-assign)

**TypeScript Types:**
- `UserSystemInfo.preview_proxy_port: number | null` auto-generated via ts-rs

### Task 2 Implementation Details (Proxy Page HTML)

**Proxy Page Structure:**
- Minimal HTML with full-viewport iframe
- Query params (`target`, `path`) parsed client-side in JavaScript
- iframe src: `/dev-server-entry{path}?target={port}`

**postMessage Relay Pattern:**
```javascript
window.addEventListener('message', function(event) {
  // Filter by source identifier
  if (!event.data || event.data.source !== 'click-to-component') return;
  
  // Determine direction via event.source comparison
  if (event.source === window.parent) {
    iframe.contentWindow.postMessage(event.data, '*');  // Parent → Inner
  } else if (event.source === iframe.contentWindow) {
    window.parent.postMessage(event.data, '*');  // Inner → Parent
  }
});
```

**Rust Route Pattern:**
```rust
const PROXY_PAGE_HTML: &str = include_str!("proxy_page.html");

async fn proxy_page_handler() -> Html<&'static str> {
    Html(PROXY_PAGE_HTML)
}

// In router():
.route("/proxy", get(proxy_page_handler))
```

**Key Insight:**
- `include_str!` embeds HTML at compile time for zero-overhead serving
- Client-side query param parsing avoids Rust templating complexity

### Task 5: WebSocket Proxy Implementation

**Key Implementation Details:**
- Added `tokio-tungstenite` dependency with `connect` feature for client WebSocket connections
- WebSocket upgrade detection uses `FromRequestParts::from_request_parts()` to manually extract `WebSocketUpgrade` from request parts
- Cannot use `Option<WebSocketUpgrade>` as extractor since `WebSocketUpgrade` doesn't implement `OptionalFromRequestParts`
- Bidirectional forwarding uses two spawned tokio tasks with `tokio::select!` for graceful shutdown

**Message Type Conversions:**
- axum::ws::Message <-> tungstenite::Message require explicit conversion
- Both libraries use similar enum variants: Text, Binary, Ping, Pong, Close
- tungstenite has additional `Frame` variant which we skip (raw frames not typically used)

**Handler Pattern for Mixed WebSocket/HTTP:**
```rust
async fn handler(request: Request) -> Response {
    let (mut parts, body) = request.into_parts();
    if let Ok(ws) = WebSocketUpgrade::from_request_parts(&mut parts, &()).await {
        return ws.on_upgrade(|socket| async { /* handle ws */ }).into_response();
    }
    let request = Request::from_parts(parts, body);
    // handle HTTP
}
```

**Route Structure:**
- `/dev-server-entry/` - root path handler
- `/dev-server-entry/{*path}` - wildcard path handler
- Both use `any()` to support all HTTP methods


### Task 3 Implementation Details (HTTP Reverse Proxy)

**Route Pattern:**
- `/dev-server-entry/` - root path handler
- `/dev-server-entry/{*path}` - catch-all path handler
- Query param: `?target={port}` for dev server port

**Key Implementation Details:**
- Used `any()` router method for all HTTP method support
- Separate handlers for root and path routes (axum doesn't support `Option<Path>`)
- WebSocket detection via `WebSocketUpgrade::from_request_parts()` for inline WS handling
- `reqwest` Client with `redirect::Policy::none()` to preserve redirects
- 50MB body limit for request forwarding

**Headers Handling:**
- Skip request headers: host, connection, transfer-encoding, upgrade, websocket headers
- Strip response headers: CSP, X-Frame-Options, X-Content-Type-Options
- Add X-Forwarded-For, X-Forwarded-Host, X-Forwarded-Proto

**HTML Injection:**
- Detects `text/html` Content-Type
- Buffers HTML response for modification
- Injects placeholder script before `</body>`
- Skips content-length header for HTML (body size changes)

**Streaming:**
- Non-HTML responses streamed via `Body::from_stream()`
- HTML responses fully buffered for script injection

## PreviewBrowserContainer Proxy Integration (2026-02-02)

### Pattern Used
- Used existing `['user-system']` react-query key (same as ConfigProvider) to get `preview_proxy_port`
- `useMemo` for URL construction with deps: `[effectiveUrl, previewProxyPort, previewRefreshKey]`
- Proxy URL format: `http://{hostname}:{proxyPort}/proxy?target={port}&path={path}&_refresh={key}`

### Key Insight
- Using `window.location.hostname` ensures proxy works from any browser accessing the app (localhost, LAN IP, etc.)
- Falls back gracefully when `previewProxyPort` is null (returns undefined, iframe won't render)

