import { useMemo } from 'react';
import {
  useKeyboardShortcut,
  type KeyboardShortcutOptions,
} from '@/hooks/useKeyboardShortcut';
import { Action, Scope, getKeysFor, getBindingFor } from './registry';

export interface SemanticKeyOptions {
  scope?: Scope;
  enabled?: boolean | (() => boolean);
  when?: boolean | (() => boolean); // Alias for enabled
  enableOnContentEditable?: boolean;
  preventDefault?: boolean;
}

type Handler = (e?: KeyboardEvent) => void;

/**
 * Creates a semantic keyboard shortcut hook for a specific action
 */
export function createSemanticHook<A extends Action>(action: A) {
  return function useSemanticKey(
    handler: Handler,
    options: SemanticKeyOptions = {}
  ) {
    const {
      scope,
      enabled = true,
      when,
      enableOnContentEditable,
      preventDefault,
    } = options;

    // Use 'when' as alias for 'enabled' if provided
    const isEnabled = when !== undefined ? when : enabled;

    // Memoize to get stable array references and prevent unnecessary re-registrations
    const keys = useMemo(() => getKeysFor(action, scope), [action, scope]);

    const binding = useMemo(
      () => getBindingFor(action, scope),
      [action, scope]
    );

    const keyboardShortcutOptions: KeyboardShortcutOptions = {};
    if (enableOnContentEditable !== undefined)
      keyboardShortcutOptions.enableOnContentEditable = enableOnContentEditable;
    if (preventDefault !== undefined)
      keyboardShortcutOptions.preventDefault = preventDefault;

    useKeyboardShortcut(
      {
        keys: keys.length === 1 ? keys[0] : keys,
        callback: keys.length === 0 ? () => {} : handler,
        description: binding?.description || `${action} action`,
        group: binding?.group || 'Actions',
        scope: scope || Scope.GLOBAL,
        when: keys.length > 0 && isEnabled,
      },
      keyboardShortcutOptions
    );

    if (keys.length === 0) {
      console.warn(
        `No key binding found for action ${action} in scope ${scope}`
      );
    }
  };
}
