# Mobile & PWA Implementation Guide

Comprehensive reference for the Vibe Kanban mobile-responsive layout and PWA configuration.

## Architecture Overview

Mobile detection uses a media query `(max-width: 767px)` via the `useIsMobile()` hook (`src/hooks/useIsMobile.ts`). The mobile layout replaces the desktop multi-panel layout with a single-panel tab navigation system.

### Key Files

| File | Role |
|------|------|
| `src/hooks/useIsMobile.ts` | Mobile detection hook (767px breakpoint) |
| `src/stores/useUiPreferencesStore.ts` | `MobileTab` type, `mobileActiveTab` state, `mobileFontScale` |
| `src/components/ui-new/views/Navbar.tsx` | Mobile tab bar + info bar rendering |
| `src/components/ui-new/containers/NavbarContainer.tsx` | Mobile navbar state/logic (settings, board nav, back nav) |
| `src/components/ui-new/containers/SharedAppLayout.tsx` | Root layout, `h-dvh` on mobile, safe area padding |
| `src/components/ui-new/containers/WorkspacesLayout.tsx` | Mobile tab content panels (show/hide via CSS `hidden`) |
| `src/pages/ui-new/ProjectKanban.tsx` | Mobile kanban: shows board OR issue panel (full-screen swap) |
| `src/components/ui-new/views/PreviewBrowser.tsx` | Mobile-optimized preview toolbar |
| `src/styles/new/index.css` | Body scroll lock, overscroll, background, font scale |
| `public/site.webmanifest` | PWA manifest |
| `index.html` | Meta tags (theme-color, apple-mobile-web-app) |

## Mobile Tab System

### Tab Types

Defined in `useUiPreferencesStore.ts`:

```ts
type MobileTab = 'workspaces' | 'chat' | 'changes' | 'logs' | 'preview' | 'git';
```

Tabs are defined in `Navbar.tsx` as `MOBILE_TABS` array with icon, label, and id.

### Tab Content Rendering

In `WorkspacesLayout.tsx`, all tab contents are rendered as siblings and toggled via CSS `hidden` class (not unmounted). This preserves scroll position and component state:

```tsx
<div className={cn('h-full overflow-hidden', mobileTab !== 'chat' && 'hidden')}>
  <WorkspacesMainContainer ... />
</div>
```

### Tab Bar Layout (Navbar mobile mode)

The mobile navbar has two rows:

1. **Row 1 (Tab Bar)**: Horizontal scrollable icon tabs + right-side controls (settings gear, command bar, user popover)
2. **Row 2 (Info Bar)**: Workspace branch name (centered), remote issue link (left), board navigation button (right)

On project pages, Row 1 shows a back button + org name instead of tabs, and Row 2 is hidden.

## Navigation Between Views

### Workspace → Board

The info bar shows a kanban icon button when the workspace is linked to a remote project. It navigates to `/projects/:projectId` (or `/projects/:projectId/issues/:issueId` if an issue is linked).

### Board → Workspaces

The project page mobile header includes a back button (CaretLeftIcon) that navigates to `/workspaces`.

### Issue Detail on Mobile

On the kanban page (`ProjectKanban.tsx`), mobile shows either the board OR the issue detail panel full-screen. When `isRightPanelOpen` is true, `ProjectRightSidebarContainer` replaces the board entirely. The issue panel already includes the `KanbanIssuePanelContainer` with all its features.

## Preview Browser (Mobile)

The preview toolbar is simplified on mobile:
- **Compact mode**: Globe icon (URL), refresh, open-in-tab, start/stop buttons
- **Expanded URL mode**: Full-width URL input with submit/close (triggered by tapping globe icon)
- Hidden on mobile: navigation (back/forward), inspect mode, devtools toggle, screen size selector

State for the URL bar expansion is managed in `PreviewBrowserContainer` and passed as props to the view.

## PWA Configuration

### Manifest (`public/site.webmanifest`)

- `display: "standalone"` — no browser chrome
- `background_color: "#f2f2f2"` — matches light mode `bg-secondary`
- `theme_color: "#f2f2f2"` — status bar color
- Icons: SVG only (any + maskable)

### Meta Tags (`index.html`)

- `viewport-fit=cover` — extends content under notch/safe areas
- `theme-color` with `prefers-color-scheme` media queries for light (#f2f2f2) and dark (#212121)
- `apple-mobile-web-app-capable: yes`
- `apple-mobile-web-app-status-bar-style: default`

### Safe Area Handling

- Root container uses `pb-[env(safe-area-inset-bottom)]` on mobile for home indicator spacing
- Chat box uses `pb-[env(safe-area-inset-bottom)]` for keyboard-adjacent input

## Scroll & Overscroll

- `overscroll-behavior: none` on html/body/#root prevents rubber-banding
- `overflow: hidden; height: 100%` on html/body at mobile breakpoint prevents document scrolling
- Root layout uses `h-dvh` (dynamic viewport height) on mobile to handle address bar changes
- Each tab content panel manages its own internal scrolling (`overflow-auto` or `overflow-hidden`)

## Font Scaling

Mobile font scaling is controlled via `--mobile-font-scale` CSS custom property applied on the `.new-design` root at mobile breakpoint. The scale value is stored in `useUiPreferencesStore.mobileFontScale` and persisted to `localStorage`.

Options: `'default'` (100%), `'small'` (95%), `'smaller'` (90%)

Since all sizes use `rem` units, scaling the root `font-size` proportionally adjusts all text, spacing, and icons.

## Body Background

The body background color is set to match the VK default:
- Light mode: `#f2f2f2` (matches `--bg-secondary`)
- Dark mode: `#212121` (matches `--bg-primary`)

This ensures no white flash on PWA launch and consistent appearance when content is shorter than viewport.

## Adding New Mobile Tabs

1. Add the tab id to `MobileTab` type in `useUiPreferencesStore.ts`
2. Add entry to `MOBILE_TABS` array in `Navbar.tsx` (icon + label)
3. Add content panel in `WorkspacesLayout.tsx` mobile section following the existing pattern
4. Auto-switch logic (if needed) goes in `WorkspacesSidebarContainer.tsx`

## Mobile-Specific Styling Conventions

- Use `isMobile` from `useIsMobile()` for conditional rendering
- Prefer CSS-based responsive (`hidden md:block`) for simple show/hide
- Use `min-[480px]:inline` for tab labels that hide on narrow phones
- For touch targets, minimum 44x44px tap area
- Use `shrink-0` on fixed-width elements to prevent flex shrinking
- Prefer `gap-1` (tighter) on mobile vs `gap-base` on desktop for tab bars

## Testing Checklist

- [ ] Tab switching preserves scroll position and component state
- [ ] Keyboard doesn't push layout (viewport-fit=cover + dvh)
- [ ] No vertical bounce/overscroll when at content boundaries
- [ ] Safe area insets respected on notched devices
- [ ] PWA install shows correct icon, name, and background color
- [ ] Settings accessible via gear icon in mobile navbar
- [ ] Board navigation works when workspace is linked to a project
- [ ] Preview URL bar expands/collapses correctly
- [ ] Font scaling applies to content but buttons remain usable
