# Keyboard Shortcuts: Philosophy & Implementation Guide for Vibe-Kanban

A comprehensive guide to designing and implementing keyboard-first experiences in Vibe-Kanban. This document covers the philosophy, architecture patterns, and practical implementation details for building a keyboard-driven interface optimized for AI-assisted coding workflows.

---

## Table of Contents

1. [Philosophy](#1-philosophy)
2. [Hotkey Grammar Design](#2-hotkey-grammar-design)
3. [Architecture Layers](#3-architecture-layers)
4. [Implementation Patterns](#4-implementation-patterns)
5. [Context Awareness](#5-context-awareness)
6. [React Implementation](#6-react-implementation)
7. [User Experience](#7-user-experience)
8. [Testing & Maintenance](#8-testing--maintenance)
9. [Current State vs Future](#9-current-state-vs-future)

---

## 1. Philosophy

### The "Speed of Thought" Goal

The goal of a keyboard-first interface is **removing the cognitive gap between thought and action**. Every mouse reach, every visual search for a button, every multi-click navigation flow introduces latency between what the user wants and what happens. Well-designed keyboard shortcuts eliminate these gaps.

### Keyboard-First for AI-Assisted Coding

Vibe-Kanban is designed for developers working with AI coding assistants. Users frequently:
- **Switch between workspaces** to compare approaches or review parallel tasks
- **Navigate panels** (chat, changes, logs, preview) to monitor agent progress
- **Execute git operations** (create PR, merge, rebase, push) on completed work
- **Toggle views** to inspect diffs, preview changes, or check terminal output

These high-frequency actions are prime candidates for keyboard shortcuts that keep hands on the keyboard and eyes on the code.

### Keyboard-First, Not Keyboard-Accessible

Most applications treat hotkeys as a secondary layer bolted onto a mouse-driven interface. A keyboard-first application inverts this:

| Keyboard-Accessible | Keyboard-First |
|---------------------|----------------|
| Mouse is primary input | Keyboard is primary input |
| Shortcuts are optional enhancements | Shortcuts are core functionality |
| Power users discover shortcuts | Everyone is trained to use shortcuts |
| "Press Ctrl+S to save faster" | "Save (Ctrl+S)" shown on every button |

### Flow State Preservation

Users in complex applications (especially developers working with AI) work in flow states. Every context switch—reaching for mouse, visually searching for a button, clicking through menus—breaks flow.

The keyboard-first philosophy optimizes for:
- **Hands on home row**: Minimize mouse usage
- **Muscle memory**: Consistent, mnemonic shortcuts that become automatic
- **Predictable interaction**: Same patterns everywhere in the application

### Discoverability vs. Learnability

A keyboard-first interface must solve the tension between:
- **Discoverability**: New users need to find available actions
- **Learnability**: Users need to build muscle memory

The solution: **Show shortcuts everywhere**. Display the hotkey next to every action in menus, tooltips, and the command bar. This creates a continuous training loop: "You clicked this today, but next time press `G S`."

---

## 2. Hotkey Grammar Design

### Why Sequential Shortcuts Work

Single-key shortcuts quickly exhaust the keyboard. Sequential (chorded) shortcuts, inspired by Vim and Gmail, solve this:

```
Single keys: 26 letters + 10 numbers = 36 shortcuts
Sequential:  36 first keys × 36 second keys = 1,296 combinations
```

Sequential shortcuts also create **mnemonic patterns** that users remember:
- `G + S` = **G**o to **S**ettings
- `W + D` = **W**orkspace **D**uplicate
- `X + P` = E**x**ecute (Git) **P**ull Request

### The Vibe-Kanban Namespace Scheme

Organize shortcuts into semantic namespaces using the first key:

| Prefix | Domain | Mnemonic | Examples |
|--------|--------|----------|----------|
| `G` | Go/Navigate | **G**o | `G S` Settings, `G N` New workspace |
| `W` | Workspace | **W**orkspace | `W D` Duplicate, `W R` Rename, `W P` Pin, `W A` Archive, `W X` Delete |
| `V` | View/Panel | **V**iew | `V C` Changes, `V L` Logs, `V P` Preview, `V S` Sidebar |
| `X` | Git | E**x**ecute | `X P` Create PR, `X M` Merge, `X R` Rebase, `X U` Push |
| `Y` | Yank/Copy | **Y**ank (Vim) | `Y P` Copy path, `Y L` Copy logs |
| `T` | Toggle | **T**oggle | `T D` Dev server, `T W` Wrap lines |
| `R` | Run | **R**un | `R S` Setup script, `R C` Cleanup script |

### High-Frequency Single Keys

Keep these as single-key shortcuts for maximum speed:

| Key | Action | Rationale |
|-----|--------|-----------|
| `c` | Create task/workspace | Universal creation pattern |
| `j` / `k` | Move down/up | Vim navigation (current column) |
| `h` / `l` | Move left/right | Vim navigation (between columns) |
| `d` | Delete selected | Vim-style delete |
| `/` | Focus search / Command bar | Universal search convention |
| `Esc` | Close/cancel | Universal escape |
| `?` (`Shift+/`) | Show help | Universal help convention |

### Mnemonic Design Principles

1. **First letter when possible**: `S` for settings, `C` for changes
2. **Common letter if first is taken**: `X` for git (e**X**ecute), since `G` is for go
3. **Vim conventions for common actions**: `Y` for yank (copy), `d` for delete
4. **Gmail conventions for navigation**: `G` for go

### Avoiding Collisions

Rules to prevent shortcut collisions:

1. **Namespaces are exclusive**: `G` is only for navigation, never for workspace actions
2. **Same second key can exist in different namespaces**: `W R` (workspace rename) and `G R` (go to repos) are distinct
3. **Reserve single keys for highest-frequency global actions**: `/` for search, `Escape` for close
4. **Modifier shortcuts for system-level actions**: `Cmd+K` for command palette, `Cmd+Enter` for submit

---

## 3. Architecture Layers

A complete keyboard system has four complementary layers. Here's how they map to Vibe-Kanban:

### Layer 1: Command Palette (`Cmd+K`)

**Implementation:** `CommandBarDialog` using [cmdk](https://cmdk.paco.me/)

**Files:**
- `frontend/src/components/ui-new/dialogs/commandBar/` - UI components
- `frontend/src/components/ui-new/actions/index.ts` - Action definitions (40+)
- `frontend/src/components/ui-new/actions/pages.ts` - Page hierarchy

The command bar provides:
- **Fuzzy search** over all available actions
- **Context awareness**: Shows relevant commands based on current workspace/panel
- **Action execution**: Runs commands directly
- **Hierarchical pages**: Nested action groups (Workspace, Git, View, etc.)

### Layer 2: Search (`/`)

In Vibe-Kanban, search currently shares the command bar via `Cmd+K`. The `/` key opens the same interface.

**Why merge search and commands?** Vibe-Kanban's primary "search" targets are actions and workspaces, not arbitrary text content. The command bar serves both needs.

**Future consideration:** If full-text search across workspace content is added, separating "find content" (`/`) from "do action" (`Cmd+K`) may become valuable.

### Layer 3: Sequential Hotkeys

**Status:** Not yet implemented in Vibe-Kanban.

The target experience:
- User types `G S` → immediately opens settings
- User types `W D` → immediately duplicates workspace
- No palette opens, no confirmation needed

For users who've learned the shortcuts, this is the fastest path.

### Layer 4: Global Modifier Shortcuts

**Implementation:** `frontend/src/keyboard/registry.ts` + react-hotkeys-hook

**Current shortcuts:**

| Shortcut | Action | Scope |
|----------|--------|-------|
| `Cmd+K` | Open command bar | Global |
| `Cmd+Enter` | Submit/cycle views | Dialog, Kanban |
| `Cmd+Shift+Enter` | Alt submit/cycle backward | Dialog, Kanban |
| `Esc` | Close/cancel | Context-dependent |
| `Shift+/` | Show keyboard help | Global |

### How the Layers Interact

```
┌─────────────────────────────────────────────────────────────┐
│              User Wants to Create a Pull Request            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   Expert Path (0.3s)          Learner Path (2-3s)          │
│   ┌──────────────┐            ┌──────────────┐             │
│   │  Types X P   │            │  Cmd+K opens │             │
│   │  directly    │            │   palette    │             │
│   └──────┬───────┘            └──────┬───────┘             │
│          │                           │                      │
│          │                    ┌──────▼───────┐             │
│          │                    │ Types "pull" │             │
│          │                    │ sees XP hint │             │
│          │                    └──────┬───────┘             │
│          │                           │                      │
│          ▼                           ▼                      │
│   ┌─────────────────────────────────────────┐              │
│   │        Opens Create PR Dialog            │              │
│   └─────────────────────────────────────────┘              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. Implementation Patterns

### Current Architecture: Semantic Hooks

Vibe-Kanban uses a semantic hook pattern where actions are defined in a central registry:

```typescript
// frontend/src/keyboard/registry.ts

export enum Action {
  EXIT = 'exit',
  CREATE = 'create',
  SUBMIT = 'submit',
  FOCUS_SEARCH = 'focus_search',
  NAV_UP = 'nav_up',
  NAV_DOWN = 'nav_down',
  // ... more actions
}

export const keyBindings: KeyBinding[] = [
  {
    action: Action.CREATE,
    keys: 'c',
    scopes: [Scope.KANBAN],
    description: 'Create new task',
    group: 'Kanban',
  },
  // ... more bindings
];
```

Hooks consume actions semantically:

```typescript
// frontend/src/keyboard/hooks.ts
export const useKeyCreate = createSemanticHook(Action.CREATE);
export const useKeyExit = createSemanticHook(Action.EXIT);

// Usage in component
useKeyCreate(() => openTaskForm(), { scope: Scope.KANBAN });
```

### Adding Sequential Shortcuts: The Buffer Approach

To add sequential shortcuts alongside the existing system:

```typescript
interface SequentialHotkey {
  keys: string[];     // e.g., ['g', 's']
  action: () => void; // What to execute
}

function useSequentialHotkeys(hotkeys: SequentialHotkey[]) {
  const bufferRef = useRef<string[]>([]);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleKeyDown = (event: KeyboardEvent) => {
    // 1. Ignore if typing in input (use existing isInputFocused check)
    if (isInputFocused()) return;

    // 2. Ignore modifier combinations (these go to Layer 4)
    if (event.metaKey || event.ctrlKey || event.altKey) return;

    // 3. Only track alphanumeric keys
    const key = event.key.toLowerCase();
    if (!/^[a-z0-9]$/.test(key)) {
      clearBuffer();
      return;
    }

    // 4. Add to buffer
    bufferRef.current.push(key);

    // 5. Reset timeout (500ms window between keys)
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(clearBuffer, 500);

    // 6. Check for matches
    for (const hotkey of hotkeys) {
      if (bufferMatchesHotkey(bufferRef.current, hotkey.keys)) {
        event.preventDefault();
        clearBuffer();
        hotkey.action();
        return;
      }
    }

    // 7. Trim buffer if too long
    if (bufferRef.current.length > 5) {
      bufferRef.current = bufferRef.current.slice(-5);
    }
  };
}
```

### Integration with Existing Scope System

Sequential shortcuts should respect the existing `Scope` system:

```typescript
interface SequentialHotkey {
  keys: string[];
  action: () => void;
  scopes?: Scope[];  // Optional: limit to specific scopes
}

// Check scope before executing
const { enabledScopes } = useHotkeysContext();
if (hotkey.scopes && !hotkey.scopes.some(s => enabledScopes.has(s))) {
  return; // Shortcut not active in current context
}
```

### Timeout Management

The 500ms timeout between keys is a UX-critical value:

| Timeout | Tradeoff |
|---------|----------|
| < 300ms | Too fast—users can't remember and type the sequence |
| 300-500ms | Sweet spot for trained users |
| > 700ms | Feels sluggish, buffer "hangs" too long |

Consider making this configurable in Settings for accessibility.

---

## 5. Context Awareness

### Vibe-Kanban Scope System

The existing `Scope` enum defines contexts where shortcuts behave differently:

```typescript
// frontend/src/keyboard/registry.ts

export enum Scope {
  GLOBAL = 'global',           // Always available
  DIALOG = 'dialog',           // In any dialog
  CONFIRMATION = 'confirmation', // In confirmation dialogs
  KANBAN = 'kanban',           // On the kanban board
  PROJECTS = 'projects',       // In projects view
  SETTINGS = 'settings',       // In settings
  EDIT_COMMENT = 'edit-comment', // Editing a review comment
  APPROVALS = 'approvals',     // In approval queue
  FOLLOW_UP = 'follow-up',     // In follow-up input
  FOLLOW_UP_READY = 'follow-up-ready', // Follow-up ready to send
}
```

### Scope-Specific Behavior

The same action can have different meanings per scope:

| Action | Kanban Scope | Dialog Scope | Approvals Scope |
|--------|--------------|--------------|-----------------|
| `Esc` | Close panel or navigate to projects | Close dialog or blur input | N/A |
| `Enter` | N/A | Submit form | Approve request |
| `Cmd+Enter` | Open details / cycle views | Submit task | Deny request |
| `c` | Create new task | N/A | N/A |

### Enabling/Disabling Scopes

Use `useHotkeysContext()` from react-hotkeys-hook to manage active scopes:

```typescript
import { useHotkeysContext } from 'react-hotkeys-hook';

function DialogComponent() {
  const { enableScope, disableScope } = useHotkeysContext();

  useEffect(() => {
    enableScope(Scope.DIALOG);
    return () => disableScope(Scope.DIALOG);
  }, []);
}
```

### Action Visibility Context

Command bar actions use `ActionVisibilityContext` for conditional display:

```typescript
// frontend/src/components/ui-new/actions/index.ts

export interface ActionVisibilityContext {
  // Layout state
  rightMainPanelMode: 'changes' | 'logs' | 'preview' | null;
  isLeftSidebarVisible: boolean;
  isLeftMainPanelVisible: boolean;
  isRightSidebarVisible: boolean;
  isCreateMode: boolean;

  // Workspace state
  hasWorkspace: boolean;
  workspaceArchived: boolean;

  // Git state
  hasGitRepos: boolean;
  hasMultipleRepos: boolean;
  hasOpenPR: boolean;
  hasUnpushedCommits: boolean;

  // Execution state
  isAttemptRunning: boolean;
  // ... more
}
```

Actions define visibility conditions:

```typescript
GitCreatePR: {
  id: 'git-create-pr',
  label: 'Create Pull Request',
  icon: GitPullRequestIcon,
  requiresTarget: 'git',
  isVisible: (ctx) => ctx.hasWorkspace && ctx.hasGitRepos,
  // ...
}
```

---

## 6. React Implementation

### Semantic Hook Factory

The `createSemanticHook` factory creates type-safe hooks for each action:

```typescript
// frontend/src/keyboard/useSemanticKey.ts

export function createSemanticHook<A extends Action>(action: A) {
  return function useSemanticKey(
    handler: Handler,
    options: SemanticKeyOptions = {}
  ) {
    const { scope, enabled = true, when, /* ... */ } = options;

    // Get keys from registry
    const keys = useMemo(() => getKeysFor(action, scope), [scope]);

    useHotkeys(
      keys,
      (event) => {
        // Skip if IME composition in progress
        if (event.isComposing) return;
        if (isEnabled) handler(event);
      },
      {
        enabled,
        scopes: scope ? [scope] : ['*'],
        // ...
      },
      [keys, scope, handler, isEnabled]
    );
  };
}
```

### Exported Semantic Hooks

```typescript
// frontend/src/keyboard/hooks.ts

export const useKeyExit = createSemanticHook(Action.EXIT);
export const useKeyCreate = createSemanticHook(Action.CREATE);
export const useKeySubmit = createSemanticHook(Action.SUBMIT);
export const useKeyFocusSearch = createSemanticHook(Action.FOCUS_SEARCH);
export const useKeyNavUp = createSemanticHook(Action.NAV_UP);
export const useKeyNavDown = createSemanticHook(Action.NAV_DOWN);
export const useKeyNavLeft = createSemanticHook(Action.NAV_LEFT);
export const useKeyNavRight = createSemanticHook(Action.NAV_RIGHT);
export const useKeyOpenDetails = createSemanticHook(Action.OPEN_DETAILS);
export const useKeyShowHelp = createSemanticHook(Action.SHOW_HELP);
export const useKeyDeleteTask = createSemanticHook(Action.DELETE_TASK);
export const useKeyApproveRequest = createSemanticHook(Action.APPROVE_REQUEST);
export const useKeyDenyApproval = createSemanticHook(Action.DENY_APPROVAL);
export const useKeySubmitFollowUp = createSemanticHook(Action.SUBMIT_FOLLOW_UP);
export const useKeySubmitTask = createSemanticHook(Action.SUBMIT_TASK);
export const useKeySubmitTaskAlt = createSemanticHook(Action.SUBMIT_TASK_ALT);
export const useKeySubmitComment = createSemanticHook(Action.SUBMIT_COMMENT);
export const useKeyCycleViewBackward = createSemanticHook(Action.CYCLE_VIEW_BACKWARD);
```

### Usage Pattern

```typescript
// In a kanban component
function KanbanBoard() {
  const { selectedTask, setSelectedTask } = useKanbanState();

  useKeyCreate(() => openTaskForm(), { scope: Scope.KANBAN });
  useKeyDeleteTask(() => deleteTask(selectedTask), {
    scope: Scope.KANBAN,
    when: !!selectedTask
  });
  useKeyNavDown(() => moveSelection('down'), { scope: Scope.KANBAN });
  useKeyNavUp(() => moveSelection('up'), { scope: Scope.KANBAN });
}
```

### Adding Sequential Shortcuts

To add sequential shortcuts, extend the registry:

```typescript
// Proposed addition to registry.ts

export interface SequentialBinding {
  id: string;
  keys: string[];           // e.g., ['g', 's']
  scopes?: Scope[];
  description: string;
  group?: string;
  action: ActionDefinition; // Link to existing action
}

export const sequentialBindings: SequentialBinding[] = [
  // Navigation
  { id: 'go-settings', keys: ['g', 's'], description: 'Go to Settings', action: Actions.Settings },
  { id: 'go-new-workspace', keys: ['g', 'n'], description: 'New Workspace', action: Actions.NewWorkspace },

  // Workspace
  { id: 'workspace-duplicate', keys: ['w', 'd'], description: 'Duplicate Workspace', action: Actions.DuplicateWorkspace },
  { id: 'workspace-rename', keys: ['w', 'r'], description: 'Rename Workspace', action: Actions.RenameWorkspace },
  { id: 'workspace-pin', keys: ['w', 'p'], description: 'Pin Workspace', action: Actions.PinWorkspace },
  { id: 'workspace-archive', keys: ['w', 'a'], description: 'Archive Workspace', action: Actions.ArchiveWorkspace },
  { id: 'workspace-delete', keys: ['w', 'x'], description: 'Delete Workspace', action: Actions.DeleteWorkspace },

  // View
  { id: 'view-changes', keys: ['v', 'c'], description: 'Toggle Changes Panel', action: Actions.ToggleChangesMode },
  { id: 'view-logs', keys: ['v', 'l'], description: 'Toggle Logs Panel', action: Actions.ToggleLogsMode },
  { id: 'view-preview', keys: ['v', 'p'], description: 'Toggle Preview Panel', action: Actions.TogglePreviewMode },
  { id: 'view-sidebar', keys: ['v', 's'], description: 'Toggle Sidebar', action: Actions.ToggleLeftSidebar },

  // Git
  { id: 'git-pr', keys: ['x', 'p'], description: 'Create Pull Request', action: Actions.GitCreatePR },
  { id: 'git-merge', keys: ['x', 'm'], description: 'Merge', action: Actions.GitMerge },
  { id: 'git-rebase', keys: ['x', 'r'], description: 'Rebase', action: Actions.GitRebase },
  { id: 'git-push', keys: ['x', 'u'], description: 'Push', action: Actions.GitPush },

  // Yank/Copy
  { id: 'yank-path', keys: ['y', 'p'], description: 'Copy Path', action: Actions.CopyPath },
  { id: 'yank-logs', keys: ['y', 'l'], description: 'Copy Logs', action: Actions.CopyRawLogs },

  // Toggle
  { id: 'toggle-dev-server', keys: ['t', 'd'], description: 'Toggle Dev Server', action: Actions.ToggleDevServer },
  { id: 'toggle-wrap', keys: ['t', 'w'], description: 'Toggle Line Wrap', action: Actions.ToggleWrapLines },

  // Run
  { id: 'run-setup', keys: ['r', 's'], description: 'Run Setup Script', action: Actions.RunSetupScript },
  { id: 'run-cleanup', keys: ['r', 'c'], description: 'Run Cleanup Script', action: Actions.RunCleanupScript },
];
```

---

## 7. User Experience

### Visual Indicators

Every touchpoint should reinforce keyboard shortcuts:

1. **Command bar items**: Show shortcut aligned right
   ```tsx
   <CommandItem>
     <Icon className="mr-2" />
     <span>Create Pull Request</span>
     <kbd className="ml-auto text-muted">X P</kbd>
   </CommandItem>
   ```

2. **Tooltips**: Show shortcut when hovering over buttons
   ```tsx
   <Tooltip>
     <TooltipTrigger asChild>
       <Button onClick={toggleChanges}>Changes</Button>
     </TooltipTrigger>
     <TooltipContent>
       Toggle Changes Panel (V C)
     </TooltipContent>
   </Tooltip>
   ```

3. **Navbar icons**: Display shortcuts on hover
   ```tsx
   <NavbarButton
     action={Actions.ToggleChangesMode}
     tooltip="Changes (V C)"
   />
   ```

### Keyboard Shortcuts Dialog

**Current:** `Shift+/` opens `KeyboardShortcutsDialog` showing all bindings.

**Enhancement:** Add sequential shortcuts once implemented, grouped by namespace:

```
Navigation (G)
  G S  Go to Settings
  G N  New Workspace

Workspace (W)
  W D  Duplicate
  W R  Rename
  W A  Archive

View (V)
  V C  Changes Panel
  V L  Logs Panel
  V P  Preview Panel
```

### Sequence Indicator

When sequential shortcuts are implemented, show visual feedback:

```tsx
function KeySequenceIndicator({ buffer, isActive }) {
  const validFirstKeys = ['g', 'w', 'v', 'x', 'y', 't', 'r'];
  const showIndicator = isActive &&
                        buffer.length === 1 &&
                        validFirstKeys.includes(buffer[0]);

  if (!showIndicator) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div className="flex items-center gap-1 rounded-lg border bg-background px-3 py-2">
        <kbd className="rounded border px-2 font-mono text-sm">
          {buffer[0].toUpperCase()}
        </kbd>
        <span className="text-muted-foreground">...</span>
      </div>
    </div>
  );
}
```

### Cross-Platform Handling

Display platform-appropriate modifier keys:

```typescript
function getModifierSymbol(): string {
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  return isMac ? '⌘' : 'Ctrl';
}

// Usage
<kbd>{getModifierSymbol()}+K</kbd>  // Shows "⌘+K" on Mac, "Ctrl+K" on Windows
```

### Accessibility Considerations

1. **Don't override screen reader shortcuts**: Avoid single letters that screen readers use
2. **Provide alternatives**: Every shortcut action is also mouse-accessible via command bar
3. **Configurable timeout**: Some users need more time for sequential shortcuts
4. **Skip in inputs**: Shortcuts don't fire when typing in form fields (handled by `isInputFocused()`)

---

## 8. Testing & Maintenance

### Testing Shortcuts

Use `pnpm run dev:qa` for testing keyboard interactions:

```typescript
// Unit test: Hook behavior
test('executes action when pressing c in KANBAN scope', () => {
  const action = vi.fn();
  const { result } = renderHook(() =>
    useKeyCreate(action, { scope: Scope.KANBAN })
  );

  fireEvent.keyDown(document, { key: 'c' });
  expect(action).toHaveBeenCalledOnce();
});

// Integration test: Sequential shortcut
test('G S opens settings', async () => {
  render(<App />);

  await userEvent.keyboard('gs');

  expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', 'Settings');
});

// E2E test: With visual indicator
test('shows sequence indicator while typing', async ({ page }) => {
  await page.goto('/workspaces');
  await page.keyboard.press('g');

  await expect(page.locator('[data-testid="sequence-indicator"]'))
    .toContainText('G');

  await page.keyboard.press('s');
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
});
```

### Documenting Shortcuts

The source of truth is `registry.ts` (single keys) and `sequentialBindings` (sequential):

| Shortcut | Action | Context | Status |
|----------|--------|---------|--------|
| `c` | Create task/workspace | Kanban/Projects | Implemented |
| `j/k` | Navigate up/down | Kanban | Implemented |
| `h/l` | Navigate left/right | Kanban | Implemented |
| `d` | Delete task | Kanban | Implemented |
| `/` | Focus search | Kanban | Implemented |
| `Esc` | Close/cancel | Various | Implemented |
| `Cmd+K` | Command bar | Global | Implemented |
| `G S` | Go to Settings | Global | Proposed |
| `W D` | Duplicate workspace | Workspace | Proposed |
| `X P` | Create PR | Git | Proposed |

### Collision Detection

```typescript
function validateShortcuts(bindings: SequentialBinding[]) {
  const seen = new Map<string, string>();

  for (const binding of bindings) {
    const key = binding.keys.join(' ');
    const existing = seen.get(key);
    if (existing) {
      throw new Error(
        `Shortcut collision: "${key}" used by both "${existing}" and "${binding.id}"`
      );
    }
    seen.set(key, binding.id);
  }
}
```

---

## 9. Current State vs Future

### What Exists Today

| Layer | Status | Implementation |
|-------|--------|----------------|
| Command Palette | Implemented | `CommandBarDialog` with cmdk |
| Search | Implemented | Shares command bar (`Cmd+K`) |
| Sequential Hotkeys | **Not implemented** | - |
| Global Modifier Shortcuts | Implemented | `registry.ts` + react-hotkeys-hook |
| Semantic Hooks | Implemented | `useSemanticKey.ts`, `hooks.ts` |
| Scope System | Implemented | `Scope` enum with 11 scopes |

### Current Single-Key Shortcuts

| Key | Action | Scope |
|-----|--------|-------|
| `c` | Create | Kanban, Projects |
| `j` | Nav down | Kanban |
| `k` | Nav up | Kanban |
| `h` | Nav left | Kanban |
| `l` | Nav right | Kanban |
| `d` | Delete | Kanban |
| `/` | Focus search | Kanban |
| `Esc` | Exit/close | Various |
| `Shift+/` | Show help | Global |
| `Enter` | Submit/approve | Dialog, Approvals |

### Current Modifier Shortcuts

| Shortcut | Action | Scope |
|----------|--------|-------|
| `Cmd+K` | Open command bar | Global |
| `Cmd+Enter` | Submit task / Open details | Dialog, Kanban |
| `Cmd+Shift+Enter` | Alt submit / Cycle backward | Dialog, Kanban |

### Migration Path for Sequential Shortcuts

1. **Phase 1**: Add `sequentialBindings` to registry without breaking existing shortcuts
2. **Phase 2**: Implement `useSequentialHotkeys` hook with 500ms buffer
3. **Phase 3**: Add visual sequence indicator
4. **Phase 4**: Update KeyboardShortcutsDialog to show sequential shortcuts
5. **Phase 5**: Add sequential shortcut hints to command bar items

### Unresolved Questions

1. **Conflict with single keys**: Should `G` for "go" block the single-key `g`? (Probably yes, with timeout)
2. **Scope interaction**: Should sequential shortcuts respect scopes or be global-only?
3. **Customization**: Should users be able to remap sequential shortcuts?
4. **Learning mode**: Should there be a "training mode" that shows hints more prominently?

---

## Appendix: Quick Reference

### Proposed Vibe-Kanban Namespace Summary

| Prefix | Purpose | Mnemonic |
|--------|---------|----------|
| G | Go/Navigate | "**G**o to..." |
| W | Workspace | "**W**orkspace..." |
| V | View/Panel | "**V**iew..." |
| X | Git | "E**x**ecute (git)..." |
| Y | Yank/Copy | Vim: "**Y**ank" |
| T | Toggle | "**T**oggle..." |
| R | Run | "**R**un..." |

### Common Implementation Pitfalls

1. **Firing in inputs**: Always check `isInputFocused()` or use `enableOnFormTags: false`
2. **Blocking browser shortcuts**: Don't override `Cmd+T`, `Cmd+W`, etc.
3. **No visual feedback**: Users don't know their key was registered
4. **Inconsistent modifiers**: Mix of Cmd and Ctrl on same platform
5. **No timeout reset**: Buffer grows indefinitely
6. **Missing preventDefault**: Browser handles the key too
7. **Overly long sequences**: 3+ keys hard to remember and execute
8. **Ignoring IME**: Must check `event.isComposing` for CJK input

### The Optimistic UI Principle

The most important "invisible" trait of keyboard-first apps:

> **Never wait for the server.**

When the user presses `W D` (Duplicate Workspace):
1. Close modal **immediately**
2. Show success toast **immediately**
3. Update UI **immediately** (optimistic update)
4. API request happens **in background**

If you put a loading spinner inside your command palette, you have failed the keyboard-first philosophy. The interface must move at the speed of the user's fingers, not the network.

---

*This guide is adapted for Vibe-Kanban's architecture and domain model. It builds on the existing keyboard system in `frontend/src/keyboard/` and proposes enhancements for sequential shortcuts.*
