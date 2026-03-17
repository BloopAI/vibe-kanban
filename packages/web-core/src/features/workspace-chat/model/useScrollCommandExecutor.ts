/**
 * Scroll Command Executor
 *
 * Bridges the declarative scroll-intent model (conversation-scroll-commands.ts)
 * to TanStack Virtual's imperative scrollToIndex API.
 *
 * Lifecycle:
 * 1. Entry data arrives → `onEntriesChanged` resolves intent via `resolveScrollIntent`
 * 2. Intent is stored as pending in `ScrollState`
 * 3. React re-renders, TanStack Virtual measures new items
 * 4. `useLayoutEffect` reads the pending intent and dispatches the scroll command
 * 5. `markIntentApplied` clears the pending intent
 *
 * No setTimeout chains. All sequencing is via React lifecycle.
 */

import { useCallback, useLayoutEffect, useRef } from 'react';

import type { Virtualizer } from '@tanstack/react-virtual';

import type { AddEntryType } from '@/shared/hooks/useConversationHistory/types';

// TanStack Virtual only accepts 'auto' | 'smooth', not DOM's full ScrollBehavior
type TanStackScrollBehavior = 'auto' | 'smooth';
type TanStackScrollAlign = 'start' | 'center' | 'end';

function toTanStackBehavior(behavior: ScrollBehavior): TanStackScrollBehavior {
  return behavior === 'instant' ? 'auto' : behavior;
}

import {
  type ScrollIntent,
  type ScrollState,
  createInitialScrollState,
  markIntentApplied,
  resolveScrollIntent,
  setPendingIntent,
  updateIsAtBottom,
} from './conversation-scroll-commands';

function logConversationScrollIntent(
  event: string,
  payload: Record<string, unknown>
) {
  console.log(`[conversation-scroll-intent] ${event}`, payload);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScrollCommandExecutorOptions {
  /** The TanStack Virtual virtualizer instance. */
  virtualizer: Virtualizer<HTMLDivElement, Element>;

  /** Current number of items in the list. */
  itemCount: number;

  dataVersion: number;

  /** Reactive isAtBottom from the virtualizer hook. */
  isAtBottom: boolean;

  scrollToBottom: (behavior?: TanStackScrollBehavior) => void;

  scrollToAbsoluteIndex?: (
    index: number,
    align?: TanStackScrollAlign,
    behavior?: TanStackScrollBehavior
  ) => boolean;
}

export interface ScrollCommandExecutorResult {
  /**
   * Call when entries are updated. Resolves the appropriate scroll intent
   * based on addType, initial load state, and isAtBottom.
   */
  onEntriesChanged: (addType: AddEntryType, isInitialLoad: boolean) => void;

  /**
   * Imperatively request a jump-to-bottom (e.g., from the scroll-to-bottom button).
   */
  requestJumpToBottom: (behavior?: ScrollBehavior) => void;

  /**
   * Imperatively request scrolling to a specific index.
   */
  requestJumpToIndex: (
    index: number,
    align?: 'start' | 'center' | 'end',
    behavior?: ScrollBehavior
  ) => void;

  /**
   * Read-only access to the current pending intent (for debugging/testing).
   */
  pendingIntent: ScrollIntent | null;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useScrollCommandExecutor({
  virtualizer,
  itemCount,
  dataVersion,
  isAtBottom,
  scrollToBottom,
  scrollToAbsoluteIndex,
}: ScrollCommandExecutorOptions): ScrollCommandExecutorResult {
  // -------------------------------------------------------------------------
  // Scroll state lives in a ref to avoid re-render cascades.
  // The only consumer of pendingIntent is the useLayoutEffect below,
  // which runs synchronously after every render anyway.
  // -------------------------------------------------------------------------

  const stateRef = useRef<ScrollState>(createInitialScrollState());

  // Keep isAtBottom in sync with the virtualizer's reactive value
  const prevIsAtBottom = useRef(isAtBottom);
  if (isAtBottom !== prevIsAtBottom.current) {
    logConversationScrollIntent('at-bottom-updated', {
      previousIsAtBottom: prevIsAtBottom.current,
      nextIsAtBottom: isAtBottom,
      pendingIntentType: stateRef.current.pendingIntent?.type ?? null,
      lastAppliedIntentType: stateRef.current.lastAppliedIntent?.type ?? null,
    });

    prevIsAtBottom.current = isAtBottom;
    stateRef.current = updateIsAtBottom(stateRef.current, isAtBottom);
  }

  const prevDataVersionRef = useRef(dataVersion);

  // -------------------------------------------------------------------------
  // Intent resolution (called by the container when entries update)
  // -------------------------------------------------------------------------

  const onEntriesChanged = useCallback(
    (addType: AddEntryType, isInitialLoad: boolean) => {
      const intent = resolveScrollIntent(
        addType,
        isInitialLoad,
        stateRef.current.isAtBottom
      );
      logConversationScrollIntent('resolved', {
        addType,
        isInitialLoad,
        isAtBottom: stateRef.current.isAtBottom,
        intentType: intent.type,
      });
      stateRef.current = setPendingIntent(stateRef.current, intent);
    },
    []
  );

  // -------------------------------------------------------------------------
  // Imperative intent setters (for UI buttons)
  // -------------------------------------------------------------------------

  const requestJumpToBottom = useCallback(
    (behavior: ScrollBehavior = 'smooth') => {
      const intent: ScrollIntent = {
        type: 'jump-to-bottom',
        behavior,
      };
      stateRef.current = setPendingIntent(stateRef.current, intent);
      executeIntent(
        virtualizer,
        intent,
        itemCount,
        scrollToBottom,
        scrollToAbsoluteIndex
      );
      stateRef.current = markIntentApplied(stateRef.current);
    },
    [itemCount, scrollToAbsoluteIndex, scrollToBottom, virtualizer]
  );

  const requestJumpToIndex = useCallback(
    (
      index: number,
      align: 'start' | 'center' | 'end' = 'start',
      behavior: ScrollBehavior = 'smooth'
    ) => {
      const intent: ScrollIntent = {
        type: 'jump-to-index',
        index,
        align,
        behavior,
      };
      stateRef.current = setPendingIntent(stateRef.current, intent);
      executeIntent(
        virtualizer,
        intent,
        itemCount,
        scrollToBottom,
        scrollToAbsoluteIndex
      );
      stateRef.current = markIntentApplied(stateRef.current);
    },
    [itemCount, scrollToAbsoluteIndex, scrollToBottom, virtualizer]
  );

  // -------------------------------------------------------------------------
  // Intent execution — runs after React commit + TanStack measurement
  //
  // useLayoutEffect fires synchronously after DOM mutations but before paint,
  // ensuring the virtualizer has measured new items before we scroll.
  // -------------------------------------------------------------------------

  useLayoutEffect(() => {
    const state = stateRef.current;
    const intent = state.pendingIntent;
    if (!intent) return;

    const isImperativeIntent =
      intent.type === 'jump-to-bottom' || intent.type === 'jump-to-index';
    if (!isImperativeIntent && dataVersion === prevDataVersionRef.current) {
      return;
    }

    logConversationScrollIntent('executing', {
      intentType: intent.type,
      itemCount,
      dataVersion,
      previousDataVersion: prevDataVersionRef.current,
      isImperativeIntent,
      virtualizedCount: virtualizer.options.count,
      scrollOffset: virtualizer.scrollOffset ?? null,
      totalSize: virtualizer.getTotalSize(),
    });

    executeIntent(
      virtualizer,
      intent,
      itemCount,
      scrollToBottom,
      scrollToAbsoluteIndex
    );
    stateRef.current = markIntentApplied(stateRef.current);
    prevDataVersionRef.current = dataVersion;
  }, [
    dataVersion,
    itemCount,
    scrollToAbsoluteIndex,
    scrollToBottom,
    virtualizer,
  ]);

  // -------------------------------------------------------------------------
  // Return
  // -------------------------------------------------------------------------

  return {
    onEntriesChanged,
    requestJumpToBottom,
    requestJumpToIndex,
    pendingIntent: stateRef.current.pendingIntent,
  };
}

// ---------------------------------------------------------------------------
// Intent Dispatch (pure function, no hooks)
// ---------------------------------------------------------------------------

/**
 * Execute a scroll intent against the TanStack Virtual virtualizer.
 *
 * Each intent type maps to a specific scrollToIndex configuration:
 *
 * | Intent          | scrollToIndex call                                    |
 * |-----------------|-------------------------------------------------------|
 * | initial-bottom  | last index, align: 'end' (instant, purge sizes)       |
 * | follow-bottom   | last index, align: 'end', behavior from intent        |
 * | preserve-anchor | no-op (shouldAdjustScrollPositionOnItemSizeChange)     |
 * | plan-reveal     | last index, align: 'start'                            |
 * | jump-to-bottom  | last index, align: 'end', behavior from intent        |
 * | jump-to-index   | intent.index, intent.align, intent.behavior           |
 */
function executeIntent(
  virtualizer: Virtualizer<HTMLDivElement, Element>,
  intent: ScrollIntent,
  itemCount: number,
  scrollToBottom: (behavior?: TanStackScrollBehavior) => void,
  scrollToAbsoluteIndex?: (
    index: number,
    align?: TanStackScrollAlign,
    behavior?: TanStackScrollBehavior
  ) => boolean
): void {
  if (itemCount === 0) return;

  const lastIndex = itemCount - 1;
  const virtualizedCount = virtualizer.options.count;

  switch (intent.type) {
    case 'initial-bottom': {
      scrollToBottom('auto');
      break;
    }

    case 'follow-bottom': {
      scrollToBottom(toTanStackBehavior(intent.behavior));
      break;
    }

    case 'preserve-anchor': {
      logConversationScrollIntent('preserve-anchor-noop', {
        itemCount,
        virtualizedCount,
        scrollOffset: virtualizer.scrollOffset ?? null,
        totalSize: virtualizer.getTotalSize(),
      });
      break;
    }

    case 'plan-reveal': {
      if (virtualizedCount === 0 || lastIndex >= virtualizedCount) {
        if (scrollToAbsoluteIndex?.(lastIndex, 'start', 'auto')) {
          break;
        }
        scrollToBottom('auto');
        break;
      }

      virtualizer.scrollToIndex(lastIndex, {
        align: 'start',
        behavior: 'auto',
      });
      break;
    }

    case 'jump-to-bottom': {
      scrollToBottom(toTanStackBehavior(intent.behavior));
      break;
    }

    case 'jump-to-index': {
      if (virtualizedCount === 0) {
        if (
          scrollToAbsoluteIndex?.(
            intent.index,
            intent.align,
            toTanStackBehavior(intent.behavior)
          )
        ) {
          break;
        }
        scrollToBottom(toTanStackBehavior(intent.behavior));
        break;
      }

      if (intent.index >= virtualizedCount) {
        if (
          scrollToAbsoluteIndex?.(
            intent.index,
            intent.align,
            toTanStackBehavior(intent.behavior)
          )
        ) {
          break;
        }
        scrollToBottom(toTanStackBehavior(intent.behavior));
        break;
      }

      virtualizer.scrollToIndex(intent.index, {
        align: intent.align,
        behavior: toTanStackBehavior(intent.behavior),
      });
      break;
    }
  }
}
