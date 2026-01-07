import {
  createContext,
  useContext,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import type { Workspace } from 'shared/types';
import { ConfirmDialog } from '@/components/ui-new/dialogs/ConfirmDialog';
import {
  type ActionDefinition,
  type ActionExecutorContext,
  resolveLabel,
} from '@/components/ui-new/actions';

interface ActionsContextValue {
  // Execute an action with optional workspaceId
  executeAction: (
    action: ActionDefinition,
    workspaceId?: string
  ) => Promise<void>;

  // Get resolved label for an action
  getLabel: (action: ActionDefinition, workspace?: Workspace) => string;

  // The executor context (for components that need direct access)
  executorContext: ActionExecutorContext;
}

const ActionsContext = createContext<ActionsContextValue | null>(null);

interface ActionsProviderProps {
  children: ReactNode;
}

export function ActionsProvider({ children }: ActionsProviderProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Build executor context from hooks
  const executorContext = useMemo<ActionExecutorContext>(
    () => ({
      navigate,
      queryClient,
    }),
    [navigate, queryClient]
  );

  // Main action executor with centralized target validation and error handling
  const executeAction = useCallback(
    async (action: ActionDefinition, workspaceId?: string) => {
      try {
        if (action.requiresTarget) {
          if (!workspaceId) {
            throw new Error(
              `Action "${action.id}" requires a workspace target`
            );
          }
          await action.execute(executorContext, workspaceId);
        } else {
          await action.execute(executorContext);
        }
      } catch (error) {
        // Show error to user via alert dialog
        ConfirmDialog.show({
          title: 'Error',
          message: error instanceof Error ? error.message : 'An error occurred',
          confirmText: 'OK',
          showCancelButton: false,
          variant: 'destructive',
        });
      }
    },
    [executorContext]
  );

  // Get resolved label helper
  const getLabel = useCallback(
    (action: ActionDefinition, workspace?: Workspace) => {
      return resolveLabel(action, workspace);
    },
    []
  );

  const value = useMemo(
    () => ({
      executeAction,
      getLabel,
      executorContext,
    }),
    [executeAction, getLabel, executorContext]
  );

  return (
    <ActionsContext.Provider value={value}>{children}</ActionsContext.Provider>
  );
}

export function useActions(): ActionsContextValue {
  const context = useContext(ActionsContext);
  if (!context) {
    throw new Error('useActions must be used within an ActionsProvider');
  }
  return context;
}
