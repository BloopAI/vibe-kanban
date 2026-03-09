/**
 * Conversation Scroll Commands
 *
 * Declarative scroll intent model for TanStack Virtual.
 * Single scroll authority — one pending intent at a time, no queue, no merge.
 * Intents survive the gap between data arrival and measured layout.
 *
 * | ScrollIntent variant | Purpose                                    |
 * |----------------------|--------------------------------------------|
 * | initial-bottom       | Jump to bottom on first data load          |
 * | follow-bottom        | Auto-scroll as new content streams in      |
 * | preserve-anchor      | Keep scroll position during historic loads |
 * | plan-reveal          | Scroll last item to top of viewport        |
 * | jump-to-bottom       | Imperative scroll to bottom                |
 * | jump-to-index        | Imperative scroll to specific index        |
 */

import type { AddEntryType } from '@/shared/hooks/useConversationHistory/types';

// ---------------------------------------------------------------------------
// Near-Bottom Threshold
// ---------------------------------------------------------------------------

/**
 * Pixel distance from bottom within which the user is considered "at bottom".
 * Accounts for sub-pixel rounding, scroll inertia, and minor content growth.
 */
export const NEAR_BOTTOM_THRESHOLD_PX = 64;

// ---------------------------------------------------------------------------
// Scroll Intent
// ---------------------------------------------------------------------------

/**
 * Jump to bottom on first load, invalidating all estimated sizes.
 * The `purgeEstimatedSizes` flag tells the virtualizer to discard cached
 * measurements and re-measure — critical because initial estimates are
 * heuristic, not DOM-measured.
 */
export interface InitialBottomIntent {
  readonly type: 'initial-bottom';
  readonly purgeEstimatedSizes: true;
}

/**
 * Stick to bottom during streaming. Only active when the user is at bottom;
 * if the user scrolls up, the system transitions to `preserve-anchor`.
 */
export interface FollowBottomIntent {
  readonly type: 'follow-bottom';
  readonly behavior: ScrollBehavior;
}

/**
 * Don't scroll — user is reading history. The virtualizer should use
 * `shouldAdjustScrollPositionOnItemSizeChange` to keep the reading
 * position stable as items above change size.
 */
export interface PreserveAnchorIntent {
  readonly type: 'preserve-anchor';
}

/** Scroll so the last item's top is visible (plan presentation). */
export interface PlanRevealIntent {
  readonly type: 'plan-reveal';
  readonly align: 'start';
}

/** Explicit user action to return to bottom (scroll-to-bottom button). */
export interface JumpToBottomIntent {
  readonly type: 'jump-to-bottom';
  readonly behavior: ScrollBehavior;
}

/** Scroll to a specific row index (previous-user-message, jump-to-item). */
export interface JumpToIndexIntent {
  readonly type: 'jump-to-index';
  readonly index: number;
  readonly align: 'start' | 'center' | 'end';
  readonly behavior: ScrollBehavior;
}

export type ScrollIntent =
  | InitialBottomIntent
  | FollowBottomIntent
  | PreserveAnchorIntent
  | PlanRevealIntent
  | JumpToBottomIntent
  | JumpToIndexIntent;

// ---------------------------------------------------------------------------
// Scroll State
// ---------------------------------------------------------------------------

/**
 * Single source of truth for conversation scroll behaviour.
 *
 * Intent lifecycle:
 * 1. Data update → `resolveScrollIntent` produces intent
 * 2. `setPendingIntent` stores it in state
 * 3. React re-renders, TanStack Virtual measures new items
 * 4. Scroll executor reads `pendingIntent`, applies it, calls `markIntentApplied`
 */
export interface ScrollState {
  /** Whether the user is at (or near) the bottom of the list. */
  readonly isAtBottom: boolean;

  /** Intent waiting to be applied after virtualizer measurement. */
  readonly pendingIntent: ScrollIntent | null;

  /** Last successfully applied intent (for deduplication). */
  readonly lastAppliedIntent: ScrollIntent | null;
}

// ---------------------------------------------------------------------------
// State Factory
// ---------------------------------------------------------------------------

export function createInitialScrollState(): ScrollState {
  return {
    isAtBottom: true,
    pendingIntent: null,
    lastAppliedIntent: null,
  };
}

// ---------------------------------------------------------------------------
// Intent Resolution
// ---------------------------------------------------------------------------

/**
 * Map a data update to the appropriate scroll intent.
 *
 * Decision table:
 * ```
 * isInitialLoad                   → initial-bottom     (purge + jump)
 * addType === 'plan'              → plan-reveal        (reveal plan)
 * addType === 'running' + atBottom→ follow-bottom      (follow stream)
 * addType === 'running' + !atBottom→ preserve-anchor   (user reading)
 * else + atBottom                 → follow-bottom      (historic at bottom)
 * else + !atBottom                → preserve-anchor    (historic scrolled up)
 * ```
 */
export function resolveScrollIntent(
  addType: AddEntryType,
  isInitialLoad: boolean,
  isAtBottom: boolean
): ScrollIntent {
  if (isInitialLoad) {
    return { type: 'initial-bottom', purgeEstimatedSizes: true };
  }

  if (addType === 'plan') {
    return { type: 'plan-reveal', align: 'start' };
  }

  if (addType === 'running') {
    return isAtBottom
      ? { type: 'follow-bottom', behavior: 'smooth' }
      : { type: 'preserve-anchor' };
  }

  return isAtBottom
    ? { type: 'follow-bottom', behavior: 'auto' }
    : { type: 'preserve-anchor' };
}

// ---------------------------------------------------------------------------
// Auto-Follow Predicate
// ---------------------------------------------------------------------------

/**
 * Whether the list should auto-follow to bottom on new data.
 * True when user is at bottom AND update is not a plan (plans have their
 * own scroll behaviour via plan-reveal).
 */
export function shouldAutoFollow(
  state: ScrollState,
  addType: AddEntryType
): boolean {
  if (!state.isAtBottom) return false;
  if (addType === 'plan') return false;
  return true;
}

// ---------------------------------------------------------------------------
// State Transitions
// ---------------------------------------------------------------------------

/** Set a new pending intent, replacing any existing one. */
export function setPendingIntent(
  state: ScrollState,
  intent: ScrollIntent
): ScrollState {
  return { ...state, pendingIntent: intent };
}

/** Mark pending intent as applied and move it to `lastAppliedIntent`. */
export function markIntentApplied(state: ScrollState): ScrollState {
  return {
    ...state,
    lastAppliedIntent: state.pendingIntent,
    pendingIntent: null,
  };
}

/** Update `isAtBottom` from a scroll event. */
export function updateIsAtBottom(
  state: ScrollState,
  isAtBottom: boolean
): ScrollState {
  if (state.isAtBottom === isAtBottom) return state;
  return { ...state, isAtBottom };
}

/** Clear pending intent without marking it as applied (intent went stale). */
export function clearPendingIntent(state: ScrollState): ScrollState {
  if (state.pendingIntent === null) return state;
  return { ...state, pendingIntent: null };
}

// ---------------------------------------------------------------------------
// Near-Bottom Detection
// ---------------------------------------------------------------------------

/**
 * Check whether a scroll container is within `NEAR_BOTTOM_THRESHOLD_PX`
 * of the bottom. Returns true for non-finite inputs (unmounted containers).
 */
export function isNearBottom(
  scrollTop: number,
  clientHeight: number,
  scrollHeight: number
): boolean {
  if (
    !Number.isFinite(scrollTop) ||
    !Number.isFinite(clientHeight) ||
    !Number.isFinite(scrollHeight)
  ) {
    return true;
  }

  const distanceFromBottom = scrollHeight - clientHeight - scrollTop;
  return distanceFromBottom <= NEAR_BOTTOM_THRESHOLD_PX;
}

// ---------------------------------------------------------------------------
// Intent Equality (for deduplication)
// ---------------------------------------------------------------------------

/** Structural equality check for scroll intents. */
export function intentsEqual(
  a: ScrollIntent | null,
  b: ScrollIntent | null
): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (a.type !== b.type) return false;

  switch (a.type) {
    case 'initial-bottom':
    case 'preserve-anchor':
    case 'plan-reveal':
      return true;
    case 'follow-bottom':
      return (b as FollowBottomIntent).behavior === a.behavior;
    case 'jump-to-bottom':
      return (b as JumpToBottomIntent).behavior === a.behavior;
    case 'jump-to-index': {
      const bIdx = b as JumpToIndexIntent;
      return (
        bIdx.index === a.index &&
        bIdx.align === a.align &&
        bIdx.behavior === a.behavior
      );
    }
  }
}
