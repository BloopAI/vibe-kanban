import { ReactNode, useMemo, useCallback, useEffect } from 'react';
import { useParams } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useWorkspaces } from '@/shared/hooks/useWorkspaces';
import { workspaceSummaryKeys } from '@/shared/hooks/workspaceSummaryKeys';
import { useWorkspaceRecord } from '@/shared/hooks/useWorkspaceRecord';
import { useWorkspaceRepo } from '@/shared/hooks/useWorkspaceRepo';
import { useWorkspaceSessions } from '@/shared/hooks/useWorkspaceSessions';
import { useGitHubComments } from '@/shared/hooks/useGitHubComments';
import { useDiffStream } from '@/shared/hooks/useDiffStream';
import { workspacesApi } from '@/shared/lib/api';
import { useDiffViewStore } from '@/shared/stores/useDiffViewStore';
import type { DiffStats } from 'shared/types';
import { useAppNavigation } from '@/shared/hooks/useAppNavigation';
import { useCurrentAppDestination } from '@/shared/hooks/useCurrentAppDestination';

import {
  WorkspaceContext,
  WorkspaceDiffContext,
} from '@/shared/hooks/useWorkspaceContext';

interface WorkspaceProviderProps {
  children: ReactNode;
}

export function WorkspaceProvider({ children }: WorkspaceProviderProps) {
  const { workspaceId } = useParams({ strict: false });
  const appNavigation = useAppNavigation();
  const currentDestination = useCurrentAppDestination();
  const queryClient = useQueryClient();

  const isCreateMode = currentDestination?.kind === 'workspaces-create';

  const {
    workspaces: activeWorkspaces,
    archivedWorkspaces,
    isLoading: isLoadingList,
  } = useWorkspaces();

  const { data: workspace, isLoading: isLoadingWorkspace } = useWorkspaceRecord(
    workspaceId,
    { enabled: !!workspaceId && !isCreateMode }
  );

  const {
    sessions,
    selectedSession,
    selectedSessionId,
    selectSession,
    selectLatestSession,
    isLoading: isSessionsLoading,
    isNewSessionMode,
    startNewSession,
  } = useWorkspaceSessions(workspaceId, { enabled: !isCreateMode });

  const { repos, isLoading: isReposLoading } = useWorkspaceRepo(workspaceId, {
    enabled: !isCreateMode,
  });

  // TODO: Support multiple repos - currently only fetches comments from the primary repo.
  const primaryRepoId = repos[0]?.id;

  const currentWorkspaceSummary = activeWorkspaces.find(
    (w) => w.id === workspaceId
  );
  const hasPrAttached = !!currentWorkspaceSummary?.prStatus;

  const {
    gitHubComments,
    isGitHubCommentsLoading,
    showGitHubComments,
    setShowGitHubComments,
    getGitHubCommentsForFile,
    getGitHubCommentCountForFile,
    getFilesWithGitHubComments,
    getFirstCommentLineForFile,
  } = useGitHubComments({
    workspaceId,
    repoId: primaryRepoId,
    enabled: !isCreateMode && hasPrAttached,
  });

  const { diffs } = useDiffStream(workspaceId ?? null, !isCreateMode);

  const diffPaths = useMemo(
    () =>
      new Set(diffs.map((d) => d.newPath || d.oldPath || '').filter(Boolean)),
    [diffs]
  );

  useEffect(() => {
    useDiffViewStore.getState().setDiffPaths(Array.from(diffPaths));
    return () => useDiffViewStore.getState().setDiffPaths([]);
  }, [diffPaths]);

  const diffStats: DiffStats = useMemo(
    () => ({
      files_changed: diffs.length,
      lines_added: diffs.reduce((sum, d) => sum + (d.additions ?? 0), 0),
      lines_removed: diffs.reduce((sum, d) => sum + (d.deletions ?? 0), 0),
    }),
    [diffs]
  );

  const isLoading = isLoadingList || isLoadingWorkspace;

  useEffect(() => {
    if (!workspaceId || isCreateMode) return;

    workspacesApi
      .markSeen(workspaceId)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: workspaceSummaryKeys.all });
      })
      .catch((error) => {
        console.warn('Failed to mark workspace as seen:', error);
      });
  }, [workspaceId, isCreateMode, queryClient]);

  const selectWorkspace = useCallback(
    (id: string) => {
      appNavigation.goToWorkspace(id);
    },
    [appNavigation]
  );

  const navigateToCreate = useMemo(
    () => () => {
      appNavigation.goToWorkspacesCreate();
    },
    [appNavigation]
  );

  const coreValue = useMemo(
    () => ({
      workspaceId,
      workspace,
      activeWorkspaces,
      archivedWorkspaces,
      isLoading,
      isCreateMode,
      selectWorkspace,
      navigateToCreate,
      sessions,
      selectedSession,
      selectedSessionId,
      selectSession,
      selectLatestSession,
      isSessionsLoading,
      isNewSessionMode,
      startNewSession,
      repos,
      isReposLoading,
    }),
    [
      workspaceId,
      workspace,
      activeWorkspaces,
      archivedWorkspaces,
      isLoading,
      isCreateMode,
      selectWorkspace,
      navigateToCreate,
      sessions,
      selectedSession,
      selectedSessionId,
      selectSession,
      selectLatestSession,
      isSessionsLoading,
      isNewSessionMode,
      startNewSession,
      repos,
      isReposLoading,
    ]
  );

  const diffValue = useMemo(
    () => ({
      diffs,
      diffPaths,
      diffStats,
      gitHubComments,
      isGitHubCommentsLoading,
      showGitHubComments,
      setShowGitHubComments,
      getGitHubCommentsForFile,
      getGitHubCommentCountForFile,
      getFilesWithGitHubComments,
      getFirstCommentLineForFile,
    }),
    [
      diffs,
      diffPaths,
      diffStats,
      gitHubComments,
      isGitHubCommentsLoading,
      showGitHubComments,
      setShowGitHubComments,
      getGitHubCommentsForFile,
      getGitHubCommentCountForFile,
      getFilesWithGitHubComments,
      getFirstCommentLineForFile,
    ]
  );

  return (
    <WorkspaceContext.Provider value={coreValue}>
      <WorkspaceDiffContext.Provider value={diffValue}>
        {children}
      </WorkspaceDiffContext.Provider>
    </WorkspaceContext.Provider>
  );
}
