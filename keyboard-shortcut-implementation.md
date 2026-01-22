# Sequential Keyboard Shortcuts Implementation Plan

A phased implementation plan for adding Vim-inspired sequential keyboard shortcuts (e.g., `G S` for Go to Settings) to Vibe-Kanban. Each phase is self-contained and can be executed by a separate Claude Code session.

---

## Overview

**Goal:** Implement a keyboard-first experience with sequential shortcuts organized by namespace (G=Go, W=Workspace, V=View, X=Git, Y=Yank, T=Toggle, R=Run).

**Current State:**
- Single-key shortcuts work (`c`, `j`, `k`, `h`, `l`, `d`, `/`, `Esc`)
- Modifier shortcuts work (`Cmd+K`, `Cmd+Enter`)
- 40+ actions defined but none have `shortcut` property populated
- No sequential shortcut system exists
- No keyboard shortcuts help dialog (despite `Shift+/` binding)

**Target State:**
- Sequential shortcuts like `G S` (Settings), `V C` (Changes), `X P` (Create PR)
- Visual sequence indicator while typing
- Shortcuts displayed everywhere (command bar, tooltips, help dialog)

---

## Phase 1: Core Sequential Shortcut Infrastructure ✅ COMPLETED

**Goal:** Create the foundational hook and registry types for sequential shortcuts.

**Estimated Scope:** ~200 lines of new code

**Status:** Completed on 2026-01-22

### Implementation Notes

- Added `SequentialBinding` interface and `sequentialBindings` array with 22 shortcuts
- Created `useSequentialHotkeys` hook with key buffer management, timeout handling, scope checking
- Fixed `useHotkeysContext` API: uses `activeScopes` not `enabledScopes`
- All 22 bindings organized by namespace (G, W, V, X, Y, T, R)
- Helper functions `getSequentialBindingFor` and `formatSequentialKeys` added

### Verification Results

- `pnpm run check` - Passed
- `pnpm run lint` - Passed

### Files to Modify

#### 1.1 `frontend/src/keyboard/registry.ts`

Add after line 41 (after `KeyBinding` interface):

```typescript
// Sequential shortcut binding (e.g., G S for Settings)
export interface SequentialBinding {
  id: string;
  keys: string[];           // e.g., ['g', 's']
  scopes?: Scope[];         // Optional scope restrictions
  description: string;
  group: string;            // Namespace group name
  actionId: string;         // Links to Actions[key].id
}

// Valid first keys that can start a sequential shortcut
export const SEQUENCE_FIRST_KEYS = new Set(['g', 'w', 'v', 'x', 'y', 't', 'r']);

// All sequential bindings - single source of truth
export const sequentialBindings: SequentialBinding[] = [
  // Navigation (G = Go)
  { id: 'go-settings', keys: ['g', 's'], description: 'Go to Settings', group: 'Navigation', actionId: 'settings' },
  { id: 'go-new-workspace', keys: ['g', 'n'], description: 'New Workspace', group: 'Navigation', actionId: 'new-workspace' },

  // Workspace (W)
  { id: 'workspace-duplicate', keys: ['w', 'd'], description: 'Duplicate Workspace', group: 'Workspace', actionId: 'duplicate-workspace', scopes: [Scope.KANBAN] },
  { id: 'workspace-rename', keys: ['w', 'r'], description: 'Rename Workspace', group: 'Workspace', actionId: 'rename-workspace', scopes: [Scope.KANBAN] },
  { id: 'workspace-pin', keys: ['w', 'p'], description: 'Pin/Unpin Workspace', group: 'Workspace', actionId: 'pin-workspace', scopes: [Scope.KANBAN] },
  { id: 'workspace-archive', keys: ['w', 'a'], description: 'Archive Workspace', group: 'Workspace', actionId: 'archive-workspace', scopes: [Scope.KANBAN] },
  { id: 'workspace-delete', keys: ['w', 'x'], description: 'Delete Workspace', group: 'Workspace', actionId: 'delete-workspace', scopes: [Scope.KANBAN] },

  // View (V)
  { id: 'view-changes', keys: ['v', 'c'], description: 'Toggle Changes Panel', group: 'View', actionId: 'toggle-changes-mode', scopes: [Scope.KANBAN] },
  { id: 'view-logs', keys: ['v', 'l'], description: 'Toggle Logs Panel', group: 'View', actionId: 'toggle-logs-mode', scopes: [Scope.KANBAN] },
  { id: 'view-preview', keys: ['v', 'p'], description: 'Toggle Preview Panel', group: 'View', actionId: 'toggle-preview-mode', scopes: [Scope.KANBAN] },
  { id: 'view-sidebar', keys: ['v', 's'], description: 'Toggle Left Sidebar', group: 'View', actionId: 'toggle-left-sidebar' },
  { id: 'view-chat', keys: ['v', 'h'], description: 'Toggle Chat Panel', group: 'View', actionId: 'toggle-left-main-panel', scopes: [Scope.KANBAN] },

  // Git (X = eXecute)
  { id: 'git-pr', keys: ['x', 'p'], description: 'Create Pull Request', group: 'Git', actionId: 'git-create-pr', scopes: [Scope.KANBAN] },
  { id: 'git-merge', keys: ['x', 'm'], description: 'Merge', group: 'Git', actionId: 'git-merge', scopes: [Scope.KANBAN] },
  { id: 'git-rebase', keys: ['x', 'r'], description: 'Rebase', group: 'Git', actionId: 'git-rebase', scopes: [Scope.KANBAN] },
  { id: 'git-push', keys: ['x', 'u'], description: 'Push', group: 'Git', actionId: 'git-push', scopes: [Scope.KANBAN] },

  // Yank/Copy (Y)
  { id: 'yank-path', keys: ['y', 'p'], description: 'Copy Path', group: 'Yank', actionId: 'copy-path', scopes: [Scope.KANBAN] },
  { id: 'yank-logs', keys: ['y', 'l'], description: 'Copy Raw Logs', group: 'Yank', actionId: 'copy-raw-logs', scopes: [Scope.KANBAN] },

  // Toggle (T)
  { id: 'toggle-dev-server', keys: ['t', 'd'], description: 'Toggle Dev Server', group: 'Toggle', actionId: 'toggle-dev-server', scopes: [Scope.KANBAN] },
  { id: 'toggle-wrap', keys: ['t', 'w'], description: 'Toggle Line Wrap', group: 'Toggle', actionId: 'toggle-wrap-lines', scopes: [Scope.KANBAN] },

  // Run (R)
  { id: 'run-setup', keys: ['r', 's'], description: 'Run Setup Script', group: 'Run', actionId: 'run-setup-script', scopes: [Scope.KANBAN] },
  { id: 'run-cleanup', keys: ['r', 'c'], description: 'Run Cleanup Script', group: 'Run', actionId: 'run-cleanup-script', scopes: [Scope.KANBAN] },
];

// Helper to get sequential binding by action ID
export function getSequentialBindingFor(actionId: string): SequentialBinding | undefined {
  return sequentialBindings.find(b => b.actionId === actionId);
}

// Helper to format sequential keys for display (e.g., ['g', 's'] -> "G S")
export function formatSequentialKeys(keys: string[]): string {
  return keys.map(k => k.toUpperCase()).join(' ');
}
```

#### 1.2 Create `frontend/src/keyboard/useSequentialHotkeys.ts` (NEW FILE)

```typescript
import { useRef, useEffect, useCallback } from 'react';
import { useHotkeysContext } from 'react-hotkeys-hook';
import { type SequentialBinding, Scope, SEQUENCE_FIRST_KEYS } from './registry';

export interface SequentialHotkeysOptions {
  timeout?: number;  // Default: 500ms
  enabled?: boolean;
  onBufferChange?: (buffer: string[]) => void;
  onTimeout?: () => void;  // Called when buffer times out without match
}

export interface SequentialHotkeysConfig {
  bindings: SequentialBinding[];
  onMatch: (binding: SequentialBinding) => void;
  options?: SequentialHotkeysOptions;
}

function isInputElement(element: Element | null): boolean {
  if (!element) return false;
  const tagName = element.tagName.toLowerCase();
  if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
    return true;
  }
  return element.getAttribute('contenteditable') === 'true';
}

export function useSequentialHotkeys({
  bindings,
  onMatch,
  options = {},
}: SequentialHotkeysConfig) {
  const { timeout = 500, enabled = true, onBufferChange, onTimeout } = options;

  const bufferRef = useRef<string[]>([]);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { enabledScopes } = useHotkeysContext();

  const clearBuffer = useCallback((wasTimeout = false) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (bufferRef.current.length > 0) {
      if (wasTimeout) {
        onTimeout?.();  // Signal that buffer timed out without match
      }
      bufferRef.current = [];
      onBufferChange?.([]);
    }
  }, [onBufferChange, onTimeout]);

  const checkMatch = useCallback(
    (buffer: string[]) => {
      for (const binding of bindings) {
        if (
          binding.keys.length === buffer.length &&
          binding.keys.every((k, i) => k === buffer[i])
        ) {
          // Check scope if specified
          if (binding.scopes) {
            const hasActiveScope = binding.scopes.some(
              scope => enabledScopes.has(scope) || enabledScopes.has('*')
            );
            if (!hasActiveScope) continue;
          }
          return binding;
        }
      }
      return null;
    },
    [bindings, enabledScopes]
  );

  useEffect(() => {
    if (!enabled) {
      clearBuffer();
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      // Skip if typing in input
      if (isInputElement(document.activeElement)) {
        clearBuffer();
        return;
      }

      // Skip modifier combinations (go to Layer 4)
      if (event.metaKey || event.ctrlKey || event.altKey) {
        clearBuffer();
        return;
      }

      // Skip IME composition
      if (event.isComposing) return;

      const key = event.key.toLowerCase();

      // Only track alphanumeric keys
      if (!/^[a-z0-9]$/.test(key)) {
        clearBuffer();
        return;
      }

      // If buffer is empty, only start with valid first keys
      if (bufferRef.current.length === 0 && !SEQUENCE_FIRST_KEYS.has(key)) {
        return;
      }

      // Add to buffer
      bufferRef.current = [...bufferRef.current, key];
      onBufferChange?.(bufferRef.current);

      // Reset timeout
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => clearBuffer(true), timeout);

      // Check for matches
      const match = checkMatch(bufferRef.current);
      if (match) {
        event.preventDefault();
        event.stopPropagation();
        clearBuffer();
        onMatch(match);
        return;
      }

      // Trim buffer if too long
      if (bufferRef.current.length > 3) {
        clearBuffer();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      clearBuffer();
    };
  }, [enabled, timeout, clearBuffer, checkMatch, onMatch, onBufferChange]);

  return { clearBuffer };
}
```

#### 1.3 Update `frontend/src/keyboard/index.ts`

Add export:
```typescript
export * from './useSequentialHotkeys';
```

### Verification

1. Run `pnpm run check` - TypeScript should compile
2. Run `pnpm run lint` - No lint errors
3. Run `pnpm run dev:qa` - App loads without errors
4. Existing shortcuts (`c`, `j`, `k`, `Esc`) still work

---

## Phase 2: Integration with Actions System ✅ COMPLETED

**Goal:** Connect sequential shortcuts to the existing Actions system and execute actions when shortcuts match.

**Estimated Scope:** ~150 lines of new code

**Status:** Completed on 2026-01-22

### Implementation Notes

- Created `SequentialShortcutsContext.tsx` with `ACTION_MAP` built at module load
- Extended `useCommandBarState.ts` to accept `initialPendingAction` for direct repo selection
- Extended `CommandBarDialog.tsx` with `pendingGitAction` prop
- Updated `NewDesignScope.tsx` to wrap with `SequentialShortcutsProvider`
- Multi-repo git actions open CommandBarDialog in repo selection mode
- Console warnings for edge cases (no workspace, no repos)

### Verification Results

- `pnpm run check` - Passed
- `pnpm run lint` - Passed

### Files to Create/Modify

#### 2.1 Create `frontend/src/contexts/SequentialShortcutsContext.tsx` (NEW FILE)

```typescript
import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { useSequentialHotkeys } from '@/keyboard/useSequentialHotkeys';
import { sequentialBindings, type SequentialBinding } from '@/keyboard/registry';
import { useActions } from '@/contexts/ActionsContext';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { Actions, type ActionDefinition } from '@/components/ui-new/actions';

interface SequentialShortcutsContextValue {
  buffer: string[];
  isSequenceActive: boolean;
  isInvalidSequence: boolean;
}

const SequentialShortcutsContext = createContext<SequentialShortcutsContextValue | null>(null);

// Map action IDs to action definitions
const ACTION_MAP: Record<string, ActionDefinition> = Object.fromEntries(
  Object.values(Actions).map(action => [action.id, action])
);

interface SequentialShortcutsProviderProps {
  children: ReactNode;
  enabled?: boolean;
}

export function SequentialShortcutsProvider({
  children,
  enabled = true,
}: SequentialShortcutsProviderProps) {
  const [buffer, setBuffer] = useState<string[]>([]);
  const [isInvalidSequence, setIsInvalidSequence] = useState(false);
  const { executeAction } = useActions();
  const { workspaceId, repos } = useWorkspaceContext();

  // Clear invalid state after brief display
  useEffect(() => {
    if (isInvalidSequence) {
      const timer = setTimeout(() => setIsInvalidSequence(false), 400);
      return () => clearTimeout(timer);
    }
  }, [isInvalidSequence]);

  const handleMatch = useCallback(
    (binding: SequentialBinding) => {
      const action = ACTION_MAP[binding.actionId];
      if (!action) {
        console.warn(`No action found for binding: ${binding.actionId}`);
        return;
      }

      // Handle git actions (require repo)
      if (action.requiresTarget === 'git') {
        if (repos.length === 1) {
          // Single repo - use it directly
          executeAction(action, workspaceId ?? undefined, repos[0].id);
        } else if (repos.length > 1) {
          // Multiple repos - open command bar to select repo first
          // TODO: Open command bar filtered to selectRepo page
          // For now, use first repo as fallback
          executeAction(action, workspaceId ?? undefined, repos[0].id);
        }
        return;
      }

      // Handle workspace actions
      if (action.requiresTarget === true) {
        if (workspaceId) {
          executeAction(action, workspaceId);
        }
        return;
      }

      // Handle global actions
      executeAction(action);
    },
    [executeAction, workspaceId, repos]
  );

  const handleBufferChange = useCallback((newBuffer: string[]) => {
    setBuffer(newBuffer);
  }, []);

  // Handle invalid sequences (no match found when buffer times out)
  const handleInvalidSequence = useCallback(() => {
    setIsInvalidSequence(true);
  }, []);

  useSequentialHotkeys({
    bindings: sequentialBindings,
    onMatch: handleMatch,
    options: {
      enabled,
      onBufferChange: handleBufferChange,
      onTimeout: handleInvalidSequence,
    },
  });

  return (
    <SequentialShortcutsContext.Provider value={{ buffer, isSequenceActive: buffer.length > 0, isInvalidSequence }}>
      {children}
    </SequentialShortcutsContext.Provider>
  );
}

export function useSequentialShortcuts(): SequentialShortcutsContextValue {
  const context = useContext(SequentialShortcutsContext);
  if (!context) {
    throw new Error('useSequentialShortcuts must be used within SequentialShortcutsProvider');
  }
  return context;
}
```

#### 2.2 Update `frontend/src/components/ui-new/scope/NewDesignScope.tsx`

Add the provider wrapping ActionsProvider's children:

```typescript
// Add import at top
import { SequentialShortcutsProvider } from '@/contexts/SequentialShortcutsContext';

// Update the render to wrap with SequentialShortcutsProvider
// Inside ActionsProvider, wrap NiceModal.Provider:
<ActionsProvider>
  <SequentialShortcutsProvider>
    <NiceModal.Provider>{children}</NiceModal.Provider>
  </SequentialShortcutsProvider>
</ActionsProvider>
```

### Verification

1. Run `pnpm run dev:qa`
2. Navigate to a workspace
3. Press `G` then `S` (within 500ms) - Settings dialog should open
4. Press `V` then `C` - Changes panel should toggle
5. Press `W` then `P` - Workspace should pin/unpin
6. Verify shortcuts don't fire when typing in input fields

---

## Phase 3: Visual Sequence Indicator

**Goal:** Show visual feedback when a sequential shortcut is in progress.

**Estimated Scope:** ~60 lines of new code

### Files to Create/Modify

#### 3.1 Create `frontend/src/components/ui-new/KeySequenceIndicator.tsx` (NEW FILE)

```typescript
import { useSequentialShortcuts } from '@/contexts/SequentialShortcutsContext';
import { cn } from '@/lib/utils';

export function KeySequenceIndicator() {
  const { buffer, isSequenceActive, isInvalidSequence } = useSequentialShortcuts();

  if (!isSequenceActive && !isInvalidSequence) return null;

  return (
    <div
      className={cn(
        'fixed bottom-4 right-4 z-[10001]',
        'animate-in fade-in-0 zoom-in-95 duration-150',
        isInvalidSequence && 'animate-shake'
      )}
      data-testid="sequence-indicator"
    >
      <div
        className={cn(
          'flex items-center gap-1 rounded-sm border',
          'backdrop-blur-sm px-base py-half shadow-lg',
          isInvalidSequence
            ? 'border-error bg-error/10'
            : 'border-border bg-panel/95'
        )}
      >
        {buffer.map((key, index) => (
          <kbd
            key={index}
            className={cn(
              'inline-flex items-center justify-center',
              'min-w-[24px] h-6 px-1.5',
              'rounded-sm border bg-secondary',
              'font-ibm-plex-mono text-sm',
              isInvalidSequence
                ? 'border-error text-error'
                : 'border-border text-high'
            )}
          >
            {key.toUpperCase()}
          </kbd>
        ))}
        {!isInvalidSequence && <span className="text-low text-sm ml-1">...</span>}
      </div>
    </div>
  );
}
```

#### 3.2 Update `frontend/src/components/ui-new/scope/NewDesignScope.tsx`

Add the indicator inside SequentialShortcutsProvider:

```typescript
// Add import
import { KeySequenceIndicator } from '@/components/ui-new/KeySequenceIndicator';

// Inside SequentialShortcutsProvider, add component:
<SequentialShortcutsProvider>
  <KeySequenceIndicator />
  <NiceModal.Provider>{children}</NiceModal.Provider>
</SequentialShortcutsProvider>
```

### Verification

1. Run `pnpm run dev:qa`
2. Press `G` - indicator shows "G ..."
3. Wait 500ms - indicator disappears (with error styling briefly)
4. Press `G` then `S` quickly - Settings opens, indicator disappears
5. Press `G` then `Z` - indicator shows error state (red) before clearing
6. Verify indicator doesn't appear when typing in inputs

---

## Phase 4: Populate Action Shortcuts

**Goal:** Add `shortcut` property to all actions with sequential bindings and verify display in command bar.

**Estimated Scope:** ~30 lines of edits

### Files to Modify

#### 4.1 Update `frontend/src/components/ui-new/actions/index.ts`

Add `shortcut` property to each action that has a sequential binding:

```typescript
// Settings (line ~377)
Settings: {
  id: 'settings',
  label: 'Settings',
  icon: GearIcon,
  shortcut: 'G S',  // ADD
  requiresTarget: false,
  ...
},

// NewWorkspace (line ~367)
NewWorkspace: {
  id: 'new-workspace',
  label: 'New Workspace',
  icon: PlusIcon,
  shortcut: 'G N',  // ADD
  ...
},

// DuplicateWorkspace (line ~237)
DuplicateWorkspace: {
  id: 'duplicate-workspace',
  label: 'Duplicate',
  icon: CopyIcon,
  shortcut: 'W D',  // ADD
  ...
},

// RenameWorkspace (line ~255)
RenameWorkspace: { ..., shortcut: 'W R' },

// PinWorkspace (line ~269)
PinWorkspace: { ..., shortcut: 'W P' },

// ArchiveWorkspace (line ~283)
ArchiveWorkspace: { ..., shortcut: 'W A' },

// DeleteWorkspace (line ~311)
DeleteWorkspace: { ..., shortcut: 'W X' },

// ToggleChangesMode (line ~519)
ToggleChangesMode: { ..., shortcut: 'V C' },

// ToggleLogsMode (line ~542)
ToggleLogsMode: { ..., shortcut: 'V L' },

// TogglePreviewMode (line ~564)
TogglePreviewMode: { ..., shortcut: 'V P' },

// ToggleLeftSidebar (line ~474)
ToggleLeftSidebar: { ..., shortcut: 'V S' },

// ToggleLeftMainPanel (line ~488)
ToggleLeftMainPanel: { ..., shortcut: 'V H' },

// GitCreatePR (line ~753)
GitCreatePR: { ..., shortcut: 'X P' },

// GitMerge (line ~784)
GitMerge: { ..., shortcut: 'X M' },

// GitRebase (line ~859)
GitRebase: { ..., shortcut: 'X R' },

// GitPush (line ~921)
GitPush: { ..., shortcut: 'X U' },

// CopyPath (line ~675)
CopyPath: { ..., shortcut: 'Y P' },

// CopyRawLogs (line ~687)
CopyRawLogs: { ..., shortcut: 'Y L' },

// ToggleDevServer (line ~702)
ToggleDevServer: { ..., shortcut: 'T D' },

// ToggleWrapLines (line ~457)
ToggleWrapLines: { ..., shortcut: 'T W' },

// RunSetupScript (line ~999)
RunSetupScript: { ..., shortcut: 'R S' },

// RunCleanupScript (line ~1020)
RunCleanupScript: { ..., shortcut: 'R C' },
```

### Verification

1. Run `pnpm run dev:qa`
2. Press `Cmd+K` to open command bar
3. Verify shortcuts appear right-aligned next to items:
   - "Settings" shows "G S"
   - "Toggle Changes Panel" shows "V C"
   - etc.

---

## Phase 5: Keyboard Shortcuts Help Dialog

**Goal:** Implement the `Shift+/` help dialog showing all shortcuts.

**Estimated Scope:** ~200 lines of new code

### Files to Create/Modify

#### 5.1 Create `frontend/src/components/ui-new/dialogs/KeyboardShortcutsDialog.tsx` (NEW FILE)

```typescript
import { useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { XIcon } from '@phosphor-icons/react';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { defineModal } from '@/lib/modals';
import { usePortalContainer } from '@/contexts/PortalContainerContext';
import { cn } from '@/lib/utils';
import { sequentialBindings, formatSequentialKeys } from '@/keyboard/registry';

interface ShortcutGroup {
  name: string;
  shortcuts: Array<{ keys: string; description: string }>;
}

function useShortcutGroups(): ShortcutGroup[] {
  return useMemo(() => {
    const singleKeyShortcuts: ShortcutGroup = {
      name: 'Quick Actions',
      shortcuts: [
        { keys: 'C', description: 'Create new task/workspace' },
        { keys: 'D', description: 'Delete selected item' },
        { keys: '/', description: 'Focus search' },
        { keys: 'Esc', description: 'Close/cancel' },
        { keys: '?', description: 'Show this help' },
      ],
    };

    const navigationShortcuts: ShortcutGroup = {
      name: 'Navigation (Vim-style)',
      shortcuts: [
        { keys: 'J', description: 'Move down' },
        { keys: 'K', description: 'Move up' },
        { keys: 'H', description: 'Move left' },
        { keys: 'L', description: 'Move right' },
      ],
    };

    const modifierShortcuts: ShortcutGroup = {
      name: 'Modifier Shortcuts',
      shortcuts: [
        { keys: '\u2318K', description: 'Open command bar' },
        { keys: '\u2318\u21A9', description: 'Submit / Open details' },
        { keys: '\u2318\u21E7\u21A9', description: 'Alt submit / Cycle backward' },
      ],
    };

    // Group sequential bindings by their group property
    const sequentialGroups = new Map<string, ShortcutGroup>();
    for (const binding of sequentialBindings) {
      const groupName = binding.group;
      if (!sequentialGroups.has(groupName)) {
        sequentialGroups.set(groupName, { name: groupName, shortcuts: [] });
      }
      sequentialGroups.get(groupName)!.shortcuts.push({
        keys: formatSequentialKeys(binding.keys),
        description: binding.description,
      });
    }

    // Map groups to display names with namespace prefix
    const namespaceGroups: ShortcutGroup[] = [
      { name: 'Go/Navigate (G)', shortcuts: sequentialGroups.get('Navigation')?.shortcuts || [] },
      { name: 'Workspace (W)', shortcuts: sequentialGroups.get('Workspace')?.shortcuts || [] },
      { name: 'View (V)', shortcuts: sequentialGroups.get('View')?.shortcuts || [] },
      { name: 'Git (X)', shortcuts: sequentialGroups.get('Git')?.shortcuts || [] },
      { name: 'Yank/Copy (Y)', shortcuts: sequentialGroups.get('Yank')?.shortcuts || [] },
      { name: 'Toggle (T)', shortcuts: sequentialGroups.get('Toggle')?.shortcuts || [] },
      { name: 'Run (R)', shortcuts: sequentialGroups.get('Run')?.shortcuts || [] },
    ].filter(g => g.shortcuts.length > 0);

    return [singleKeyShortcuts, navigationShortcuts, modifierShortcuts, ...namespaceGroups];
  }, []);
}

function ShortcutRow({ keys, description }: { keys: string; description: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-normal text-sm">{description}</span>
      <kbd className={cn(
        'inline-flex items-center gap-0.5 px-2 py-0.5',
        'rounded-sm border border-border bg-secondary',
        'font-ibm-plex-mono text-xs text-high'
      )}>
        {keys}
      </kbd>
    </div>
  );
}

function ShortcutSection({ group }: { group: ShortcutGroup }) {
  return (
    <div className="mb-6">
      <h3 className="text-sm font-medium text-high mb-2 border-b border-border pb-1">
        {group.name}
      </h3>
      <div className="space-y-1">
        {group.shortcuts.map((shortcut, i) => (
          <ShortcutRow key={i} keys={shortcut.keys} description={shortcut.description} />
        ))}
      </div>
    </div>
  );
}

const KeyboardShortcutsDialogImpl = NiceModal.create(() => {
  const modal = useModal();
  const container = usePortalContainer();
  const groups = useShortcutGroups();

  const handleClose = useCallback(() => {
    modal.hide();
    modal.remove();
  }, [modal]);

  if (!container) return null;

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[9998] bg-black/50 animate-in fade-in-0 duration-200"
        onClick={handleClose}
      />
      <div className={cn(
        'fixed z-[9999] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2',
        'w-full max-w-2xl max-h-[80vh]',
        'bg-panel/95 backdrop-blur-sm rounded-sm border border-border/50 shadow-lg',
        'animate-in fade-in-0 slide-in-from-bottom-4 duration-200',
        'flex flex-col overflow-hidden'
      )}>
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold text-high">Keyboard Shortcuts</h2>
          <button onClick={handleClose} className="p-1 rounded-sm hover:bg-secondary text-low hover:text-normal">
            <XIcon className="size-icon-sm" weight="bold" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
            {groups.map((group, i) => <ShortcutSection key={i} group={group} />)}
          </div>
          <div className="mt-4 pt-4 border-t border-border text-center">
            <p className="text-xs text-low">
              Sequential shortcuts: Press the first key, then the second within 500ms.
            </p>
          </div>
        </div>
      </div>
    </>,
    container
  );
});

export const KeyboardShortcutsDialog = defineModal<void, void>(KeyboardShortcutsDialogImpl);
```

#### 5.2 Update `frontend/src/components/ui-new/scope/NewDesignScope.tsx`

Wire up `Shift+/` to open the dialog:

```typescript
// Add imports
import { useKeyShowHelp, Scope } from '@/keyboard';
import { KeyboardShortcutsDialog } from '@/components/ui-new/dialogs/KeyboardShortcutsDialog';

// Inside component, before return, add:
useKeyShowHelp(() => {
  KeyboardShortcutsDialog.show();
}, { scope: Scope.GLOBAL });
```

### Verification

1. Run `pnpm run dev:qa`
2. Press `Shift+/` (or `?`) anywhere in app
3. Verify dialog opens with all shortcuts organized by namespace
4. Verify dialog closes with Esc or clicking outside
5. Verify all shortcuts are accurate

---

## Phase 6: Enhanced Tooltip Shortcuts

**Goal:** Show keyboard shortcuts in button tooltips throughout the app.

**Estimated Scope:** ~50 lines of edits

### Files to Modify

#### 6.1 Update `frontend/src/components/ui-new/primitives/Tooltip.tsx`

Add optional `shortcut` prop:

```typescript
interface TooltipProps {
  children: React.ReactNode;
  content: string;
  shortcut?: string;  // ADD
  side?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
}

export function Tooltip({
  children,
  content,
  shortcut,  // ADD
  side = 'bottom',
  className,
}: TooltipProps) {
  const container = usePortalContainer();
  return (
    <TooltipPrimitive.Provider delayDuration={300}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal container={container}>
          <TooltipPrimitive.Content
            side={side}
            sideOffset={4}
            className={cn(
              'z-[10000] rounded-sm bg-panel px-base py-half text-xs text-normal shadow-md',
              'animate-in fade-in-0 zoom-in-95',
              className
            )}
          >
            <span>{content}</span>
            {shortcut && (
              <kbd className={cn(
                'ml-2 inline-flex items-center px-1.5 py-0.5',
                'rounded-sm border border-border bg-secondary',
                'font-ibm-plex-mono text-[10px] text-low'
              )}>
                {shortcut}
              </kbd>
            )}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
```

#### 6.2 Update `frontend/src/components/ui-new/views/Navbar.tsx`

Pass shortcuts to tooltips:

```typescript
// Update NavbarIconButtonProps (line ~25)
interface NavbarIconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: Icon;
  isActive?: boolean;
  tooltip?: string;
  shortcut?: string;  // ADD
}

// Update NavbarIconButton function (line ~32)
function NavbarIconButton({
  icon: IconComponent,
  isActive = false,
  tooltip,
  shortcut,  // ADD
  className,
  ...props
}: NavbarIconButtonProps) {
  const button = (
    <button type="button" className={cn(...)} {...props}>
      <IconComponent className="size-icon-base" weight={isActive ? 'fill' : 'regular'} />
    </button>
  );

  return tooltip ? (
    <Tooltip content={tooltip} shortcut={shortcut}>{button}</Tooltip>  // PASS shortcut
  ) : button;
}

// Update renderItem (line ~100)
return (
  <NavbarIconButton
    key={key}
    icon={iconOrSpecial}
    isActive={active}
    onClick={() => onExecuteAction(action)}
    aria-label={tooltip}
    tooltip={tooltip}
    shortcut={action.shortcut}  // ADD
    disabled={isDisabled}
    className={isDisabled ? 'opacity-40 cursor-not-allowed' : ''}
  />
);
```

### Verification

1. Run `pnpm run dev:qa`
2. Hover over navbar buttons
3. Verify tooltips show description AND shortcut (e.g., "Toggle Changes Panel" with "V C")
4. Verify shortcut is styled distinctly

---

## Summary of All Files

### New Files to Create
1. `frontend/src/keyboard/useSequentialHotkeys.ts` - Core hook
2. `frontend/src/contexts/SequentialShortcutsContext.tsx` - Provider & context
3. `frontend/src/components/ui-new/KeySequenceIndicator.tsx` - Visual indicator
4. `frontend/src/components/ui-new/dialogs/KeyboardShortcutsDialog.tsx` - Help dialog

### Files to Modify
1. `frontend/src/keyboard/registry.ts` - Add SequentialBinding types & bindings
2. `frontend/src/keyboard/index.ts` - Export new module
3. `frontend/src/components/ui-new/actions/index.ts` - Add shortcut properties (~20 actions)
4. `frontend/src/components/ui-new/scope/NewDesignScope.tsx` - Add providers, indicator, help hook
5. `frontend/src/components/ui-new/primitives/Tooltip.tsx` - Add shortcut prop
6. `frontend/src/components/ui-new/views/Navbar.tsx` - Pass shortcuts to tooltips

---

## Design Decisions

1. **Multi-repo git actions:** When a workspace has multiple repos and user presses a git shortcut:
   - If one repo is currently focused/open, use that repo
   - Otherwise, open command bar filtered to repo selection

2. **Custom shortcuts:** No customization infrastructure in this implementation. Keep it simple with fixed shortcuts. Can be added as a future enhancement.

3. **Invalid sequences:** Show brief error indicator (e.g., indicator turns red/shakes) when an invalid sequence is entered before clearing.

---

## Future Enhancements (Out of Scope)

- Custom shortcut remapping via settings
- Training mode with prominent hints when actions are clicked with mouse
- Shortcut search/filter in help dialog
- Per-workspace shortcut overrides
