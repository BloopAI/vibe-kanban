import { useRef, useCallback, useEffect } from 'react';

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
  scrollToFile: (path: string, lineNumber?: number) => number | null;
  onUserScroll: () => void;
  onRangeChanged: (range: { startIndex: number; endIndex: number }) => void;
  onScrollComplete: (requestId?: number) => void;
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
  const scrollRequestIdRef = useRef(0);
  const mountedRef = useRef(true);

  // Timer refs for cleanup
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep refs fresh without re-renders
  const onFileInViewChangedRef = useRef(onFileInViewChanged);
  onFileInViewChangedRef.current = onFileInViewChanged;
  const pathToIndexRef = useRef(pathToIndex);
  pathToIndexRef.current = pathToIndex;
  const indexToPathRef = useRef(indexToPath);
  indexToPathRef.current = indexToPath;

  // Cleanup timers on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
    };
  }, []);

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
      const index = pathToIndexRef.current.get(path);
      if (index === undefined) return null;

      clearTimers();
      scrollRequestIdRef.current++;
      scrollTargetRef.current = { path, lineNumber, index };
      stateRef.current = 'programmatic-scroll';

      return scrollRequestIdRef.current;
    },
    [clearTimers]
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
      if (!mountedRef.current) return;
      const currentState = stateRef.current;

      if (
        currentState === 'programmatic-scroll' ||
        currentState === 'sync-cooldown'
      ) {
        return;
      }

      const path = indexToPathRef.current(range.startIndex);
      if (path !== null && fileInViewRef.current !== path) {
        fileInViewRef.current = path;
        onFileInViewChangedRef.current?.(path);
      }

      if (currentState === 'user-scrolling') {
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
        }
        debounceTimerRef.current = setTimeout(() => {
          debounceTimerRef.current = null;
          if (mountedRef.current && stateRef.current === 'user-scrolling') {
            stateRef.current = 'idle';
          }
        }, debounceDelay);
      }
    },
    [debounceDelay]
  );

  /**
   * Handle programmatic scroll completion.
   * Transition: programmatic-scroll → sync-cooldown → idle
   */
  const onScrollComplete = useCallback(
    (requestId?: number) => {
      if (!mountedRef.current) return;
      if (stateRef.current !== 'programmatic-scroll') return;
      if (requestId !== undefined && requestId !== scrollRequestIdRef.current)
        return;

      scrollTargetRef.current = null;
      stateRef.current = 'sync-cooldown';

      cooldownTimerRef.current = setTimeout(() => {
        cooldownTimerRef.current = null;
        if (mountedRef.current && stateRef.current === 'sync-cooldown') {
          stateRef.current = 'idle';
        }
      }, cooldownDelay);
    },
    [cooldownDelay]
  );

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
