import { useEffect, useRef, useCallback } from 'react';
import { useHotkeysContext } from 'react-hotkeys-hook';
import { SequentialBinding, SEQUENCE_FIRST_KEYS, Scope } from './registry';

export interface SequentialHotkeysOptions {
  /** Timeout in ms between key presses (default: 500) */
  timeout?: number;
  /** Whether the hook is enabled */
  enabled?: boolean;
  /** Callback when buffer changes (for UI feedback) */
  onBufferChange?: (buffer: string[]) => void;
  /** Callback when sequence times out without match */
  onTimeout?: (buffer: string[]) => void;
}

export interface SequentialHotkeysConfig {
  /** Sequential bindings to match against */
  bindings: SequentialBinding[];
  /** Callback when a sequence is matched */
  onMatch: (binding: SequentialBinding) => void;
  /** Options for the hook */
  options?: SequentialHotkeysOptions;
}

/**
 * Check if the active element is an input that should block shortcuts
 */
function isInputElement(element: Element | null): boolean {
  if (!element) return false;

  const tagName = element.tagName.toLowerCase();
  if (tagName === 'input' || tagName === 'textarea') {
    return true;
  }

  // Check for contenteditable
  if (element instanceof HTMLElement && element.isContentEditable) {
    return true;
  }

  return false;
}

/**
 * Check if a binding's scopes match the currently enabled scopes
 */
function scopesMatch(
  bindingScopes: Scope[] | undefined,
  activeScopes: string[]
): boolean {
  // If binding has no scopes, it works in any scope
  if (!bindingScopes || bindingScopes.length === 0) {
    return true;
  }

  // Check if any binding scope is in enabled scopes, or '*' is enabled
  return (
    activeScopes.includes('*') ||
    bindingScopes.some((scope) => activeScopes.includes(scope))
  );
}

/**
 * Hook for handling sequential keyboard shortcuts (e.g., "g s" for Go to Settings)
 *
 * Uses capture phase to intercept keys before other handlers.
 * Maintains a key buffer with timeout to detect sequences.
 */
export function useSequentialHotkeys(config: SequentialHotkeysConfig) {
  const { bindings, onMatch, options = {} } = config;
  const {
    timeout = 500,
    enabled = true,
    onBufferChange,
    onTimeout,
  } = options;

  const bufferRef = useRef<string[]>([]);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { activeScopes } = useHotkeysContext();

  const clearBuffer = useCallback(() => {
    bufferRef.current = [];
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    onBufferChange?.([]);
  }, [onBufferChange]);

  useEffect(() => {
    if (!enabled) {
      clearBuffer();
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      // Skip if IME composition is in progress
      if (event.isComposing) {
        return;
      }

      // Skip if modifier keys are pressed (except Shift for uppercase)
      if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }

      // Skip if inside an input element
      if (isInputElement(document.activeElement)) {
        return;
      }

      const key = event.key.toLowerCase();

      // If buffer is empty, only accept valid first keys
      if (bufferRef.current.length === 0) {
        if (!SEQUENCE_FIRST_KEYS.has(key)) {
          return;
        }
      }

      // Clear existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      // Add key to buffer
      bufferRef.current = [...bufferRef.current, key];

      // Trim buffer to max 3 keys to prevent memory issues
      if (bufferRef.current.length > 3) {
        bufferRef.current = bufferRef.current.slice(-3);
      }

      onBufferChange?.(bufferRef.current);

      // Check for matching binding
      const match = bindings.find(
        (binding) =>
          binding.keys.length === bufferRef.current.length &&
          binding.keys.every((k, i) => k === bufferRef.current[i]) &&
          scopesMatch(binding.scopes, activeScopes)
      );

      if (match) {
        // Found a match - prevent default and execute
        event.preventDefault();
        event.stopPropagation();
        clearBuffer();
        onMatch(match);
        return;
      }

      // Check if current buffer could potentially match a longer sequence
      const couldMatch = bindings.some(
        (binding) =>
          binding.keys.length > bufferRef.current.length &&
          bufferRef.current.every((k, i) => binding.keys[i] === k) &&
          scopesMatch(binding.scopes, activeScopes)
      );

      if (couldMatch) {
        // Buffer could lead to a match - prevent first key from triggering single-key shortcuts
        if (bufferRef.current.length === 1) {
          event.preventDefault();
          event.stopPropagation();
        }

        // Set timeout for sequence completion
        timeoutRef.current = setTimeout(() => {
          const timedOutBuffer = [...bufferRef.current];
          clearBuffer();
          onTimeout?.(timedOutBuffer);
        }, timeout);
      } else {
        // No potential match - clear buffer
        clearBuffer();
      }
    };

    // Use capture phase to intercept before other handlers
    document.addEventListener('keydown', handleKeyDown, true);

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [
    enabled,
    bindings,
    activeScopes,
    timeout,
    onMatch,
    onBufferChange,
    onTimeout,
    clearBuffer,
  ]);

  return { clearBuffer };
}
