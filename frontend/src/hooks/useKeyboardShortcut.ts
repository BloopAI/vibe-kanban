import { useEffect, useRef } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import {
  useKeyboardShortcutsRegistry,
  type ShortcutConfig,
} from '@/contexts/keyboard-shortcuts-context';
import type { EnableOnFormTags } from '@/keyboard/types';

export interface KeyboardShortcutOptions {
  enableOnContentEditable?: boolean;
  enableOnFormTags?: EnableOnFormTags;
  preventDefault?: boolean;
}

export function useKeyboardShortcut(
  config: ShortcutConfig,
  options: KeyboardShortcutOptions = {}
): void {
  const { register } = useKeyboardShortcutsRegistry();
  const unregisterRef = useRef<(() => void) | null>(null);

  const { keys, callback, when = true, description, group, scope } = config;
  const {
    enableOnContentEditable = false,
    enableOnFormTags,
    preventDefault = false,
  } = options;

  // Keep latest callback/when without forcing re-register
  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const whenRef = useRef(when);
  useEffect(() => {
    whenRef.current = when;
  }, [when]);

  // Register once per identity fields (no direct 'config' usage here)
  useEffect(() => {
    const unregister = register({
      keys,
      description,
      group,
      scope,
      // delegate to latest refs
      callback: (e: KeyboardEvent) => callbackRef.current?.(e as KeyboardEvent),
      when: () => {
        const w = whenRef.current;
        return typeof w === 'function' ? !!w() : !!w;
      },
    });
    unregisterRef.current = unregister;

    return () => {
      unregisterRef.current?.();
      unregisterRef.current = null;
    };
  }, [register, keys, description, group, scope]);

  // Bind the actual keyboard handling
  useHotkeys(
    keys,
    (event) => {
      const w = whenRef.current;
      const enabled = typeof w === 'function' ? !!w() : !!w;
      if (enabled) callbackRef.current?.(event as KeyboardEvent);
    },
    {
      enabled: true, // we gate inside handler via whenRef
      enableOnContentEditable,
      enableOnFormTags,
      preventDefault,
      scopes: scope ? [scope] : ['*'],
    },
    [keys, scope, enableOnContentEditable, enableOnFormTags, preventDefault] // handler uses refs; only rebinding when identity changes
  );
}
