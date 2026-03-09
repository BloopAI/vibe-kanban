# Conversation Virtualization: TanStack Virtual Migration Contract

> **Branch scope**: Replace `@virtuoso.dev/message-list` with TanStack Virtual
> in the Conversation list **only**. No other virtualized surface is in scope.

---

## 1. Scope

### In Scope

- `ConversationListContainer.tsx` — the single `VirtuosoMessageList` that renders
  the conversation thread (chat messages, tool calls, scripts, aggregated groups).
- `virtuoso-modifiers.ts` — scroll modifier definitions consumed by the list.
- `useConversationHistory.ts` — the hook that produces the entry stream fed to
  the list (synthetic row injection, script handling, process lifecycle).
- `aggregateEntries.ts` — grouping/compaction logic that transforms raw patches
  into `DisplayEntry[]` before the list receives them.
- `DisplayConversationEntry.tsx` — the row renderer that dispatches on entry type.
  Its **interface** (props shape) may change; its **internal rendering** must not.

### Out of Scope

- **File diff viewer** (`PierreConversationDiff`, `DiffViewBody`) — uses its own
  scroll container; not virtualized by the conversation list.
- **Dropdown menus / select lists** — rendered via Radix/Popover, not virtualized.
- **Kanban board** — separate page, separate scroll.
- **Changes panel / logs panel** — side panels with independent scroll.
- **Any list outside `packages/web-core/src/features/workspace-chat/`**.

---

## 2. Row Families

Every item the list can render. The `DisplayEntry` union drives dispatch.

### 2.1 Atomic Entry Types (`NormalizedEntry.entry_type.type`)

| Entry Type | Renderer | Notes |
|---|---|---|
| `user_message` | `ChatUserMessage` | Injected synthetically from `ExecutorAction.prompt`; supports edit/reset/fork |
| `assistant_message` | `ChatAssistantMessage` | Markdown content, can grow while streaming |
| `system_message` | `ChatSystemMessage` | Collapsible |
| `thinking` | `ChatThinkingMessage` | Shown inline in current turn; collapsed in previous turns |
| `error_message` | `ChatErrorMessage` | Collapsible; may contain `setup_required` sub-type |
| `loading` | `LoadingEntry` | Synthetic pulse placeholder appended while process is running |
| `next_action` | *(renders null)* | Filtered out before list receives data; kept in entries store for state |
| `token_usage_info` | *(renders null)* | Filtered out; displayed in chat header gauge |
| `user_feedback` | `UserFeedbackEntry` | Denied-tool feedback with inline content |
| `user_answered_questions` | `UserAnsweredQuestionsEntry` | Collapsible Q&A list |

### 2.2 Tool Use Variants (`entry_type.type === 'tool_use'`, dispatched by `action_type.action`)

| Action | Renderer | Notes |
|---|---|---|
| `file_edit` | `ChatFileEntry` (per change) | Expandable diff; auto-expands on `pending_approval`; multiple changes per entry |
| `file_read` | `ChatToolSummary` | Aggregatable |
| `search` | `ChatToolSummary` | Aggregatable |
| `web_fetch` | `ChatToolSummary` | Aggregatable |
| `command_run` | `ChatToolSummary` or `ChatScriptEntry` | Script entries: Setup Script, Cleanup Script, Archive Script, Tool Install Script |
| `plan_presentation` | `ChatApprovalCard` | Expandable; auto-expands on `pending_approval` |
| `todo_management` | `ChatTodoList` | Collapsible todo list |
| `task_create` | `ChatSubagentEntry` | Expandable subagent output with markdown |
| `tool` (generic) | `ChatToolSummary` | Fallback for unknown tool names |
| *(any with `pending_approval`)* | `ChatApprovalCard` | Generic tool approval card when status is `pending_approval` |

### 2.3 Aggregated Groups (produced by `aggregateConsecutiveEntries`)

| Group Type | Renderer | Aggregation Rule |
|---|---|---|
| `AGGREGATED_GROUP` | `ChatAggregatedToolEntries` | 2+ consecutive entries of same `ToolAggregationType` |
| `AGGREGATED_DIFF_GROUP` | `ChatAggregatedDiffEntries` | 2+ consecutive `file_edit` entries for the same file path |
| `AGGREGATED_THINKING_GROUP` | `ChatCollapsedThinking` | All thinking entries in previous turns (before last `user_message`) |

**`ToolAggregationType` values**: `file_read`, `search`, `web_fetch`, `command_run_read`, `command_run_search`, `command_run_edit`, `command_run_fetch`.

---

## 3. Synthetic / Injected Rows

These rows do not come from the backend WebSocket stream. They are constructed
in `useConversationHistory.flattenEntriesForEmit()` or `constants.ts`.

| Row | Source | Key Pattern | When |
|---|---|---|---|
| **User message** | `patchWithKey(userPatch, processId, 'user')` | `{processId}:user` | Injected for every `CodingAgentInitialRequest`, `CodingAgentFollowUpRequest`, `ReviewRequest` — unless suppressed by setup script reorder logic |
| **Loading indicator** | `makeLoadingPatch(processId)` | `{processId}:loading` | Appended when process is `running` and no `pending_approval` entry exists |
| **Next action** | `nextActionPatch(...)` | `next_action` | Appended when no process is running and no pending approval; filtered out before list render |
| **Script tool entry** | `patchWithKey(toolPatch, processId, 'script')` | `{processId}:script` | Setup/Cleanup/Archive/ToolInstall scripts rendered as `command_run` tool entries |
| **Setup-deferred user message** | Same as user message | `{processId}:user` | When a setup script exists, the initial user message is emitted *after* the script finishes (not from the `CodingAgentInitialRequest` branch) to prevent list reorder |

---

## 4. Scroll Commands

The current Virtuoso implementation uses `ScrollModifier` objects to control
scroll behavior. These must be replicated with equivalent TanStack Virtual
primitives.

### 4.1 Modifier Definitions

| Name | Virtuoso Modifier | Semantics |
|---|---|---|
| **initial-bottom** | `InitialDataScrollModifier` | `{ type: 'item-location', location: { index: 'LAST', align: 'end' }, purgeItemSizes: true }` — Jump to bottom, discard estimated sizes |
| **follow-bottom** | `AutoScrollToBottom` | `{ type: 'auto-scroll-to-bottom', autoScroll: 'smooth' }` — Stick to bottom during streaming |
| **preserve-anchor** | `ScrollToBottomModifier` | `{ type: 'item-location', location: { index: 'LAST', align: 'end' } }` — Scroll to bottom, keep measured sizes |
| **plan-reveal** | `ScrollToTopOfLastItem` | `{ type: 'item-location', location: { index: 'LAST', align: 'start' } }` — Scroll so last item's top is visible (plan presentation) |

### 4.2 Imperative Scroll Commands

Exposed via `ConversationListHandle` (used by `WorkspacesMainContainer` and `VSCodeWorkspacePage`):

| Command | Implementation | Trigger |
|---|---|---|
| **scrollToBottom** | `messageListRef.scrollToItem({ index: 'LAST', align: 'end', behavior: 'smooth' })` | "Scroll to bottom" button when `!isAtBottom` |
| **scrollToPreviousUserMessage** | Find `user_message` entries before first visible item, scroll to nearest with `align: 'start', behavior: 'smooth'` | Chat box "scroll up" button |

### 4.3 Modifier Selection Logic (`onEntriesUpdated` in `ConversationListContainer`)

```
if (loading)                    → InitialDataScrollModifier  (purge + jump)
else if (addType === 'plan')    → ScrollToTopOfLastItem      (reveal plan)
else if (addType === 'running') → AutoScrollToBottom          (follow stream)
else                            → ScrollToBottomModifier      (historic load)
```

The `addType` values are: `'initial'`, `'running'`, `'historic'`, `'plan'`.

---

## 5. Migration Invariants

These properties **must hold** after migration. Any regression is a blocker.

### 5.1 Semantic Row Identity

Every `DisplayEntry` has a stable `patchKey`. The list must use `patchKey` as
the item key (`computeItemKey`) and identity (`itemIdentity`). Keys must not
change when entries are re-aggregated or when the list re-renders.

**Current**: `computeItemKey = ({ data }) => 'conv-' + data.patchKey`

### 5.2 Single Scroll Authority

Only one mechanism may control scroll position at any time. The current design
uses `DataWithScrollModifier<DisplayEntry>` to atomically pair data updates with
scroll intent. TanStack Virtual must replicate this: data + scroll intent must
be applied in the same render cycle.

### 5.3 Anchor Correctness

When items above the viewport change size (e.g., diff expansion, markdown
growth, aggregation compaction), the viewport must not jump. The user's reading
position must be preserved.

### 5.4 Bounded Measurement Invalidation

Size re-measurement must be scoped to changed items only. Full list
re-measurement on every update is not acceptable for conversations with 100+
entries.

### 5.5 No Teleport / No Overlap

Items must never visually overlap or leave gaps. Smooth transitions between
scroll states (e.g., follow-bottom to manual scroll) must not cause position
jumps.

### 5.6 Shared-Surface Parity

All three surfaces (local web, remote web, VS Code webview) share the same
`ConversationListContainer`. The migration must not break any surface. There is
no surface-specific rendering logic inside the list.

---

## 6. High-Risk Behaviors

These are the most likely sources of regression. Each must have explicit test
coverage or manual verification.

### 6.1 Setup Script / Cleanup Script Overlap

- Setup scripts run as `ScriptRequest` execution processes.
- The initial user message is **suppressed** from the `CodingAgentInitialRequest`
  branch when a setup script exists (`hasSetupScriptProcess` check).
- Instead, the user message is emitted **after** the setup script finishes
  (success or failure) from the script branch.
- **Risk**: If the list doesn't handle this reorder suppression correctly, the
  user message may appear twice or in the wrong position.

### 6.2 Setup Script Ordering

- The `:script` key suffix on script entries ensures Virtuoso doesn't reuse
  height measured while the script was still streaming logs.
- **Risk**: TanStack Virtual must similarly invalidate measurements when a
  script entry transitions from streaming to completed.

### 6.3 Subagent Expansion

- `task_create` entries (`ChatSubagentEntry`) can expand to show markdown
  output of arbitrary length.
- **Risk**: Expansion changes item height significantly; anchor correction must
  handle this without viewport jump.

### 6.4 Aggregation / Compaction Transitions

- Entries transition between individual and aggregated states as new entries
  arrive (e.g., a single `file_read` becomes an `AGGREGATED_GROUP` when a
  second `file_read` follows).
- This changes the item count and keys in the list.
- **Risk**: The list must handle item count changes without losing scroll
  position or causing flicker.

### 6.5 Retry / Reset / Continue Flows

- `useResetProcess` can remove execution processes, causing entries to be
  deleted from `displayedExecutionProcesses`.
- The cleanup effect in `useConversationHistory` deletes entries for removed
  processes and re-emits.
- **Risk**: Bulk item removal must not cause scroll position corruption.

### 6.6 Markdown / Image Growth

- `assistant_message` entries contain markdown that may include images.
- Content can grow during streaming (partial markdown → complete markdown).
- **Risk**: Progressive height changes during streaming must work with
  follow-bottom behavior without jitter.

### 6.7 Scroll-to-Previous-User-Message

- Uses `messageListRef.data.getCurrentlyRendered()` to find the first visible
  item, then searches backward through `data` for `user_message` entries.
- **Risk**: TanStack Virtual must expose equivalent API to query currently
  visible items and scroll to arbitrary indices.

### 6.8 Pending Approval Auto-Expand

- `file_edit` and `plan_presentation` entries auto-expand when
  `status === 'pending_approval'`.
- This causes a significant height change at the bottom of the list.
- **Risk**: Must work correctly with follow-bottom scroll behavior.

### 6.9 Process Status Transitions

- When a process transitions from `running` to `completed`/`failed`/`killed`,
  entries are reloaded from the historic endpoint and replaced.
- The loading indicator is removed.
- **Risk**: The entry replacement (streaming entries → historic entries) must
  not cause visible flicker or scroll jumps.

---

## 7. Surface Parity

All three deployment surfaces use the **same** `ConversationListContainer`:

| Surface | Shell Component | Notes |
|---|---|---|
| **Local web** | `WorkspacesMainContainer` | Full workspace UI with context bar, changes panel |
| **Remote web** | `WorkspacesMainContainer` (via remote routes) | Same component, different route provider |
| **VS Code webview** | `VSCodeWorkspacePage` | Simplified shell; no context bar; includes VS Code bridge for keyboard/clipboard |

**Shared provider stack** (all surfaces):
- `ApprovalFeedbackProvider`
- `EntriesProvider` (keyed by `workspaceId-sessionId`)
- `MessageEditProvider`
- `RetryUiProvider`
- `ApprovalFormProvider` (inside `ConversationListContainer`)

The migration must not introduce any surface-specific code paths inside
`ConversationListContainer` or its children.

---

## 8. Current Virtuoso Workarounds (To Be Replaced)

These are Virtuoso-specific patterns that exist to work around Virtuoso
limitations or behaviors. They should be replaced with TanStack Virtual
equivalents or removed if no longer needed.

| Workaround | Location | Purpose |
|---|---|---|
| **Setup-script reorder suppression** | `useConversationHistory.ts` | Suppresses initial user message from coding agent branch when setup script exists, to avoid Virtuoso list reorder |
| **`:script` key suffix** | `useConversationHistory.ts` (line ~429) | Distinct key suffix so Virtuoso doesn't reuse height measured while script was streaming |
| **`purgeItemSizes: true`** | `virtuoso-modifiers.ts` (`InitialDataScrollModifier`) | Discards estimated sizes on initial load to prevent incorrect scroll position |
| **Null-entry filtering** | `ConversationListContainer.tsx` (lines ~296-307) | Filters out `next_action` and `token_usage_info` entries that render as `null` to avoid empty Virtuoso items adding spacing |
| **100ms debounce** | `ConversationListContainer.tsx` (line ~274-315) | Debounces `onEntriesUpdated` to batch rapid entry updates and avoid excessive Virtuoso re-renders |
| **License watermark CSS hack** | `ConversationListContainer.tsx` (line ~421) | `virtuoso-license-wrapper` class wrapping the licensed `VirtuosoMessageListLicense` component |
| **`DataWithScrollModifier` pattern** | `ConversationListContainer.tsx` | Atomic data+scroll pairing via Virtuoso's `DataWithScrollModifier<T>` type |
| **`computeItemKey` / `itemIdentity`** | `ConversationListContainer.tsx` | Virtuoso-specific key and identity callbacks; TanStack Virtual uses `getItemKey` |

---

## 9. Data Flow Summary

```
WebSocket patches
  → streamJsonPatchEntries (per execution process)
  → useConversationHistory
      → synthetic row injection (user messages, loading, next_action, scripts)
      → flattenEntriesForEmit() → PatchTypeWithKey[]
  → onEntriesUpdated callback (100ms debounced)
      → aggregateConsecutiveEntries() → DisplayEntry[]
      → null-entry filtering
      → setChannelData({ data, scrollModifier })
  → VirtuosoMessageList renders DisplayEntry[]
      → ItemContent dispatches to DisplayConversationEntry
          → switch on entry_type.type / aggregated group type
```

---

## 10. Acceptance Criteria

The migration is complete when:

1. All row families from Section 2 render identically.
2. All synthetic rows from Section 3 appear at the correct position.
3. All scroll commands from Section 4 produce equivalent behavior.
4. All invariants from Section 5 hold under manual and automated testing.
5. All high-risk behaviors from Section 6 are verified.
6. All three surfaces from Section 7 work without regression.
7. All Virtuoso workarounds from Section 8 are replaced or removed.
8. The Virtuoso dependency (`@virtuoso.dev/message-list`) is removed from
   `package.json`.
9. No Virtuoso license key reference remains in the codebase.
