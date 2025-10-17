import { useState, useEffect, useCallback, useRef } from 'react';
import type { ShowcaseConfig } from '@/types/showcase';
import { hasSeen as hasSeenUtil, markSeen } from '@/utils/showcasePersistence';

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

  const [isOpen, setIsOpen] = useState(false);
  const [hasSeen, setHasSeen] = useState(() =>
    hasSeenUtil(config.id, config.version)
  );
  const timerRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  // Keep 'hasSeen' in sync if id/version change
  useEffect(() => {
    setHasSeen(hasSeenUtil(config.id, config.version));
  }, [config.id, config.version]);

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
    if (enabled) {
      // Only show if not seen
      if (!hasSeen) {
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
  }, [enabled, hasSeen, openDelay, resetOnDisable]);

  const open = useCallback(() => {
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    if (markSeenOnClose) {
      markSeen(config.id, config.version);
      setHasSeen(true);
    }
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setIsOpen(false);
  }, [config.id, config.version, markSeenOnClose]);

  return { isOpen, open, close, hasSeen };
}
