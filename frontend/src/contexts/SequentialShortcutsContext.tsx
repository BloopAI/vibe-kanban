import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react';
import { useSequentialHotkeys } from '@/keyboard/useSequentialHotkeys';
import {
  sequentialBindings,
  type SequentialBinding,
} from '@/keyboard/registry';
import { useActions } from '@/contexts/ActionsContext';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import {
  Actions,
  type ActionDefinition,
  type GitActionDefinition,
} from '@/components/ui-new/actions';
import { CommandBarDialog } from '@/components/ui-new/dialogs/CommandBarDialog';

interface SequentialShortcutsContextValue {
  /** Current key buffer (e.g., ['g'] while waiting for next key) */
  buffer: string[];
  /** Whether a sequence is currently being typed */
  isSequenceActive: boolean;
  /** Whether the last sequence was invalid (timed out without match) */
  isInvalidSequence: boolean;
  /** Manually clear the buffer */
  clearBuffer: () => void;
}

const SequentialShortcutsContext =
  createContext<SequentialShortcutsContextValue | null>(null);

// Build ACTION_MAP at module load: Map action IDs to action definitions
const ACTION_MAP = new Map<string, ActionDefinition>(
  Object.values(Actions).map((action) => [action.id, action])
);

interface SequentialShortcutsProviderProps {
  children: ReactNode;
  enabled?: boolean;
}

export function SequentialShortcutsProvider({
  children,
  enabled = true,
}: SequentialShortcutsProviderProps) {
  const [buffer, setBuffer] = useState<string[]>([]);
  const [isInvalidSequence, setIsInvalidSequence] = useState(false);
  const { executeAction } = useActions();
  const { workspaceId, repos } = useWorkspaceContext();

  // Clear invalid state after brief display (300ms flash)
  useEffect(() => {
    if (isInvalidSequence) {
      const timer = setTimeout(() => setIsInvalidSequence(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isInvalidSequence]);

  const handleMatch = useCallback(
    (binding: SequentialBinding) => {
      const action = ACTION_MAP.get(binding.actionId);
      if (!action) {
        console.warn(
          `[SequentialShortcuts] No action found for binding: ${binding.actionId}`
        );
        return;
      }

      // Handle git actions (require repo)
      if (action.requiresTarget === 'git') {
        if (!workspaceId) {
          console.warn(
            `[SequentialShortcuts] Git action "${action.id}" requires workspace`
          );
          return;
        }

        if (repos.length === 0) {
          console.warn(
            `[SequentialShortcuts] Git action "${action.id}" requires repos`
          );
          return;
        }

        if (repos.length === 1) {
          // Single repo - use it directly
          executeAction(action, workspaceId, repos[0].id);
        } else {
          // Multiple repos - open command bar in repo selection mode
          CommandBarDialog.show({
            pendingGitAction: action as GitActionDefinition,
          });
        }
        return;
      }

      // Handle workspace actions
      if (action.requiresTarget === true) {
        if (!workspaceId) {
          console.warn(
            `[SequentialShortcuts] Workspace action "${action.id}" requires workspace`
          );
          return;
        }
        executeAction(action, workspaceId);
        return;
      }

      // Handle global actions
      executeAction(action);
    },
    [executeAction, workspaceId, repos]
  );

  const handleBufferChange = useCallback((newBuffer: string[]) => {
    setBuffer(newBuffer);
  }, []);

  // Handle invalid sequences (no match found when buffer times out)
  const handleTimeout = useCallback(() => {
    setIsInvalidSequence(true);
  }, []);

  const { clearBuffer } = useSequentialHotkeys({
    bindings: sequentialBindings,
    onMatch: handleMatch,
    options: {
      enabled,
      onBufferChange: handleBufferChange,
      onTimeout: handleTimeout,
    },
  });

  return (
    <SequentialShortcutsContext.Provider
      value={{
        buffer,
        isSequenceActive: buffer.length > 0,
        isInvalidSequence,
        clearBuffer,
      }}
    >
      {children}
    </SequentialShortcutsContext.Provider>
  );
}

export function useSequentialShortcuts(): SequentialShortcutsContextValue {
  const context = useContext(SequentialShortcutsContext);
  if (!context) {
    throw new Error(
      'useSequentialShortcuts must be used within SequentialShortcutsProvider'
    );
  }
  return context;
}
