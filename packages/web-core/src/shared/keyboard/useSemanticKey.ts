import { useMemo } from 'react';
import type { EnableOnFormTags } from '@/shared/keyboard/types';
import { Action, Scope, getKeysFor } from '@/shared/keyboard/registry';
import { useHotkeys } from 'react-hotkeys-hook';
import { isImeConfirmation } from '@vibe/ui/lib/imeComposition';

export interface SemanticKeyOptions {
  scope?: Scope;
  enabled?: boolean | (() => boolean);
  when?: boolean | (() => boolean); // Alias for enabled
  enableOnContentEditable?: boolean;
  enableOnFormTags?: EnableOnFormTags;
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
      enableOnFormTags,
      preventDefault,
    } = options;

    // Use 'when' as alias for 'enabled' if provided
    const isEnabled = when !== undefined ? when : enabled;

    // Memoize to get stable array references and prevent unnecessary re-registrations
    const keys = useMemo(() => getKeysFor(action, scope), [scope]);

    useHotkeys(
      keys,
      (event) => {
        // Skip a key the IME consumed (Japanese, Chinese, Korean input). `isComposing` alone
        // misses Safari, which fires `compositionend` before the confirming keydown — see
        // @vibe/ui/lib/imeComposition.
        if (isImeConfirmation(event)) {
          return;
        }

        if (isEnabled) {
          handler(event);
        }
      },
      {
        enabled,
        enableOnContentEditable,
        enableOnFormTags,
        preventDefault,
        scopes: scope ? [scope] : ['*'],
      },
      [
        keys,
        scope,
        enableOnContentEditable,
        enableOnFormTags,
        preventDefault,
        handler,
        isEnabled,
      ]
    );

    if (keys.length === 0) {
      console.warn(
        `No key binding found for action ${action} in scope ${scope}`
      );
    }
  };
}
