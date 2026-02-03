# Decisions - Preview DevTools & Navigation

## Architecture Decisions
- Using postMessage relay through proxy_page.html (same pattern as click-to-component)
- DevTools script is injected via Rust proxy before </body>
- State management via custom hook (usePreviewDevTools) rather than global store
