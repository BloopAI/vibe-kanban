import {
  createContext,
  useContext,
  useState,
  useRef,
  ReactNode,
  useCallback,
  useEffect,
} from 'react';

export interface ShortcutConfig {
  keys: string | string[]; // 'c' or ['cmd+k', 'ctrl+k']
  callback: (e: KeyboardEvent) => void;
  description: string; // For help documentation
  group?: string; // 'Dialog', 'Kanban', 'Global'
  scope?: string; // 'global', 'kanban', 'dialog'
  when?: boolean | (() => boolean); // Dynamic enabling
}

export interface RegisteredShortcut extends ShortcutConfig {
  id: string; // Auto-generated unique ID
}

interface KeyboardShortcutsState {
  shortcuts: RegisteredShortcut[];
  register: (config: ShortcutConfig) => () => void; // Returns unregister function
  getShortcutsByScope: (scope?: string) => RegisteredShortcut[];
  getShortcutsByGroup: (group?: string) => RegisteredShortcut[];
}

const KeyboardShortcutsContext = createContext<KeyboardShortcutsState | null>(
  null
);

interface KeyboardShortcutsProviderProps {
  children: ReactNode;
}

export function KeyboardShortcutsProvider({
  children,
}: KeyboardShortcutsProviderProps) {
  const [shortcuts, setShortcuts] = useState<RegisteredShortcut[]>([]);
  const idCounter = useRef(0);
  const shortcutsRef = useRef<RegisteredShortcut[]>([]);

  // Keep ref in sync with state
  useEffect(() => {
    shortcutsRef.current = shortcuts;
  }, [shortcuts]);

  const register = useCallback(
    (config: ShortcutConfig) => {
      const id = `shortcut-${idCounter.current++}`;
      const registeredShortcut: RegisteredShortcut = { ...config, id };

      // Development-only conflict detection using ref to avoid dependency cycle
      if (import.meta.env.DEV) {
        const conflictingShortcut = shortcutsRef.current.find((existing) => {
          const sameScope =
            (existing.scope || 'global') === (config.scope || 'global');
          const sameKeys =
            JSON.stringify(existing.keys) === JSON.stringify(config.keys);
          return sameScope && sameKeys;
        });

        if (conflictingShortcut) {
          console.warn(
            `Keyboard shortcut conflict detected!`,
            `\nExisting: ${conflictingShortcut.description} (${conflictingShortcut.keys})`,
            `\nNew: ${config.description} (${config.keys})`,
            `\nScope: ${config.scope || 'global'}`
          );
        }
      }

      setShortcuts((prev) => [...prev, registeredShortcut]);

      // Return cleanup function
      return () => {
        setShortcuts((prev) => prev.filter((shortcut) => shortcut.id !== id));
      };
    },
    [] // Empty dependencies - function stays stable
  );

  const getShortcutsByScope = useCallback(
    (scope?: string) => {
      const targetScope = scope || 'global';
      return shortcuts.filter(
        (shortcut) => (shortcut.scope || 'global') === targetScope
      );
    },
    [shortcuts]
  );

  const getShortcutsByGroup = useCallback(
    (group?: string) => {
      if (!group) return shortcuts;
      return shortcuts.filter((shortcut) => shortcut.group === group);
    },
    [shortcuts]
  );

  const value: KeyboardShortcutsState = {
    shortcuts,
    register,
    getShortcutsByScope,
    getShortcutsByGroup,
  };

  return (
    <KeyboardShortcutsContext.Provider value={value}>
      {children}
    </KeyboardShortcutsContext.Provider>
  );
}

export function useKeyboardShortcutsRegistry(): KeyboardShortcutsState {
  const context = useContext(KeyboardShortcutsContext);
  if (!context) {
    throw new Error(
      'useKeyboardShortcutsRegistry must be used within a KeyboardShortcutsProvider'
    );
  }
  return context;
}
