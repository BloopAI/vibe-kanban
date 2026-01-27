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
  ActionTargetType,
  resolveLabel,
} from '@/components/ui-new/actions';
import { getActionLabel } from '@/components/ui-new/actions/useActionVisibility';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { useDevServer } from '@/hooks/useDevServer';
import { useLogsPanel } from '@/contexts/LogsPanelContext';
import { useLogStream } from '@/hooks/useLogStream';

interface ActionsContextValue {
  // Execute an action with optional workspaceId and repoId/projectId
  // For git actions: repoIdOrProjectId is repoId
  // For issue actions: repoIdOrProjectId is projectId, issueIds are required
  executeAction: (
    action: ActionDefinition,
    workspaceId?: string,
    repoIdOrProjectId?: string,
    issueIds?: string[]
  ) => Promise<void>;

  // Get resolved label for an action (supports dynamic labels via visibility context)
  getLabel: (
    action: ActionDefinition,
    workspace?: Workspace,
    ctx?: ActionVisibilityContext
  ) => string;

  // Open command bar in status selection mode
  openStatusSelection: (projectId: string, issueIds: string[]) => Promise<void>;

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
  const { selectWorkspace, activeWorkspaces, workspaceId, workspace } =
    useWorkspaceContext();

  // Get dev server state
  const { start, stop, runningDevServers } = useDevServer(workspaceId);

  // Get logs panel state
  const { logsPanelContent } = useLogsPanel();
  const processId =
    logsPanelContent?.type === 'process' ? logsPanelContent.processId : '';
  const { logs: processLogs } = useLogStream(processId);

  // Compute currentLogs based on content type
  const currentLogs = useMemo(() => {
    if (logsPanelContent?.type === 'tool') {
      return logsPanelContent.content
        .split('\n')
        .map((line) => ({ type: 'STDOUT' as const, content: line }));
    }
    if (logsPanelContent?.type === 'process') {
      return processLogs;
    }
    return null;
  }, [logsPanelContent, processLogs]);

  // Open status selection in command bar (uses dynamic import to avoid circular deps)
  const openStatusSelection = useCallback(
    async (projectId: string, issueIds: string[]) => {
      const { CommandBarDialog } = await import(
        '@/components/ui-new/dialogs/CommandBarDialog'
      );
      await CommandBarDialog.show({
        pendingStatusSelection: { projectId, issueIds },
      });
    },
    []
  );

  // Build executor context from hooks
  const executorContext = useMemo<ActionExecutorContext>(
    () => ({
      navigate,
      queryClient,
      selectWorkspace,
      activeWorkspaces,
      currentWorkspaceId: workspaceId ?? null,
      containerRef: workspace?.container_ref ?? null,
      runningDevServers,
      startDevServer: start,
      stopDevServer: stop,
      currentLogs,
      logsPanelContent,
      openStatusSelection,
    }),
    [
      navigate,
      queryClient,
      selectWorkspace,
      activeWorkspaces,
      workspaceId,
      workspace?.container_ref,
      runningDevServers,
      start,
      stop,
      currentLogs,
      logsPanelContent,
      openStatusSelection,
    ]
  );

  // Main action executor with centralized target validation and error handling
  const executeAction = useCallback(
    async (
      action: ActionDefinition,
      workspaceId?: string,
      repoIdOrProjectId?: string,
      issueIds?: string[]
    ): Promise<void> => {
      try {
        switch (action.requiresTarget) {
          case ActionTargetType.NONE:
            await action.execute(executorContext);
            break;

          case ActionTargetType.WORKSPACE:
            if (!workspaceId) {
              throw new Error(
                `Action "${action.id}" requires a workspace target`
              );
            }
            await action.execute(executorContext, workspaceId);
            break;

          case ActionTargetType.GIT:
            if (!workspaceId || !repoIdOrProjectId) {
              throw new Error(
                `Action "${action.id}" requires both workspace and repository`
              );
            }
            await action.execute(
              executorContext,
              workspaceId,
              repoIdOrProjectId
            );
            break;

          case ActionTargetType.ISSUE:
            if (!repoIdOrProjectId || !issueIds || issueIds.length === 0) {
              throw new Error(
                `Action "${action.id}" requires project and issue selection`
              );
            }
            await action.execute(executorContext, repoIdOrProjectId, issueIds);
            break;
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
      openStatusSelection,
      executorContext,
    }),
    [executeAction, getLabel, openStatusSelection, executorContext]
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
