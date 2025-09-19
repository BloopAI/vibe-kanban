import { useEffect, useRef } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import {
  useKeyboardShortcutsRegistry,
  type ShortcutConfig,
} from '@/contexts/keyboard-shortcuts-context';

export interface KeyboardShortcutOptions {
  enableOnFormTags?: boolean;
  enableOnContentEditable?: boolean;
}

/**
 * Hook for registering keyboard shortcuts with central registry
 *
 * For multiple shortcuts, call this hook multiple times or use a wrapper component.
 * This keeps the hook simple and follows React's rules of hooks.
 *
 * @param config Single shortcut config
 * @param options Optional settings for react-hotkeys-hook
 *
 * @example
 * // Standard shortcut (disabled in form fields)
 * useKeyboardShortcut({
 *   keys: 'c',
 *   callback: createTask,
 *   description: 'Create new task',
 *   group: 'Kanban'
 * });
 *
 * @example
 * // Dialog shortcut (works even in form fields)
 * useKeyboardShortcut({
 *   keys: 'esc',
 *   callback: handleEsc,
 *   description: 'Close dialog',
 *   group: 'Dialog'
 * }, { enableOnFormTags: true });
 */
export function useKeyboardShortcut(
  config: ShortcutConfig,
  options: KeyboardShortcutOptions = {}
): void {
  const { register } = useKeyboardShortcutsRegistry();
  const unregisterRef = useRef<(() => void) | null>(null);

  const { keys, callback, when = true } = config;
  const { enableOnFormTags = false, enableOnContentEditable = false } = options;

  // Register with central registry
  useEffect(() => {
    const unregister = register(config);
    unregisterRef.current = unregister;

    return () => {
      if (unregisterRef.current) {
        unregisterRef.current();
        unregisterRef.current = null;
      }
    };
  }, [
    register,
    JSON.stringify({
      keys: config.keys,
      description: config.description,
      group: config.group,
      scope: config.scope,
    }),
  ]);

  // Bind the actual keyboard handling
  useHotkeys(
    keys,
    (event) => {
      // Check dynamic enabling condition
      const enabled = typeof when === 'function' ? when() : when;
      if (enabled) {
        callback(event);
      }
    },
    {
      enabled: typeof when === 'function' ? when() : when,
      enableOnFormTags,
      enableOnContentEditable,
      scopes: config.scope ? [config.scope] : ['*'], // Use react-hotkeys-hook's official scopes
    },
    [callback, typeof when === 'function' ? when : when]
  );
}
