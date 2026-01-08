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
  type ActionVisibilityContext,
  resolveLabel,
} from '@/components/ui-new/actions';
import { getActionLabel } from '@/components/ui-new/actions/useActionVisibility';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';

interface ActionsContextValue {
  // Execute an action with optional workspaceId and context override
  executeAction: (
    action: ActionDefinition,
    workspaceId?: string,
    contextOverride?: Partial<ActionExecutorContext>
  ) => Promise<void>;

  // Get resolved label for an action (supports dynamic labels via visibility context)
  getLabel: (
    action: ActionDefinition,
    workspace?: Workspace,
    ctx?: ActionVisibilityContext
  ) => string;

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
  // Get workspace context (ActionsProvider is nested inside WorkspaceProvider)
  const { selectWorkspace, activeWorkspaces, workspaceId } =
    useWorkspaceContext();

  // Build executor context from hooks
  const executorContext = useMemo<ActionExecutorContext>(
    () => ({
      navigate,
      queryClient,
      selectWorkspace,
      activeWorkspaces,
      currentWorkspaceId: workspaceId,
    }),
    [navigate, queryClient, selectWorkspace, activeWorkspaces, workspaceId]
  );

  // Main action executor with centralized target validation and error handling
  const executeAction = useCallback(
    async (
      action: ActionDefinition,
      workspaceId?: string,
      contextOverride?: Partial<ActionExecutorContext>
    ): Promise<void> => {
      try {
        // Merge context with any overrides (e.g., gitRepoId from GitPanelContainer)
        const ctx = contextOverride
          ? { ...executorContext, ...contextOverride }
          : executorContext;

        if (action.requiresTarget) {
          if (!workspaceId) {
            throw new Error(
              `Action "${action.id}" requires a workspace target`
            );
          }
          await action.execute(ctx, workspaceId);
        } else {
          await action.execute(ctx);
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

  // Get resolved label helper (supports dynamic labels via visibility context)
  const getLabel = useCallback(
    (
      action: ActionDefinition,
      workspace?: Workspace,
      ctx?: ActionVisibilityContext
    ) => {
      if (ctx) {
        return getActionLabel(action, ctx, workspace);
      }
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
