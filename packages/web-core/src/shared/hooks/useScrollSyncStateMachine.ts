import { useRef, useCallback } from 'react';

/**
 * State machine for managing bidirectional scroll sync between file tree and diff view.
 *
 * Uses explicit states instead of boolean flags to avoid conflicts between
 * programmatic scrolling and user-initiated scrolling:
 * - Making states explicit (no boolean flags)
 * - Having clear transition rules
 * - Using cooldown period after programmatic scroll
 * - Separating concerns (state machine doesn't do actual scrolling)
 *
 * NOTE: This hook intentionally does NOT trigger React re-renders.
 * State transitions and fileInView updates are written to refs only.
 * The onFileInViewChanged callback is used to push fileInView changes
 * out to external stores (e.g. Zustand) without causing re-renders here.
 */

export type SyncState =
  | 'idle' // Normal operation, sync active
  | 'programmatic-scroll' // File tree click triggered scroll
  | 'user-scrolling' // User is actively scrolling
  | 'sync-cooldown'; // Brief pause after programmatic scroll

export interface ScrollTarget {
  path: string;
  lineNumber?: number;
  index: number;
}

export interface ScrollSyncOptions {
  /** Debounce delay for user scroll events (default: 150ms) */
  debounceDelay?: number;
  /** Cooldown delay after programmatic scroll (default: 200ms) */
  cooldownDelay?: number;
  /** Map from file path to virtuoso index */
  pathToIndex: Map<string, number>;
  /** Function to get file path from virtuoso index */
  indexToPath: (index: number) => string | null;
  /** Callback fired when fileInView changes (write to external store) */
  onFileInViewChanged?: (path: string | null) => void;
}

export interface ScrollSyncResult {
  /** Current state of the sync state machine */
  state: SyncState;
  /** Currently visible file path (updated during idle state) */
  fileInView: string | null;
  /** Current scroll target (set during programmatic-scroll state) */
  scrollTarget: ScrollTarget | null;
  /**
   * Trigger a programmatic scroll to a file.
   * Sets state to 'programmatic-scroll' and returns the target index.
   * Returns null if path not found in pathToIndex map.
   */
  scrollToFile: (path: string, lineNumber?: number) => number | null;
  /**
   * Call when user initiates a scroll (e.g., wheel event, touch).
   * Transitions to 'user-scrolling' state if currently idle.
   */
  onUserScroll: () => void;
  /**
   * Call when virtuoso's rangeChanged fires.
   * Updates fileInView only when in 'idle' or 'user-scrolling' state.
   */
  onRangeChanged: (range: { startIndex: number; endIndex: number }) => void;
  /**
   * Call when programmatic scroll animation completes.
   * Transitions from 'programmatic-scroll' to 'sync-cooldown'.
   */
  onScrollComplete: () => void;
}

const DEFAULT_DEBOUNCE_DELAY = 300;
const DEFAULT_COOLDOWN_DELAY = 200;

export function useScrollSyncStateMachine(
  options: ScrollSyncOptions
): ScrollSyncResult {
  const {
    debounceDelay = DEFAULT_DEBOUNCE_DELAY,
    cooldownDelay = DEFAULT_COOLDOWN_DELAY,
    pathToIndex,
    indexToPath,
    onFileInViewChanged,
  } = options;

  // Use refs for state — no React re-renders on state transitions
  const stateRef = useRef<SyncState>('idle');
  const scrollTargetRef = useRef<ScrollTarget | null>(null);
  const fileInViewRef = useRef<string | null>(null);

  // Timer refs for cleanup
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep callback ref fresh without re-renders
  const onFileInViewChangedRef = useRef(onFileInViewChanged);
  onFileInViewChangedRef.current = onFileInViewChanged;

  const clearTimers = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (cooldownTimerRef.current) {
      clearTimeout(cooldownTimerRef.current);
      cooldownTimerRef.current = null;
    }
  }, []);

  /**
   * Trigger a programmatic scroll to a file.
   * Transition: idle → programmatic-scroll
   */
  const scrollToFile = useCallback(
    (path: string, lineNumber?: number): number | null => {
      const index = pathToIndex.get(path);
      if (index === undefined) {
        return null;
      }

      // Clear any pending timers
      clearTimers();

      // Set scroll target
      scrollTargetRef.current = { path, lineNumber, index };

      // Transition to programmatic-scroll state (ref only, no re-render)
      stateRef.current = 'programmatic-scroll';

      return index;
    },
    [pathToIndex, clearTimers]
  );

  /**
   * Handle user-initiated scroll.
   * Transition: idle → user-scrolling
   */
  const onUserScroll = useCallback(() => {
    const currentState = stateRef.current;

    // Only transition from idle to user-scrolling
    // Ignore during programmatic-scroll or sync-cooldown
    if (currentState !== 'idle') {
      return;
    }

    // Clear any pending debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    stateRef.current = 'user-scrolling';

    // Set up debounce timer to return to idle
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      if (stateRef.current === 'user-scrolling') {
        stateRef.current = 'idle';
      }
    }, debounceDelay);
  }, [debounceDelay]);

  /**
   * Handle virtuoso range changes.
   * Updates fileInView only in idle or user-scrolling states.
   */
  const onRangeChanged = useCallback(
    (range: { startIndex: number; endIndex: number }) => {
      const currentState = stateRef.current;

      // Only update fileInView during idle or user-scrolling
      if (
        currentState === 'programmatic-scroll' ||
        currentState === 'sync-cooldown'
      ) {
        return;
      }

      // Use index-based lookup (no DOM measurement)
      const path = indexToPath(range.startIndex);
      if (path !== null && fileInViewRef.current !== path) {
        fileInViewRef.current = path;
        onFileInViewChangedRef.current?.(path);
      }

      // If user is scrolling, reset the debounce timer
      if (currentState === 'user-scrolling') {
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
        }
        debounceTimerRef.current = setTimeout(() => {
          debounceTimerRef.current = null;
          if (stateRef.current === 'user-scrolling') {
            stateRef.current = 'idle';
          }
        }, debounceDelay);
      }
    },
    [indexToPath, debounceDelay]
  );

  /**
   * Handle programmatic scroll completion.
   * Transition: programmatic-scroll → sync-cooldown → idle
   */
  const onScrollComplete = useCallback(() => {
    const currentState = stateRef.current;

    // Only handle if we're in programmatic-scroll state
    if (currentState !== 'programmatic-scroll') {
      return;
    }

    // Clear scroll target
    scrollTargetRef.current = null;

    // Transition to cooldown (ref only, no re-render)
    stateRef.current = 'sync-cooldown';

    // Set up cooldown timer to return to idle
    cooldownTimerRef.current = setTimeout(() => {
      cooldownTimerRef.current = null;
      if (stateRef.current === 'sync-cooldown') {
        stateRef.current = 'idle';
      }
    }, cooldownDelay);
  }, [cooldownDelay]);

  return {
    state: stateRef.current,
    fileInView: fileInViewRef.current,
    scrollTarget: scrollTargetRef.current,
    scrollToFile,
    onUserScroll,
    onRangeChanged,
    onScrollComplete,
  };
}
