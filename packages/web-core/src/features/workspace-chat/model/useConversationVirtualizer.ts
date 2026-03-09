/**
 * Conversation Virtualizer Hook
 *
 * Shared TanStack Virtual configuration for the conversation list.
 * Owns the virtualizer instance, scroll container ref, row-to-virtual-item
 * mapping, and imperative scroll helpers needed by ConversationListContainer.
 *
 * All three shells (local, remote, VS Code) share this through
 * ConversationListContainer — no per-shell duplication.
 *
 * Adopted patterns from T3 audit (docs/t3-pattern-comparison.md):
 * - shouldAdjustScrollPositionOnItemSizeChange for anchor correction
 * - measureElement with ResizeObserver for real DOM measurement
 * - overscan: 8
 * - getItemKey using ConversationRow.semanticKey
 * - estimateSize using SIZE_ESTIMATE_PX[row.estimationHint]
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import {
  useVirtualizer,
  measureElement as defaultMeasureElement,
} from '@tanstack/react-virtual';
import type { Virtualizer, VirtualItem } from '@tanstack/react-virtual';

import {
  type ConversationRow,
  SIZE_ESTIMATE_PX,
  estimateSizeForRow,
  findPreviousUserMessageIndex,
} from './conversation-row-model';
import {
  NEAR_BOTTOM_THRESHOLD_PX,
  isNearBottom,
} from './conversation-scroll-commands';

// TanStack Virtual's ScrollBehavior ('auto' | 'smooth' | 'instant') shadows
// the DOM ScrollBehavior. Use a narrow type to avoid TS2322 mismatches.
type ScrollToOptionsBehavior = 'auto' | 'smooth';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Number of items to render beyond the visible area in each direction. */
const OVERSCAN = 8;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConversationVirtualizerOptions {
  /** The semantic row model driving the list. */
  rows: ConversationRow[];

  /** Ref to the scrollable container element. */
  scrollContainerRef: RefObject<HTMLDivElement | null>;

  /**
   * Called when the at-bottom state changes. Shells use this to show/hide
   * the scroll-to-bottom affordance. Mirrors the Virtuoso `onAtBottomChange`
   * contract so shells don't need to change when Task 12 removes Virtuoso.
   */
  onAtBottomChange?: (atBottom: boolean) => void;
}

export interface ConversationVirtualizerResult {
  /** The TanStack Virtual virtualizer instance. */
  virtualizer: Virtualizer<HTMLDivElement, Element>;

  /** Virtual items currently in the render window (including overscan). */
  virtualItems: VirtualItem[];

  /** Total pixel size of all items (for the scroll spacer). */
  totalSize: number;

  /**
   * Ref callback for row DOM elements. Attach to each rendered row's
   * container element alongside `data-index={virtualItem.index}`.
   * TanStack Virtual uses this to measure real DOM heights and attach
   * a ResizeObserver for automatic re-measurement on size changes.
   */
  measureElement: (node: Element | null) => void;

  /** Scroll to the absolute bottom of the list. */
  scrollToBottom: (behavior?: ScrollToOptionsBehavior) => void;

  /** Scroll to a specific row index. */
  scrollToIndex: (
    index: number,
    options?: {
      align?: 'start' | 'center' | 'end';
      behavior?: ScrollToOptionsBehavior;
    }
  ) => void;

  /**
   * Scroll to the previous user message relative to the first visible item.
   * Returns true if a target was found and scrolled to, false otherwise.
   */
  scrollToPreviousUserMessage: () => boolean;

  /**
   * Whether the scroll container is currently near the bottom.
   * Reactive — updates via scroll event listener, not just point-in-time.
   */
  isAtBottom: boolean;

  /** Point-in-time check (non-reactive). Reads DOM directly. */
  checkIsAtBottom: () => boolean;

  /**
   * Look up the ConversationRow index for a given virtual item.
   * Since our virtualizer uses identity mapping (no lane reordering),
   * this is simply `virtualItem.index`.
   */
  rowIndexForVirtualItem: (item: VirtualItem) => number;

  /**
   * Look up the ConversationRow for a given virtual item.
   * Returns undefined if the index is out of bounds.
   */
  rowForVirtualItem: (item: VirtualItem) => ConversationRow | undefined;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Configure and return a TanStack Virtual virtualizer for the conversation list.
 *
 * This hook is the single source of virtualizer configuration. It is consumed
 * by `ConversationListContainer` and must not be duplicated across shells.
 */
export function useConversationVirtualizer({
  rows,
  scrollContainerRef,
  onAtBottomChange,
}: ConversationVirtualizerOptions): ConversationVirtualizerResult {
  // -------------------------------------------------------------------------
  // Virtualizer instance
  // -------------------------------------------------------------------------

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: (index) => {
      const row = rows[index];
      if (!row) return SIZE_ESTIMATE_PX.medium;
      const containerWidth = scrollContainerRef.current?.clientWidth ?? null;
      return estimateSizeForRow(row, containerWidth);
    },
    getItemKey: (index) => {
      const row = rows[index];
      return row ? row.semanticKey : index;
    },
    overscan: OVERSCAN,
    measureElement: defaultMeasureElement,
    useAnimationFrameWithResizeObserver: true,
  });

  // -------------------------------------------------------------------------
  // shouldAdjustScrollPositionOnItemSizeChange (ADOPTED from T3)
  //
  // When an item above the viewport changes size (e.g., diff expansion,
  // aggregation compaction), adjust scroll position to keep the reading
  // position stable — UNLESS the user is near the bottom, where anchor
  // correction would fight against follow-bottom behaviour.
  // -------------------------------------------------------------------------

  useEffect(() => {
    virtualizer.shouldAdjustScrollPositionOnItemSizeChange = (
      _item,
      _delta,
      instance
    ) => {
      const viewportHeight = instance.scrollRect?.height ?? 0;
      const scrollOffset = instance.scrollOffset ?? 0;
      const remainingDistance =
        instance.getTotalSize() - (scrollOffset + viewportHeight);
      return remainingDistance > NEAR_BOTTOM_THRESHOLD_PX;
    };

    return () => {
      virtualizer.shouldAdjustScrollPositionOnItemSizeChange = undefined;
    };
  }, [virtualizer]);

  // -------------------------------------------------------------------------
  // Container resize invalidation
  //
  // Width change → text wrapping changes → all row heights stale.
  // virtualizer.measure() invalidates cached sizes so rows re-measure.
  // -------------------------------------------------------------------------

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    let lastWidth = el.clientWidth;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const newWidth = Math.round(
          entry.contentBoxSize?.[0]?.inlineSize ?? el.clientWidth
        );
        if (newWidth !== lastWidth) {
          lastWidth = newWidth;
          virtualizer.measure();
        }
      }
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, [scrollContainerRef, virtualizer]);

  // -------------------------------------------------------------------------
  // Reactive isAtBottom state
  // -------------------------------------------------------------------------

  const [isAtBottomState, setIsAtBottomState] = useState(true);
  const onAtBottomChangeRef = useRef(onAtBottomChange);
  onAtBottomChangeRef.current = onAtBottomChange;

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    let lastValue = true;

    const handleScroll = () => {
      const atBottom = isNearBottom(
        el.scrollTop,
        el.clientHeight,
        el.scrollHeight
      );
      if (atBottom !== lastValue) {
        lastValue = atBottom;
        setIsAtBottomState(atBottom);
        onAtBottomChangeRef.current?.(atBottom);
      }
    };

    el.addEventListener('scroll', handleScroll, { passive: true });
    // Check initial state
    handleScroll();

    return () => {
      el.removeEventListener('scroll', handleScroll);
    };
  }, [scrollContainerRef]);

  // -------------------------------------------------------------------------
  // Derived state
  // -------------------------------------------------------------------------

  const virtualItems = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  // -------------------------------------------------------------------------
  // Imperative helpers
  // -------------------------------------------------------------------------

  const scrollToBottom = useCallback(
    (behavior: ScrollToOptionsBehavior = 'smooth') => {
      if (rows.length === 0) return;
      virtualizer.scrollToIndex(rows.length - 1, {
        align: 'end',
        behavior,
      });
    },
    [virtualizer, rows.length]
  );

  const scrollToIndex = useCallback(
    (
      index: number,
      options?: {
        align?: 'start' | 'center' | 'end';
        behavior?: ScrollToOptionsBehavior;
      }
    ) => {
      virtualizer.scrollToIndex(index, {
        align: options?.align ?? 'start',
        behavior: options?.behavior ?? 'smooth',
      });
    },
    [virtualizer]
  );

  const scrollToPreviousUserMessage = useCallback((): boolean => {
    const items = virtualizer.getVirtualItems();
    if (items.length === 0 || rows.length === 0) return false;

    // The first visible virtual item's index is the scan start point
    const firstVisibleIndex = items[0].index;
    const targetIndex = findPreviousUserMessageIndex(rows, firstVisibleIndex);

    if (targetIndex < 0) return false;

    virtualizer.scrollToIndex(targetIndex, {
      align: 'start',
      behavior: 'smooth',
    });
    return true;
  }, [virtualizer, rows]);

  const checkIsAtBottom = useCallback((): boolean => {
    const el = scrollContainerRef.current;
    if (!el) return true;
    return isNearBottom(el.scrollTop, el.clientHeight, el.scrollHeight);
  }, [scrollContainerRef]);

  // -------------------------------------------------------------------------
  // Row ↔ VirtualItem mapping
  // -------------------------------------------------------------------------

  const rowIndexForVirtualItem = useCallback(
    (item: VirtualItem): number => item.index,
    []
  );

  const rowForVirtualItem = useCallback(
    (item: VirtualItem): ConversationRow | undefined => rows[item.index],
    [rows]
  );

  // -------------------------------------------------------------------------
  // Return
  // -------------------------------------------------------------------------

  return {
    virtualizer,
    virtualItems,
    totalSize,
    measureElement: virtualizer.measureElement,
    scrollToBottom,
    scrollToIndex,
    scrollToPreviousUserMessage,
    isAtBottom: isAtBottomState,
    checkIsAtBottom,
    rowIndexForVirtualItem,
    rowForVirtualItem,
  };
}
