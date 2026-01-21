import {
  createContext,
  useContext,
  ReactNode,
  useMemo,
  useCallback,
  useEffect,
} from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  useWorkspaces,
  workspaceSummaryKeys,
  type SidebarWorkspace,
} from '@/components/ui-new/hooks/useWorkspaces';
import { useAttempt } from '@/hooks/useAttempt';
import { useAttemptRepo } from '@/hooks/useAttemptRepo';
import { useWorkspaceSessions } from '@/hooks/useWorkspaceSessions';
import {
  useGitHubComments,
  type NormalizedGitHubComment,
} from '@/hooks/useGitHubComments';
import { useDiffStream } from '@/hooks/useDiffStream';
import { attemptsApi } from '@/lib/api';
import { useDiffViewStore } from '@/stores/useDiffViewStore';
import type {
  Workspace as ApiWorkspace,
  Session,
  RepoWithTargetBranch,
  UnifiedPrComment,
  Diff,
  DiffStats,
} from 'shared/types';

export type { NormalizedGitHubComment } from '@/hooks/useGitHubComments';

interface WorkspaceContextValue {
  workspaceId: string | undefined;
  /** Real workspace data from API */
  workspace: ApiWorkspace | undefined;
  /** Active workspaces for sidebar display */
  activeWorkspaces: SidebarWorkspace[];
  /** Archived workspaces for sidebar display */
  archivedWorkspaces: SidebarWorkspace[];
  isLoading: boolean;
  isCreateMode: boolean;
  selectWorkspace: (id: string) => void;
  navigateToCreate: () => void;
  /** Sessions for the current workspace */
  sessions: Session[];
  selectedSession: Session | undefined;
  selectedSessionId: string | undefined;
  selectSession: (sessionId: string) => void;
  selectLatestSession: () => void;
  isSessionsLoading: boolean;
  /** Whether user is creating a new session */
  isNewSessionMode: boolean;
  /** Enter new session mode */
  startNewSession: () => void;
  /** Repos for the current workspace */
  repos: RepoWithTargetBranch[];
  isReposLoading: boolean;
  /** GitHub PR Comments */
  gitHubComments: UnifiedPrComment[];
  isGitHubCommentsLoading: boolean;
  showGitHubComments: boolean;
  setShowGitHubComments: (show: boolean) => void;
  getGitHubCommentsForFile: (filePath: string) => NormalizedGitHubComment[];
  getGitHubCommentCountForFile: (filePath: string) => number;
  getFilesWithGitHubComments: () => string[];
  getFirstCommentLineForFile: (filePath: string) => number | null;
  /** Diffs for the current workspace */
  diffs: Diff[];
  /** Set of file paths in the diffs */
  diffPaths: Set<string>;
  /** Aggregate diff statistics */
  diffStats: DiffStats;
}

// Exported for optional usage outside WorkspaceProvider (e.g., old UI)
export const WorkspaceContext = createContext<WorkspaceContextValue | null>(
  null
);

interface WorkspaceProviderProps {
  children: ReactNode;
}

export function WorkspaceProvider({ children }: WorkspaceProviderProps) {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  // Derive isCreateMode from URL path instead of prop to allow provider to persist across route changes
  const isCreateMode = location.pathname === '/workspaces/create';

  // Fetch workspaces for sidebar display
  const {
    workspaces: activeWorkspaces,
    archivedWorkspaces,
    isLoading: isLoadingList,
  } = useWorkspaces();

  // Fetch real workspace data for the selected workspace
  const { data: workspace, isLoading: isLoadingWorkspace } = useAttempt(
    workspaceId,
    { enabled: !!workspaceId && !isCreateMode }
  );

  // Fetch sessions for the current workspace
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

  // Fetch repos for the current workspace
  const { repos, isLoading: isReposLoading } = useAttemptRepo(workspaceId, {
    enabled: !isCreateMode,
  });

  // Get first repo ID for PR comments.
  // TODO: Support multiple repos - currently only fetches comments from the primary repo.
  const primaryRepoId = repos[0]?.id;

  // GitHub comments hook (fetching, normalization, and helpers)
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
    enabled: !isCreateMode,
  });

  // Stream diffs for the current workspace
  const { diffs } = useDiffStream(workspaceId ?? null, !isCreateMode);

  const diffPaths = useMemo(
    () =>
      new Set(diffs.map((d) => d.newPath || d.oldPath || '').filter(Boolean)),
    [diffs]
  );

  // Sync diffPaths to store for expand/collapse all functionality
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

  const selectWorkspace = useCallback(
    (id: string) => {
      // Fire-and-forget mark as seen (don't block navigation)
      attemptsApi
        .markSeen(id)
        .then(() => {
          // Invalidate summary cache to refresh unseen indicators
          queryClient.invalidateQueries({ queryKey: workspaceSummaryKeys.all });
        })
        .catch((error) => {
          // Silently fail - this is not critical
          console.warn('Failed to mark workspace as seen:', error);
        });
      navigate(`/workspaces/${id}`);
    },
    [navigate, queryClient]
  );

  const navigateToCreate = useMemo(
    () => () => {
      navigate('/workspaces/create');
    },
    [navigate]
  );

  const value = useMemo(
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
      gitHubComments,
      isGitHubCommentsLoading,
      showGitHubComments,
      setShowGitHubComments,
      getGitHubCommentsForFile,
      getGitHubCommentCountForFile,
      getFilesWithGitHubComments,
      getFirstCommentLineForFile,
      diffs,
      diffPaths,
      diffStats,
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
      gitHubComments,
      isGitHubCommentsLoading,
      showGitHubComments,
      setShowGitHubComments,
      getGitHubCommentsForFile,
      getGitHubCommentCountForFile,
      getFilesWithGitHubComments,
      getFirstCommentLineForFile,
      diffs,
      diffPaths,
      diffStats,
    ]
  );

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspaceContext(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error(
      'useWorkspaceContext must be used within a WorkspaceProvider'
    );
  }
  return context;
}
