import {
  useContext,
  useCallback,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { createHmrContext } from '@/lib/hmrContext.ts';
import { useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import type { Workspace } from 'shared/types';
import { useOrganizationStore } from '@/stores/useOrganizationStore';
import { ConfirmDialog } from '@/components/ui-new/dialogs/ConfirmDialog';
import { buildIssueCreatePath } from '@/lib/routes/projectSidebarRoutes';
import {
  type ActionDefinition,
  type ActionExecutorContext,
  type ActionVisibilityContext,
  type ProjectMutations,
  ActionTargetType,
  resolveLabel,
} from '@/components/ui-new/actions';
import { getActionLabel } from '@/components/ui-new/actions/useActionVisibility';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { UserContext } from '@/contexts/remote/UserContext';
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

  // Open command bar in priority selection mode
  openPrioritySelection: (
    projectId: string,
    issueIds: string[]
  ) => Promise<void>;

  // Open assignee selection dialog
  openAssigneeSelection: (
    projectId: string,
    issueIds: string[],
    isCreateMode?: boolean
  ) => Promise<void>;

  // Open sub-issue selection in command bar
  openSubIssueSelection: (
    projectId: string,
    parentIssueId: string,
    mode?: 'addChild' | 'setParent'
  ) => Promise<void>;

  // Open workspace selection dialog to link a workspace to an issue
  openWorkspaceSelection: (projectId: string, issueId: string) => Promise<void>;

  // Open relationship selection in command bar
  openRelationshipSelection: (
    projectId: string,
    issueId: string,
    relationshipType: 'blocking' | 'related' | 'has_duplicate',
    direction: 'forward' | 'reverse'
  ) => Promise<void>;

  // Set default status for issue creation based on current kanban tab
  setDefaultCreateStatusId: (statusId: string | undefined) => void;

  // Register project mutations (called by components inside ProjectProvider)
  registerProjectMutations: (mutations: ProjectMutations | null) => void;

  // The executor context (for components that need direct access)
  executorContext: ActionExecutorContext;
}

const ActionsContext = createHmrContext<ActionsContextValue | null>(
  'ActionsContext',
  null
);

interface ActionsProviderProps {
  children: ReactNode;
}

export function ActionsProvider({ children }: ActionsProviderProps) {
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId?: string }>();
  const queryClient = useQueryClient();
  // Get selected organization ID from store (for kanban context)
  const selectedOrgId = useOrganizationStore((s) => s.selectedOrgId);
  // Get workspace context (ActionsProvider is nested inside WorkspaceProvider)
  const { selectWorkspace, activeWorkspaces, workspaceId, workspace } =
    useWorkspaceContext();
  // Get remote workspaces (optional — not available in VSCodeScope)
  const userCtx = useContext(UserContext);

  // Get dev server state
  const { start, stop, runningDevServers } = useDevServer(workspaceId);

  // Default status for issue creation based on current kanban tab
  const [defaultCreateStatusId, setDefaultCreateStatusId] = useState<
    string | undefined
  >();

  // Project mutations state (registered by components inside ProjectProvider)
  const [projectMutations, setProjectMutations] =
    useState<ProjectMutations | null>(null);

  const registerProjectMutations = useCallback(
    (mutations: ProjectMutations | null) => {
      setProjectMutations(mutations);
    },
    []
  );

  // Navigate to create issue mode (URL-based navigation)
  const navigateToCreateIssue = useCallback(
    (options?: { statusId?: string }) => {
      if (!projectId) return;
      navigate(buildIssueCreatePath(projectId, options));
    },
    [navigate, projectId]
  );

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

  // Open status selection dialog (uses dynamic import to avoid circular deps)
  const openStatusSelection = useCallback(
    async (projectId: string, issueIds: string[]) => {
      const { ProjectSelectionDialog } = await import(
        '@/components/ui-new/dialogs/selections/ProjectSelectionDialog'
      );
      await ProjectSelectionDialog.show({
        projectId,
        selection: { type: 'status', issueIds },
      });
    },
    []
  );

  // Open priority selection dialog (uses dynamic import to avoid circular deps)
  const openPrioritySelection = useCallback(
    async (projectId: string, issueIds: string[]) => {
      const { ProjectSelectionDialog } = await import(
        '@/components/ui-new/dialogs/selections/ProjectSelectionDialog'
      );
      await ProjectSelectionDialog.show({
        projectId,
        selection: { type: 'priority', issueIds },
      });
    },
    []
  );

  // Open assignee selection dialog (uses dynamic import to avoid circular deps)
  const openAssigneeSelection = useCallback(
    async (projectId: string, issueIds: string[], isCreateMode = false) => {
      const { AssigneeSelectionDialog } = await import(
        '@/components/ui-new/dialogs/AssigneeSelectionDialog'
      );
      await AssigneeSelectionDialog.show({ projectId, issueIds, isCreateMode });
    },
    []
  );

  // Open sub-issue selection dialog (uses dynamic import to avoid circular deps)
  const openSubIssueSelection = useCallback(
    async (
      projectId: string,
      parentIssueId: string,
      mode: 'addChild' | 'setParent' = 'addChild'
    ) => {
      const { ProjectSelectionDialog } = await import(
        '@/components/ui-new/dialogs/selections/ProjectSelectionDialog'
      );
      await ProjectSelectionDialog.show({
        projectId,
        selection: { type: 'subIssue', parentIssueId, mode },
      });
    },
    []
  );

  // Open workspace selection dialog (uses dynamic import to avoid circular deps)
  const openWorkspaceSelection = useCallback(
    async (projectId: string, issueId: string) => {
      const { WorkspaceSelectionDialog } = await import(
        '@/components/ui-new/dialogs/WorkspaceSelectionDialog'
      );
      await WorkspaceSelectionDialog.show({ projectId, issueId });
    },
    []
  );

  // Open relationship selection dialog (uses dynamic import to avoid circular deps)
  const openRelationshipSelection = useCallback(
    async (
      projectId: string,
      issueId: string,
      relationshipType: 'blocking' | 'related' | 'has_duplicate',
      direction: 'forward' | 'reverse'
    ) => {
      const { ProjectSelectionDialog } = await import(
        '@/components/ui-new/dialogs/selections/ProjectSelectionDialog'
      );
      await ProjectSelectionDialog.show({
        projectId,
        selection: {
          type: 'relationship',
          issueId,
          relationshipType,
          direction,
        },
      });
    },
    []
  );

  // Build executor context from hooks
  const executorContext = useMemo<ActionExecutorContext>(() => {
    return {
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
      openPrioritySelection,
      openAssigneeSelection,
      openSubIssueSelection,
      openWorkspaceSelection,
      openRelationshipSelection,
      navigateToCreateIssue,
      defaultCreateStatusId,
      kanbanOrgId: selectedOrgId ?? undefined,
      kanbanProjectId: projectId,
      projectMutations: projectMutations ?? undefined,
      remoteWorkspaces: userCtx?.workspaces ?? [],
    };
  }, [
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
    openPrioritySelection,
    openAssigneeSelection,
    openSubIssueSelection,
    openWorkspaceSelection,
    openRelationshipSelection,
    navigateToCreateIssue,
    defaultCreateStatusId,
    selectedOrgId,
    projectId,
    projectMutations,
    userCtx?.workspaces,
  ]);

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
      openPrioritySelection,
      openAssigneeSelection,
      openSubIssueSelection,
      openWorkspaceSelection,
      openRelationshipSelection,
      setDefaultCreateStatusId,
      registerProjectMutations,
      executorContext,
    }),
    [
      executeAction,
      getLabel,
      openStatusSelection,
      openPrioritySelection,
      openAssigneeSelection,
      openSubIssueSelection,
      openWorkspaceSelection,
      openRelationshipSelection,
      registerProjectMutations,
      executorContext,
    ]
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
