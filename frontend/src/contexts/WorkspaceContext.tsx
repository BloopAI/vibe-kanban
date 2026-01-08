import {
  createContext,
  useContext,
  ReactNode,
  useMemo,
  useCallback,
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
import { attemptsApi } from '@/lib/api';
import type {
  Workspace as ApiWorkspace,
  Session,
  RepoWithTargetBranch,
} from 'shared/types';

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
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

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
