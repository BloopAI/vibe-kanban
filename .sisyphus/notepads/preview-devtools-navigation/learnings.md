# Learnings - Preview DevTools & Navigation

## 2026-02-02 Task 1 & 2: Foundation Complete
- TypeScript types defined in `frontend/src/types/previewDevTools.ts`
- DevTools script created in `crates/server/src/preview_proxy/devtools_script.js`
- postMessage protocol uses `source: 'vibe-devtools'` to distinguish from click-to-component
- Script captures: console (log/warn/error/info/debug), network (fetch + XHR), errors (onerror + unhandledrejection), navigation (pushState/replaceState/popstate)

## Integration Pattern for DevTools Components (Task 3)

- Container component (PreviewBrowserContainer) manages:
  - `usePreviewDevTools` hook for state (consoleLogs, networkRequests, errors, navigation)
  - `PreviewDevToolsBridge` for postMessage communication with iframe
  - `devToolsCollapsed` state for MiniDevTools collapse/expand
  - Navigation handlers that delegate to bridge methods

- View component (PreviewBrowser) receives all state and handlers via props:
  - New props: iframeRef, devTools, onNavigateBack, onNavigateForward, onDevToolsRefresh, devToolsCollapsed, onToggleDevToolsCollapsed

- Only the desktop iframe gets the ref (not mobile) since mobile is scaled with transform

- PreviewNavigation goes in toolbar after URL Actions group
- MiniDevTools goes at bottom, only visible when showIframeContent is true
