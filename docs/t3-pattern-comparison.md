# T3 Code Pattern Comparison for Conversation Virtualization

> **Purpose**: Map T3 Code's TanStack Virtual patterns to vibe-kanban's
> Conversation list. Each pattern gets an explicit **ADOPT**, **ADAPT**, or
> **REJECT** verdict so downstream implementation tasks can reference this
> document instead of re-deciding alignment ad hoc.
>
> **Source files audited**:
> - T3: `ChatView.tsx`, `timelineHeight.ts`, `chat-scroll.ts`
> - VK: `ConversationListContainer.tsx`, `DisplayConversationEntry.tsx`,
>   `conversation-row-model.ts`, `conversation-scroll-commands.ts`,
>   `conversation-migration-contract.md`

---

## 1. Hybrid Virtualized-History + Unvirtualized-Tail

### T3 approach

T3 splits the timeline into two rendering zones:

```
rows[0 .. firstUnvirtualizedRowIndex)   → TanStack Virtual (absolute positioning)
rows[firstUnvirtualizedRowIndex .. end] → plain DOM (normal flow)
```

`ALWAYS_UNVIRTUALIZED_TAIL_ROWS = 8` guarantees the last 8 rows are never
virtualized. During an active turn, the split point moves earlier to include
all rows from the current turn's first message onward.

**Why T3 does this**: Unvirtualized tail rows avoid measurement lag for
actively-streaming content. TanStack Virtual's `measureElement` +
ResizeObserver has a one-frame delay; for the tail (where the user is
watching content grow), this delay causes visible jitter.

### Vibe-kanban divergence

Vibe-kanban's conversation has fundamentally different tail behaviour:

- **Aggregation transitions**: A single `file_read` can become an
  `AGGREGATED_GROUP` mid-stream, changing item count and keys. In an
  unvirtualized tail, this causes a full re-render of all tail DOM.
- **Diff expansions at tail**: `file_edit` entries with `pending_approval`
  auto-expand at the bottom, causing 200-500px height jumps. These need
  anchor correction that TanStack Virtual provides but raw DOM does not.
- **Script lifecycle rows**: Setup/Cleanup/Archive scripts appear at the
  tail and transition from streaming to completed, changing their key
  suffix (`:script`). An unvirtualized tail would need manual height
  invalidation logic that TanStack Virtual handles automatically.

### Verdict: **REJECT** (for now)

Use a single fully-virtualized list. The aggregation transitions, diff
expansions, and script lifecycle at the tail make an unvirtualized zone
more complex than the jitter it prevents. Revisit only if profiling shows
measurable jitter in the last 8 rows during streaming.

**Fallback plan**: If streaming jitter is measured, consider a narrower
`UNVIRTUALIZED_TAIL_ROWS = 3` covering only the working indicator and
the last assistant message, avoiding the aggregation/diff zone.

---

## 2. Width-Aware Estimator (`timelineHeight.ts`)

### T3 approach

T3's `estimateTimelineMessageHeight` takes `{ timelineWidthPx: number | null }`
and computes per-role estimates:

- **User messages**: `bubbleWidth = timelineWidth * 0.8`, then
  `charsPerLine = textWidth / 8.4px`, then `lines * 22px + 96px base`.
- **Assistant messages**: `charsPerLine = (timelineWidth - 8px) / 7.2px`,
  then `lines * 22px + 78px base`.
- Attachment rows add `228px` per row of 2 attachments.
- Falls back to fixed `charsPerLine` (72 assistant, 56 user) when width
  is unknown.

On width change, `rowVirtualizer.measure()` is called to re-estimate all
unmeasured items.

### Vibe-kanban divergence

Vibe-kanban has 20 row families (vs T3's ~4 row kinds). Width-aware
estimation would need per-family formulas for:

- `tool_summary` (single line, fixed height ~40px regardless of width)
- `file_edit` (diff viewer height depends on line count, not width)
- `aggregated_tool` (collapsed: fixed; expanded: N × entry height)
- `script` (fixed height with optional process viewer)
- `plan` / `approval` (markdown content, similar to assistant messages)

Most vibe-kanban row families have **fixed or state-dependent heights**
that don't vary with container width. Only `user_message`,
`assistant_message`, and `thinking` benefit from width-aware estimation.

### Verdict: **ADAPT**

Adopt width-aware estimation for the 3 text-heavy families
(`user_message`, `assistant_message`, `thinking`) using T3's
`charsPerLine` approach. For the remaining 17 families, use the existing
`SizeEstimationHint` bucket system from `conversation-row-model.ts`
(`compact: 40px`, `medium: 80px`, `tall: 200px`, `dynamic: 120px`).

Implementation: Add an optional `containerWidthPx` parameter to a new
`estimateSizeForRow(row: ConversationRow, containerWidthPx?: number)`
function. For text-heavy families, apply T3's formula adapted to
vibe-kanban's layout constants. For others, return `SIZE_ESTIMATE_PX[hint]`.

Call `virtualizer.measure()` on container width change (same as T3).

---

## 3. `shouldAdjustScrollPositionOnItemSizeChange`

### T3 approach

T3 sets a custom callback on the virtualizer instance:

```typescript
rowVirtualizer.shouldAdjustScrollPositionOnItemSizeChange =
  (_item, _delta, instance) => {
    const viewportHeight = instance.scrollRect?.height ?? 0;
    const scrollOffset = instance.scrollOffset ?? 0;
    const remainingDistance =
      instance.getTotalSize() - (scrollOffset + viewportHeight);
    return remainingDistance > AUTO_SCROLL_BOTTOM_THRESHOLD_PX;
  };
```

**Semantics**: Adjust scroll position (anchor correction) when items above
the viewport change size, **unless** the user is near the bottom. Near the
bottom, let the content push naturally — anchor correction would fight
against follow-bottom behaviour.

### Vibe-kanban alignment

This is directly applicable. Vibe-kanban's `NEAR_BOTTOM_THRESHOLD_PX = 64`
(already adopted from T3's `AUTO_SCROLL_BOTTOM_THRESHOLD_PX = 64`) is the
exact threshold to use.

The anchor correction is critical for vibe-kanban's diff expansions and
aggregation compactions that happen above the viewport while the user reads
content below.

### Verdict: **ADOPT**

Copy T3's `shouldAdjustScrollPositionOnItemSizeChange` callback verbatim,
using our `NEAR_BOTTOM_THRESHOLD_PX` constant. Set it in a `useEffect`
on the virtualizer instance, with cleanup that resets to `undefined`.

---

## 4. Near-Bottom Threshold

### T3 approach

`AUTO_SCROLL_BOTTOM_THRESHOLD_PX = 64` in `chat-scroll.ts`.
`isScrollContainerNearBottom` checks `scrollHeight - clientHeight - scrollTop <= threshold`.

### Vibe-kanban alignment

Already adopted. `conversation-scroll-commands.ts` exports
`NEAR_BOTTOM_THRESHOLD_PX = 64` and `isNearBottom()` with identical
semantics.

### Verdict: **ADOPT** (already done)

No further action needed. The constant and detection function are in place.

---

## 5. Explicit Scroll Policy

### T3 approach

T3 uses a **ref-based imperative** scroll model:

- `shouldAutoScrollRef` (boolean) — sticky flag toggled by scroll events.
- `pendingUserScrollUpIntentRef` — set by `wheel`/`touchmove` events.
- `isPointerScrollActiveRef` — set by `pointerdown`/`pointerup`.
- `scheduleStickToBottom()` — `requestAnimationFrame` to scroll to bottom.
- `onMessagesScroll` callback — complex state machine that transitions
  `shouldAutoScrollRef` based on scroll direction, pointer state, and
  near-bottom detection.

This is a **low-level, event-driven** approach with 6+ refs and multiple
event handlers coordinating scroll behaviour.

### Vibe-kanban approach

`conversation-scroll-commands.ts` uses a **declarative intent** model:

- `ScrollIntent` (6 variants) — describes *what* should happen.
- `ScrollState` — single source of truth with `isAtBottom`,
  `pendingIntent`, `lastAppliedIntent`.
- `resolveScrollIntent(addType, isInitialLoad, isAtBottom)` — pure
  function mapping data updates to intents.
- State transitions via pure functions (`setPendingIntent`,
  `markIntentApplied`, `updateIsAtBottom`).

### Comparison

| Aspect | T3 | Vibe-kanban |
|--------|-----|-------------|
| Model | Imperative refs | Declarative intents |
| Testability | Hard (refs + DOM events) | Easy (pure functions) |
| Complexity | 6+ refs, 7 event handlers | 1 state object, 1 resolver |
| Scroll-to-item | Manual `scrollIntoView` | `JumpToIndexIntent` |
| Plan reveal | Manual scroll calculation | `PlanRevealIntent` |

### Verdict: **REJECT** T3's imperative model

Keep vibe-kanban's declarative `ScrollIntent` system. It is more testable,
more maintainable, and already covers all of T3's scroll scenarios through
its 6 intent variants. The intent model also cleanly separates "what to do"
from "how to do it", making the TanStack Virtual executor a thin adapter.

**One T3 idea to borrow**: T3's `onMessagesWheel` and `onMessagesTouchMove`
handlers for detecting user scroll-up intent are more robust than relying
solely on scroll position. Consider adding wheel/touch event listeners in
the scroll executor to set `isAtBottom = false` proactively (before the
scroll event fires), preventing a one-frame auto-scroll before the user's
intent is detected.

---

## 6. Semantic Item Identity / `getItemKey`

### T3 approach

```typescript
getItemKey: (index: number) => rows[index]?.id ?? index
```

Row IDs are timeline entry IDs (message IDs, `"working-indicator-row"`,
etc.). Simple and stable because T3's row model is flat — no aggregation,
no key transitions.

### Vibe-kanban approach

`conversation-row-model.ts` defines `semanticKey`:

```typescript
semanticKeyForEntry(entry: DisplayEntry): string {
  return `conv-${entry.patchKey}`;
}
```

Keys are namespaced (`conv-{processId}:{index}`, `conv-agg:{firstEntryKey}`,
etc.) and documented with explicit stability contracts in the Key Contract
Audit section.

### Comparison

T3's keys are simpler because T3 has no aggregation transitions. Vibe-kanban
must handle:

1. **Aggregation boundary shifts**: Single entry key → `agg:{key}` when
   grouped. The virtualizer sees a key removal + addition, not an update.
2. **Script streaming → completed**: Key suffix `:script` prevents height
   reuse across the transition.
3. **Process reload**: All keys for a process change when entries are
   reloaded from the historic endpoint.

### Verdict: **ADAPT**

Use T3's `getItemKey` pattern but with vibe-kanban's `semanticKey`:

```typescript
getItemKey: (index: number) => rows[index]?.semanticKey ?? index
```

The `semanticKey` system is already designed for this purpose and handles
edge cases T3 doesn't have.

---

## 7. `measureElement`

### T3 approach

T3 imports `measureElement` from `@tanstack/react-virtual` and passes it
directly:

```typescript
import { measureElement as measureVirtualElement } from "@tanstack/react-virtual";
// ...
measureElement: measureVirtualElement,
useAnimationFrameWithResizeObserver: true,
```

Each virtualized row gets `ref={rowVirtualizer.measureElement}` on its
container div. The `useAnimationFrameWithResizeObserver: true` option
batches ResizeObserver callbacks into animation frames.

T3 also has a manual `onTimelineImageLoad` callback that calls
`rowVirtualizer.measure()` when images load (since images don't trigger
ResizeObserver on the row container).

### Vibe-kanban alignment

Directly applicable. Vibe-kanban's row renderers already have stable
container divs (the `py-base px-double` wrapper in
`DisplayConversationEntrySpaced`). The `ref` can be attached there.

**Image loading**: Vibe-kanban's `ChatMarkdown` renders images inside
assistant messages. The same `onImageLoad → measure()` pattern is needed.

**Diff expansion**: When a `file_edit` entry expands/collapses its diff,
the ResizeObserver on the row container will fire automatically. No manual
measurement needed.

### Verdict: **ADOPT**

Use T3's `measureElement` + `useAnimationFrameWithResizeObserver: true`
configuration. Add an image-load measurement callback similar to T3's
`onTimelineImageLoad` for markdown images.

Set `overscan` to 8 (same as T3) as a starting point; tune based on
profiling with vibe-kanban's taller rows.

---

## 8. Row-Type Diversity

### T3 model

T3 has 4 row kinds:

| Kind | Description |
|------|-------------|
| `message` | User or assistant message (with optional streaming, diff summary, proposed plan) |
| `work` | Grouped work log entries (tool calls, thinking) |
| `proposed-plan` | Standalone plan card |
| `working` | "Working..." indicator |

All rendering logic is in a single `renderRowContent` function with
`if (row.kind === "...")` branches. No aggregation, no sub-variant dispatch.

### Vibe-kanban model

20 row families across 3 categories:

- **10 atomic types**: `user_message`, `assistant_message`, `system_message`,
  `thinking`, `error_message`, `loading`, `next_action`, `token_usage_info`,
  `user_feedback`, `user_answered_questions`
- **7 tool-use sub-variants**: `tool_summary`, `file_edit`, `script`,
  `plan`, `todo`, `subagent`, `approval`
- **3 aggregated groups**: `aggregated_tool`, `aggregated_diff`,
  `aggregated_thinking`

Each family has its own renderer component. Dispatch is via
`classifyRowFamily()` → `switch` in `DisplayConversationEntry`.

### Impact on virtualizer

T3's simple row model means `estimateSize` is a 4-branch function.
Vibe-kanban needs the `SizeEstimationHint` bucket system (5 buckets
mapped from 20 families) to keep `estimateSize` manageable.

T3 can inline all rendering in one component. Vibe-kanban must keep the
existing component dispatch architecture — the virtualizer should not
know about row internals.

### Verdict: **REJECT** T3's flat row model

Keep vibe-kanban's `RowFamily` + `SizeEstimationHint` architecture.
The virtualizer interacts with rows through `ConversationRow` (family,
hint, semanticKey) and delegates rendering to the existing component
dispatch chain. T3's flat model doesn't scale to 20 row types.

---

## 9. Grouped Rows / Aggregation

### T3 model

T3 has **no aggregation**. Each timeline entry is one row. Work log entries
are grouped into a `work` row kind, but this grouping happens during row
construction (in `useMemo`), not as a dynamic aggregation that changes as
entries arrive.

### Vibe-kanban model

Three aggregation types that **dynamically form and dissolve**:

| Type | Trigger | Key transition |
|------|---------|----------------|
| `AGGREGATED_GROUP` | 2+ consecutive same-type tool entries | `conv-{key}` → `conv-agg:{key}` |
| `AGGREGATED_DIFF_GROUP` | 2+ consecutive `file_edit` for same path | `conv-{key}` → `conv-agg-diff:{key}` |
| `AGGREGATED_THINKING_GROUP` | Thinking entries in previous turns | `conv-{key}` → `conv-agg-thinking:{key}` |

**Critical difference**: Aggregation changes the item count and keys in
the list. When a second `file_read` arrives after a first, the list goes
from `[..., file_read_1]` to `[..., agg_group(file_read_1, file_read_2)]`.
The virtualizer must handle this as a key removal + key addition, not an
in-place update.

### Impact on virtualizer

1. **Key stability**: The virtualizer's measurement cache is keyed by
   `getItemKey`. When aggregation changes a key, the old measurement is
   orphaned and the new key starts with an estimate. This is correct
   behaviour — the aggregated row has a different height than the
   individual row.

2. **Anchor correction**: If aggregation happens above the viewport,
   `shouldAdjustScrollPositionOnItemSizeChange` must fire to keep the
   reading position stable.

3. **Count changes**: TanStack Virtual handles count changes natively
   (it re-indexes on every render). No special handling needed.

### Verdict: **REJECT** T3's no-aggregation model (N/A — not a pattern to adopt)

Aggregation is a vibe-kanban requirement with no T3 equivalent. The
virtualizer must be configured to handle dynamic key transitions
gracefully. The `semanticKey` system in `conversation-row-model.ts`
already accounts for this.

---

## 10. Script / Process Lifecycle

### T3 model

T3 has **no script lifecycle**. There are no setup scripts, cleanup
scripts, archive scripts, or tool install scripts. Processes don't
transition between streaming and completed states with entry reloads.

### Vibe-kanban model

Scripts introduce unique lifecycle challenges:

1. **Setup script ordering**: The initial user message is suppressed from
   the coding agent branch when a setup script exists, then emitted after
   the script finishes. This reorder suppression must work with the
   virtualizer's key tracking.

2. **Script key suffix**: The `:script` key suffix prevents height reuse
   when a script transitions from streaming (with live log output) to
   completed (collapsed summary). Without this, the virtualizer would
   use the streaming height for the completed row.

3. **Process status transitions**: When a process goes from `running` to
   `completed`, entries are reloaded from the historic endpoint. All keys
   for that process change in one batch. The virtualizer must handle this
   as a bulk replacement.

4. **Loading indicator lifecycle**: The synthetic loading row
   (`{processId}:loading`) is removed when the process completes. This
   changes the item count.

### Impact on virtualizer

These are all handled by TanStack Virtual's standard mechanisms:

- Key changes → measurement cache miss → re-estimate + re-measure.
- Count changes → re-index on next render.
- Bulk replacement → all affected rows get new keys, old measurements
  are orphaned.

No T3 pattern applies here because T3 doesn't have this complexity.

### Verdict: **REJECT** (N/A — no T3 pattern exists)

Script lifecycle is a vibe-kanban-only concern. The existing key
conventions (`:script` suffix, process-scoped keys) and the
`conversation-row-model.ts` architecture handle this. The virtualizer
needs no special configuration beyond what's already planned.

---

## Summary Table

| # | Pattern | Verdict | Rationale |
|---|---------|---------|-----------|
| 1 | Hybrid virtualized/unvirtualized tail | **REJECT** | Aggregation + diff expansion at tail make unvirtualized zone more complex than the jitter it prevents |
| 2 | Width-aware estimator | **ADAPT** | Apply to 3 text-heavy families only; use bucket hints for remaining 17 |
| 3 | `shouldAdjustScrollPositionOnItemSizeChange` | **ADOPT** | Directly applicable; use `NEAR_BOTTOM_THRESHOLD_PX` for the cutoff |
| 4 | Near-bottom threshold (64px) | **ADOPT** | Already implemented in `conversation-scroll-commands.ts` |
| 5 | Explicit scroll policy | **REJECT** | Keep declarative `ScrollIntent` model; borrow wheel/touch detection idea |
| 6 | Semantic identity / `getItemKey` | **ADAPT** | Use T3's pattern with vibe-kanban's `semanticKey` (handles aggregation transitions) |
| 7 | `measureElement` | **ADOPT** | Use with `useAnimationFrameWithResizeObserver: true`; add image-load callback |
| 8 | Row-type diversity | **REJECT** | T3's 4-kind flat model doesn't scale to 20 families; keep `RowFamily` + `SizeEstimationHint` |
| 9 | Grouped rows / aggregation | **REJECT** | N/A — T3 has none; vibe-kanban's dynamic aggregation is handled by existing key system |
| 10 | Script/process lifecycle | **REJECT** | N/A — T3 has none; vibe-kanban's lifecycle is handled by existing key conventions |

### Adopted patterns (use as-is)

- `shouldAdjustScrollPositionOnItemSizeChange` with 64px threshold
- `NEAR_BOTTOM_THRESHOLD_PX = 64`
- `measureElement` + `useAnimationFrameWithResizeObserver: true`
- `overscan: 8`

### Adapted patterns (modified for vibe-kanban)

- Width-aware estimation for `user_message`, `assistant_message`, `thinking` only
- `getItemKey` using `ConversationRow.semanticKey` instead of flat row IDs
- Wheel/touch event detection for proactive `isAtBottom` updates (from T3's scroll handlers)

### Rejected patterns (not applicable or inferior)

- Hybrid virtualized/unvirtualized tail split
- Imperative ref-based scroll state machine
- Flat 4-kind row model
- No-aggregation assumption
- No-script-lifecycle assumption
