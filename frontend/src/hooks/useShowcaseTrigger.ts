import { useState, useEffect, useCallback, useRef } from 'react';
import type { ShowcaseConfig } from '@/types/showcase';
import { useShowcasePersistence } from './useShowcasePersistence';

export interface ShowcaseTriggerOptions {
  enabled: boolean;
  openDelay?: number;
  resetOnDisable?: boolean;
  markSeenOnClose?: boolean;
}

export interface ShowcaseTriggerResult {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  hasSeen: boolean;
}

export function useShowcaseTrigger(
  config: ShowcaseConfig,
  options: ShowcaseTriggerOptions
): ShowcaseTriggerResult {
  const {
    enabled,
    openDelay = 300,
    resetOnDisable = true,
    markSeenOnClose = true,
  } = options;

  const persistence = useShowcasePersistence();
  const [isOpen, setIsOpen] = useState(false);
  const [hasSeenState, setHasSeenState] = useState(false);
  const timerRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  // Keep 'hasSeenState' in sync if id change or config loads
  useEffect(() => {
    if (!persistence.isLoaded) return;
    setHasSeenState(persistence.hasSeen(config.id));
  }, [persistence.isLoaded, config.id, persistence]);

  // Cleanup timers
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  // Handle enabled state changes
  useEffect(() => {
    if (!persistence.isLoaded) return;

    if (enabled) {
      // Only show if not seen
      if (!hasSeenState) {
        // Clear any existing timer
        if (timerRef.current !== null) {
          clearTimeout(timerRef.current);
        }

        // Delay opening to ensure UI is mounted
        timerRef.current = window.setTimeout(() => {
          if (mountedRef.current) {
            setIsOpen(true);
            timerRef.current = null;
          }
        }, openDelay);
      }
    } else {
      // Reset when disabled (if configured)
      if (resetOnDisable) {
        // Clear pending timer
        if (timerRef.current !== null) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        setIsOpen(false);
      }
    }

    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [persistence.isLoaded, enabled, hasSeenState, openDelay, resetOnDisable]);

  const open = useCallback(() => {
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    if (markSeenOnClose) {
      persistence.markSeen(config.id);
      setHasSeenState(true);
    }
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setIsOpen(false);
  }, [config.id, markSeenOnClose, persistence]);

  return { isOpen, open, close, hasSeen: hasSeenState };
}
