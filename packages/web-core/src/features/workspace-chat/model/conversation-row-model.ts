/**
 * Conversation Row Model
 *
 * Semantic row identity and metadata for the conversation list.
 * It wraps `DisplayEntry` with stable keys, row families, and size hints.
 */

import type { DisplayEntry } from '@/shared/hooks/useConversationHistory/types';

// ---------------------------------------------------------------------------
// Row Family
// ---------------------------------------------------------------------------

/**
 * Exhaustive list of visual row families used by the renderer.
 */
export type RowFamily =
  // Atomic NormalizedEntry types
  | 'user_message'
  | 'assistant_message'
  | 'system_message'
  | 'thinking'
  | 'error_message'
  | 'loading'
  | 'next_action'
  | 'token_usage_info'
  | 'user_feedback'
  | 'user_answered_questions'
  // Tool-use sub-variants (dispatched by action_type.action)
  | 'tool_summary' // file_read, search, web_fetch, command_run (non-script), generic tool
  | 'file_edit'
  | 'script' // Setup Script, Cleanup Script, Archive Script, Tool Install Script
  | 'plan' // plan_presentation
  | 'todo' // todo_management
  | 'subagent' // task_create
  | 'approval' // any tool_use with status === 'pending_approval' (generic)
  // Aggregated group types
  | 'aggregated_tool' // AGGREGATED_GROUP
  | 'aggregated_diff' // AGGREGATED_DIFF_GROUP
  | 'aggregated_thinking'; // AGGREGATED_THINKING_GROUP

// ---------------------------------------------------------------------------
// Size Estimation Hint
// ---------------------------------------------------------------------------

/**
 * Coarse height bucket used before real DOM measurement is available.
 */
export type SizeEstimationHint =
  | 'compact'
  | 'medium'
  | 'tall'
  | 'dynamic'
  | 'hidden';

// ---------------------------------------------------------------------------
// Conversation Row
// ---------------------------------------------------------------------------

/**
 * A single semantic row consumed by the conversation renderer.
 */
export interface ConversationRow {
  /**
   * Stable identity for the row. Used by the virtualizer and row renderer.
   */
  readonly semanticKey: string;

  /** Classification of what this row renders. */
  readonly rowFamily: RowFamily;

  /**
   * The execution process this row belongs to, or `null` for rows that
   * span processes (e.g., `next_action`).
   */
  readonly processId: string | null;

  /** Coarse height estimate for the virtualizer's `estimateSize`. */
  readonly estimationHint: SizeEstimationHint;

  /**
   * Whether this row is a user message. Pre-computed flag to enable
   * O(1) checks during `scrollToPreviousUserMessage` scans.
   */
  readonly isUserMessage: boolean;

  /**
   * The original `DisplayEntry` this row wraps. Passed through to the
   * row renderer unchanged.
   */
  readonly entry: DisplayEntry;
}

// ---------------------------------------------------------------------------
// Row Family Detection
// ---------------------------------------------------------------------------

const SCRIPT_TOOL_NAMES = new Set([
  'Setup Script',
  'Cleanup Script',
  'Archive Script',
  'Tool Install Script',
]);

/**
 * Determine the renderer family for a display entry.
 */
export function classifyRowFamily(entry: DisplayEntry): RowFamily {
  // Aggregated group types
  if (entry.type === 'AGGREGATED_GROUP') return 'aggregated_tool';
  if (entry.type === 'AGGREGATED_DIFF_GROUP') return 'aggregated_diff';
  if (entry.type === 'AGGREGATED_THINKING_GROUP') return 'aggregated_thinking';

  // Non-normalized entries (STDOUT/STDERR/DIFF) — treat as tool summary
  if (entry.type !== 'NORMALIZED_ENTRY') return 'tool_summary';

  const entryType = entry.content.entry_type;

  switch (entryType.type) {
    case 'user_message':
      return 'user_message';
    case 'assistant_message':
      return 'assistant_message';
    case 'system_message':
      return 'system_message';
    case 'thinking':
      return 'thinking';
    case 'error_message':
      return 'error_message';
    case 'loading':
      return 'loading';
    case 'next_action':
      return 'next_action';
    case 'token_usage_info':
      return 'token_usage_info';
    case 'user_feedback':
      return 'user_feedback';
    case 'user_answered_questions':
      return 'user_answered_questions';
    case 'tool_use': {
      // Check pending_approval first — generic approval card overrides
      // specific tool renderers (except file_edit and plan_presentation
      // which have their own approval handling).
      const { action_type, status, tool_name } = entryType;

      if (action_type.action === 'file_edit') return 'file_edit';
      if (action_type.action === 'plan_presentation') return 'plan';
      if (action_type.action === 'todo_management') return 'todo';
      if (action_type.action === 'task_create') return 'subagent';

      // Script entries
      if (
        action_type.action === 'command_run' &&
        SCRIPT_TOOL_NAMES.has(tool_name)
      ) {
        return 'script';
      }

      // Generic approval (non-file_edit, non-plan)
      if (status.status === 'pending_approval') return 'approval';

      return 'tool_summary';
    }
    default:
      return 'tool_summary';
  }
}

// ---------------------------------------------------------------------------
// Size Estimation
// ---------------------------------------------------------------------------

/** Default estimated sizes in pixels for each hint bucket. */
export const SIZE_ESTIMATE_PX: Record<SizeEstimationHint, number> = {
  compact: 40,
  medium: 80,
  tall: 280,
  dynamic: 150,
  hidden: 0,
};

// ---------------------------------------------------------------------------
// Width-Aware Content-Based Size Estimation
// ---------------------------------------------------------------------------

const TEXT_CONTENT_FAMILIES = new Set<RowFamily>([
  'user_message',
  'assistant_message',
  'thinking',
]);

const AVG_CHAR_WIDTH_PX = 7.2; // avg proportional font char width
const LINE_HEIGHT_PX = 22;
const MESSAGE_CHROME_PX = 64; // avatar + timestamp + margins
const MESSAGE_HORIZONTAL_PADDING_PX = 100; // avatar + padding + scrollbar
const MIN_TEXT_ESTIMATE_PX = 60;
const MAX_TEXT_ESTIMATE_PX = 12_000;

function estimateTextRowHeight(
  textLength: number,
  containerWidthPx: number,
  fallback: number
): number {
  if (textLength <= 0 || containerWidthPx <= 0) return fallback;

  const textAreaWidth = Math.max(
    100,
    containerWidthPx - MESSAGE_HORIZONTAL_PADDING_PX
  );
  const charsPerLine = Math.max(
    20,
    Math.floor(textAreaWidth / AVG_CHAR_WIDTH_PX)
  );
  const lineCount = Math.max(1, Math.ceil(textLength / charsPerLine));
  const estimated = MESSAGE_CHROME_PX + lineCount * LINE_HEIGHT_PX;

  return Math.min(
    Math.max(estimated, MIN_TEXT_ESTIMATE_PX),
    MAX_TEXT_ESTIMATE_PX
  );
}

function getEntryTextLength(
  entry: import('@/shared/hooks/useConversationHistory/types').DisplayEntry
): number {
  if (entry.type !== 'NORMALIZED_ENTRY') return 0;
  return entry.content.content?.length ?? 0;
}

export function estimateSizeForRow(
  row: ConversationRow,
  containerWidthPx?: number | null
): number {
  const base = SIZE_ESTIMATE_PX[row.estimationHint];

  if (
    containerWidthPx != null &&
    containerWidthPx > 0 &&
    TEXT_CONTENT_FAMILIES.has(row.rowFamily)
  ) {
    const textLength = getEntryTextLength(row.entry);
    if (textLength > 0) {
      return estimateTextRowHeight(textLength, containerWidthPx, base);
    }
  }

  return base;
}

/**
 * Map a `RowFamily` to a `SizeEstimationHint`.
 *
 * This is deliberately coarse — real sizes vary based on content length,
 * expansion state, etc. The hint just gives the virtualizer a reasonable
 * starting point to reduce initial layout jank.
 */
export function estimationHintForFamily(family: RowFamily): SizeEstimationHint {
  switch (family) {
    // Compact: single-line or minimal-height rows
    case 'tool_summary':
    case 'loading':
    case 'token_usage_info':
    case 'todo':
      return 'compact';

    // Medium: multi-line but bounded rows
    case 'user_message':
    case 'error_message':
    case 'user_feedback':
    case 'user_answered_questions':
    case 'script':
      return 'medium';

    case 'system_message':
      return 'compact';

    // Tall: potentially large content
    case 'assistant_message':
    case 'plan':
    case 'subagent':
    case 'approval':
      return 'tall';

    // Aggregated groups start collapsed (useState(false)) with ~40-60px
    // actual height. Estimating 'tall' (280px) caused ~6x overestimate
    // during streaming aggregation transitions (individual→grouped),
    // producing scroll jitter under follow-bottom. 'compact' matches the
    // default collapsed state; ResizeObserver corrects on user expand.
    case 'aggregated_tool':
    case 'aggregated_diff':
    case 'aggregated_thinking':
      return 'compact';

    // Dynamic: height changes significantly based on state
    case 'file_edit':
    case 'thinking':
      return 'dynamic';

    // Hidden: filtered before reaching the list
    case 'next_action':
      return 'hidden';
  }
}

// ---------------------------------------------------------------------------
// Semantic Key Generation
// ---------------------------------------------------------------------------

/**
 * Produce a stable semantic key for a `DisplayEntry`.
 *
 * This replaces the ad-hoc `'conv-' + data.patchKey` pattern with
 * explicitly namespaced keys that encode the row's origin:
 *
 * - Aggregated groups: `conv-agg:{firstEntryKey}`,
 *   `conv-agg-diff:{firstEntryKey}`, `conv-agg-thinking:{firstEntryKey}`
 * - Regular entries: `conv-{patchKey}`
 *
 * The `conv-` prefix is preserved for backward compatibility with
 * persisted expansion state keys in `useUiPreferencesStore`.
 */
export function semanticKeyForEntry(entry: DisplayEntry): string {
  // The patchKey already contains the aggregation prefix
  // (e.g., `agg:`, `agg-diff:`, `agg-thinking:`) for aggregated groups.
  // We just need to add the `conv-` prefix.
  return `conv-${entry.patchKey}`;
}

// ---------------------------------------------------------------------------
// Row Builder
// ---------------------------------------------------------------------------

/**
 * Convert a `DisplayEntry` into a `ConversationRow`.
 *
 * This is the primary entry point for consumers that want to build the
 * row model from an existing `DisplayEntry[]` pipeline.
 */
export function buildConversationRow(entry: DisplayEntry): ConversationRow {
  const rowFamily = classifyRowFamily(entry);
  const hint = estimationHintForFamily(rowFamily);

  return {
    semanticKey: semanticKeyForEntry(entry),
    rowFamily,
    processId: entry.executionProcessId || null,
    estimationHint: hint,
    isUserMessage: rowFamily === 'user_message',
    entry,
  };
}

/**
 * Convert a `DisplayEntry[]` into `ConversationRow[]`.
 *
 * Preserves order. Can be used as a drop-in transformation step in the
 * data pipeline between `aggregateConsecutiveEntries` and the virtualizer.
 */
export function buildConversationRows(
  entries: DisplayEntry[]
): ConversationRow[] {
  return entries.map(buildConversationRow);
}

/**
 * Incremental row builder that reuses previous `ConversationRow` objects
 * when the underlying `DisplayEntry` reference is unchanged.
 *
 * During streaming, most entries are stable (same object reference from
 * the previous emit). Only the tail entries change (new appends or
 * aggregation boundary shifts). Reusing row objects means:
 * 1. Less GC pressure from short-lived objects.
 * 2. TanStack Virtual's internal diffing can skip unchanged rows faster.
 */
export function buildConversationRowsIncremental(
  entries: DisplayEntry[],
  prevEntries: DisplayEntry[],
  prevRows: ConversationRow[]
): ConversationRow[] {
  const len = entries.length;
  const rows: ConversationRow[] = new Array(len);

  for (let i = 0; i < len; i++) {
    if (i < prevRows.length && entries[i] === prevEntries[i]) {
      rows[i] = prevRows[i];
    } else {
      rows[i] = buildConversationRow(entries[i]);
    }
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Row Queries
// ---------------------------------------------------------------------------

/**
 * Find the index of the previous user-message row before `beforeIndex`.
 *
 * Used by `scrollToPreviousUserMessage` to locate the scroll target
 * without re-scanning entry internals.
 *
 * @returns The index of the previous user message, or -1 if none found.
 */
export function findPreviousUserMessageIndex(
  rows: ConversationRow[],
  beforeIndex: number
): number {
  for (let i = beforeIndex - 1; i >= 0; i--) {
    if (rows[i].isUserMessage) return i;
  }
  return -1;
}

// ---------------------------------------------------------------------------
// Key Contract Audit Notes
// ---------------------------------------------------------------------------

/**
 * KEY CONTRACT AUDIT
 *
 * Traced all key production paths. Findings:
 *
 * ## Stable keys
 * - Backend entries: `{processId}:{index}` — stable as long as the entry
 *   array for a process doesn't get reordered (it doesn't; entries are
 *   append-only within a process).
 * - Synthetic user messages: `{processId}:user` — unique per process.
 * - Synthetic loading: `{processId}:loading` — unique per process.
 * - Script entries: `{processId}:script` — unique per process. The
 *   `:script` suffix provides semantic clarity and avoids collision
 *   with index-based keys. TanStack's measureElement + ResizeObserver
 *   handles height changes during streaming->completed transitions.
 * - Next action: `next_action` — singleton.
 * - Aggregated groups: `agg:{firstEntryKey}` — stable because the first
 *   entry's key is stable and aggregation only groups *consecutive*
 *   entries (the first entry of a group is always the same entry).
 *
 * ## Potential instabilities
 * 1. **Index-based keys during streaming**: While a process is streaming,
 *    entries are re-indexed on every `onEntries` callback (entries.map
 *    with index). If entries are *replaced* (not appended), keys could
 *    shift. In practice, the stream appears to be append-only, so this
 *    is low risk but worth monitoring.
 *
 * 2. **Process reload on status transition**: When a process transitions
 *    from running to completed, entries are reloaded from the historic
 *    endpoint. The reloaded entries get fresh index-based keys. This
 *    is intentional — the full entry set replaces the streaming set —
 *    but means all keys for that process change in one batch. The
 *    virtualizer must handle this as a bulk replacement, not an update.
 *
 * 3. **Setup-script user message deduplication**: The initial user
 *    message can appear from either the script branch or the coding
 *    agent branch. Both use the key `{processId}:user` but with
 *    different processIds, so there's no collision. The suppression
 *    logic (`isInitialWithSetup`) ensures only one is emitted.
 *
 * 4. **Aggregation boundary shifts**: When a new entry arrives that
 *    matches the aggregation type of the previous entry, a single
 *    entry becomes a group. The group's key is `agg:{singleEntryKey}`,
 *    which is different from the original entry's key. This means the
 *    virtualizer sees the old key removed and a new key added. This
 *    is correct behavior but the virtualizer must not try to animate
 *    between the old and new states.
 */
