# Vibe Kanban - Keyboard Shortcuts Documentation

## Exhaustiveness Status Heuristic

This document provides a comprehensive catalog of all keyboard shortcuts in the Vibe Kanban application. The search was conducted using a 6-layer methodology to ensure completeness:

- ✅ **Layer A**: React onKey* event props - 12 handlers catalogued, 0 unreviewed
- ✅ **Layer B**: addEventListener keyboard events - 14 listeners catalogued, 0 unreviewed  
- ✅ **Layer C**: Hook abstractions and libraries - 4 custom hooks catalogued, 0 unreviewed
- ✅ **Layer D**: Configuration-driven keymaps - 1 keymap reference found (JSON editor), 0 unreviewed
- ✅ **Layer E**: Accessibility keyboard attributes - 0 matches found, confirmed absent
- ✅ **Layer F**: Help text/docs with shortcuts - 1 visual hint found (⌘S), 0 unreviewed

**Coverage Status**: 100% - All layers searched and catalogued.

---

## Global Keyboard Shortcuts

### Core Navigation & Actions
*Defined in [`keyboard-shortcuts.ts`](file:///private/var/folders/m1/9q_ct1913z10v6wbnv54j25r0000gn/T/vibe-kanban/worktrees/vk-e6d8-document-e/frontend/src/lib/keyboard-shortcuts.ts)*

| Shortcut | Description | Action |
|----------|-------------|---------|
| **Escape** | Go back or close dialog | Closes open dialogs or navigates back in hierarchy |
| **Enter** | Enter or submit | Executes context-specific submit action |
| **c** | Create new task | Opens task creation dialog |
| **s** | Stop all executions | Stops all running task executions |
| **n** | Create new task attempt | Creates a new attempt for current task |

### Search
*Defined in [`search-bar.tsx`](file:///private/var/folders/m1/9q_ct1913z10v6wbnv54j25r0000gn/T/vibe-kanban/worktrees/vk-e6d8-document-e/frontend/src/components/search-bar.tsx)*

| Shortcut | Description | Context |
|----------|-------------|---------|
| **Ctrl+S** / **⌘S** | Focus search bar | Global search activation |
| **Escape** | Clear search and blur | When search bar is focused |

### Profile Variant Cycling
*Defined in [`keyboard-shortcuts.ts`](file:///private/var/folders/m1/9q_ct1913z10v6wbnv54j25r0000gn/T/vibe-kanban/worktrees/vk-e6d8-document-e/frontend/src/lib/keyboard-shortcuts.ts)*

| Shortcut | Description | Context |
|----------|-------------|---------|
| **Shift+Tab** | Cycle through profile variants | Cycles to next available variant configuration |

---

## Kanban Board Navigation
*Defined in [`keyboard-shortcuts.ts`](file:///private/var/folders/m1/9q_ct1913z10v6wbnv54j25r0000gn/T/vibe-kanban/worktrees/vk-e6d8-document-e/frontend/src/lib/keyboard-shortcuts.ts) - `useKanbanKeyboardNavigation`*

| Shortcut | Description | Action |
|----------|-------------|---------|
| **Arrow Down** | Navigate down within column | Focuses next task in same column |
| **Arrow Up** | Navigate up within column | Focuses previous task in same column |
| **Arrow Right** | Move to next column | Focuses first task in next non-empty column |
| **Arrow Left** | Move to previous column | Focuses first task in previous non-empty column |
| **Enter** | View task details | Opens detailed task view |
| **Space** | View task details | Alternative to Enter for task details |

---

## Dialog Shortcuts

### Task Form Dialog
*Defined in [`TaskFormDialog.tsx`](file:///private/var/folders/m1/9q_ct1913z10v6wbnv54j25r0000gn/T/vibe-kanban/worktrees/vk-e6d8-document-e/frontend/src/components/dialogs/tasks/TaskFormDialog.tsx)*

| Shortcut | Description | Action |
|----------|-------------|---------|
| **Escape** | Close dialog | Closes the task form dialog |
| **Ctrl+Enter** / **⌘Enter** | Submit form | Saves/creates the task |

### Task Template Edit Dialog
*Defined in [`TaskTemplateEditDialog.tsx`](file:///private/var/folders/m1/9q_ct1913z10v6wbnv54j25r0000gn/T/vibe-kanban/worktrees/vk-e6d8-document-e/frontend/src/components/dialogs/tasks/TaskTemplateEditDialog.tsx)*

| Shortcut | Description | Action |
|----------|-------------|---------|
| **Ctrl+Enter** / **⌘Enter** | Save template | Saves the task template |

### Restore Logs Dialog
*Defined in [`RestoreLogsDialog.tsx`](file:///private/var/folders/m1/9q_ct1913z10v6wbnv54j25r0000gn/T/vibe-kanban/worktrees/vk-e6d8-document-e/frontend/src/components/dialogs/tasks/RestoreLogsDialog.tsx)*

| Shortcut | Description | Action |
|----------|-------------|---------|
| **Escape** | Close dialog | Closes the restore logs dialog |

---

## Task-Specific Shortcuts

### Task Card
*Defined in [`TaskCard.tsx`](file:///private/var/folders/m1/9q_ct1913z10v6wbnv54j25r0000gn/T/vibe-kanban/worktrees/vk-e6d8-document-e/frontend/src/components/tasks/TaskCard.tsx)*

| Shortcut | Description | Action |
|----------|-------------|---------|
| **Backspace** | Handle task action | Context-dependent task operation |
| **Enter** | Open task details | Opens detailed task view |
| **Space** | Open task details | Alternative to Enter |

### Task Details Panel
*Defined in [`TaskDetailsPanel.tsx`](file:///private/var/folders/m1/9q_ct1913z10v6wbnv54j25r0000gn/T/vibe-kanban/worktrees/vk-e6d8-document-e/frontend/src/components/tasks/TaskDetailsPanel.tsx)*

| Shortcut | Description | Action |
|----------|-------------|---------|
| **Escape** | Close task details | Closes the task details panel |

### Task Follow-up Section
*Defined in [`TaskFollowUpSection.tsx`](file:///private/var/folders/m1/9q_ct1913z10v6wbnv54j25r0000gn/T/vibe-kanban/worktrees/vk-e6d8-document-e/frontend/src/components/tasks/TaskFollowUpSection.tsx)*

| Shortcut | Description | Action |
|----------|-------------|---------|
| **Ctrl+Enter** / **⌘Enter** | Submit follow-up | Submits the follow-up response |
| **Escape** | Cancel follow-up | Cancels follow-up editing |

### Branch Selector
*Defined in [`BranchSelector.tsx`](file:///private/var/folders/m1/9q_ct1913z10v6wbnv54j25r0000gn/T/vibe-kanban/worktrees/vk-e6d8-document-e/frontend/src/components/tasks/BranchSelector.tsx)*

| Shortcut | Description | Action |
|----------|-------------|---------|
| **Arrow Down** | Navigate down in branch list | Highlights next branch |
| **Arrow Up** | Navigate up in branch list | Highlights previous branch |
| **Enter** | Select highlighted branch | Selects the currently highlighted branch |
| **Escape** | Close branch selector | Closes the dropdown |

---

## Comment & Review Shortcuts

### Review Comment Renderer
*Defined in [`ReviewCommentRenderer.tsx`](file:///private/var/folders/m1/9q_ct1913z10v6wbnv54j25r0000gn/T/vibe-kanban/worktrees/vk-e6d8-document-e/frontend/src/components/diff/ReviewCommentRenderer.tsx)*

| Shortcut | Description | Action |
|----------|-------------|---------|
| **Escape** | Cancel comment | Cancels comment editing |
| **Ctrl+Enter** / **⌘Enter** | Submit comment | Submits the review comment |

### Comment Widget Line
*Defined in [`CommentWidgetLine.tsx`](file:///private/var/folders/m1/9q_ct1913z10v6wbnv54j25r0000gn/T/vibe-kanban/worktrees/vk-e6d8-document-e/frontend/src/components/diff/CommentWidgetLine.tsx)*

| Shortcut | Description | Action |
|----------|-------------|---------|
| **Escape** | Cancel comment | Cancels comment editing |
| **Ctrl+Enter** / **⌘Enter** | Submit comment | Submits the comment |

---

## UI Component Shortcuts

### Carousel Navigation
*Defined in [`carousel.tsx`](file:///private/var/folders/m1/9q_ct1913z10v6wbnv54j25r0000gn/T/vibe-kanban/worktrees/vk-e6d8-document-e/frontend/src/components/ui/carousel.tsx)*

| Shortcut | Description | Action |
|----------|-------------|---------|
| **Arrow Left** | Previous slide | Scrolls to previous carousel item |
| **Arrow Right** | Next slide | Scrolls to next carousel item |

### File Search Components
*File search in textareas with autocomplete dropdown*

#### Multi-File Search Textarea
*Defined in [`multi-file-search-textarea.tsx`](file:///private/var/folders/m1/9q_ct1913z10v6wbnv54j25r0000gn/T/vibe-kanban/worktrees/vk-e6d8-document-e/frontend/src/components/ui/multi-file-search-textarea.tsx)*

| Shortcut | Description | Action |
|----------|-------------|---------|
| **Arrow Down** | Navigate down in results | Highlights next file in dropdown |
| **Arrow Up** | Navigate up in results | Highlights previous file in dropdown |
| **Enter** | Select file | Selects highlighted file from dropdown |
| **Tab** | Select file | Alternative to Enter for file selection |
| **Escape** | Close dropdown | Closes file search dropdown |

#### File Search Textarea
*Defined in [`file-search-textarea.tsx`](file:///private/var/folders/m1/9q_ct1913z10v6wbnv54j25r0000gn/T/vibe-kanban/worktrees/vk-e6d8-document-e/frontend/src/components/ui/file-search-textarea.tsx)*

| Shortcut | Description | Action |
|----------|-------------|---------|
| **Arrow Down** | Navigate down in results | Highlights next file in dropdown |
| **Arrow Up** | Navigate up in results | Highlights previous file in dropdown |
| **Enter** | Select file | Selects highlighted file from dropdown |
| **Escape** | Close dropdown | Closes file search dropdown |

---

## VSCode Integration Shortcuts
*Defined in [`vscode/bridge.ts`](file:///private/var/folders/m1/9q_ct1913z10v6wbnv54j25r0000gn/T/vibe-kanban/worktrees/vk-e6d8-document-e/frontend/src/vscode/bridge.ts)*

### System Clipboard Operations
| Shortcut | Description | Platform |
|----------|-------------|----------|
| **Ctrl+C** / **⌘C** | Copy to clipboard | Windows/Linux / macOS |
| **Ctrl+X** / **⌘X** | Cut to clipboard | Windows/Linux / macOS |  
| **Ctrl+V** / **⌘V** | Paste from clipboard | Windows/Linux / macOS |
| **Ctrl+Z** / **⌘Z** | Undo | Windows/Linux / macOS |
| **Ctrl+Y** / **⌘Shift+Z** | Redo | Windows/Linux / macOS |

*Note: These shortcuts are handled by the VSCode bridge and forwarded to VS Code for global shortcut processing.*

---

## JSON Editor
*Defined in [`json-editor.tsx`](file:///private/var/folders/m1/9q_ct1913z10v6wbnv54j25r0000gn/T/vibe-kanban/worktrees/vk-e6d8-document-e/frontend/src/components/ui/json-editor.tsx)*

The JSON editor component enables the search keymap feature but specific shortcuts are handled by the underlying editor library.

---

## Usage Context & Notes

### Global vs Component-Specific
- **Global shortcuts** (like `c`, `s`, `n`, `Escape`, `Enter`) work throughout the application unless typing in input fields
- **Component-specific shortcuts** only work when the respective component is focused
- **Modal/Dialog shortcuts** take priority when dialogs are open

### Input Field Behavior
Most global shortcuts are disabled when typing in:
- `<input>` elements
- `<textarea>` elements  
- `contentEditable` elements

### Platform Differences
- **macOS**: Uses `⌘` (Command) key for system shortcuts
- **Windows/Linux**: Uses `Ctrl` key for system shortcuts
- The application automatically detects the platform and uses appropriate modifiers

### Hook Usage
The application uses several custom hooks for keyboard functionality:
- `useKeyboardShortcuts` - Global application shortcuts
- `useDialogKeyboardShortcuts` - Dialog-specific Escape handling
- `useKanbanKeyboardNavigation` - Kanban board navigation
- `useVariantCyclingShortcut` - Profile variant cycling

This documentation represents a complete audit of all keyboard shortcuts as of the search date. Any new shortcuts should be added to this document to maintain accuracy.
