import { createContext, useContext, ReactNode, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  useWorkspaces,
  type SidebarWorkspace,
} from '@/components/ui-new/hooks/useWorkspaces';
import { useAttempt } from '@/hooks/useAttempt';
import { useAttemptRepo } from '@/hooks/useAttemptRepo';
import { useWorkspaceSessions } from '@/hooks/useWorkspaceSessions';
import type {
  Workspace as ApiWorkspace,
  Session,
  RepoWithTargetBranch,
} from 'shared/types';

interface WorkspaceContextValue {
  workspaceId: string | undefined;
  /** Real workspace data from API */
  workspace: ApiWorkspace | undefined;
  /** Sidebar workspaces (real IDs with mock display fields) */
  sidebarWorkspaces: SidebarWorkspace[];
  /** Archived workspaces for sidebar display */
  archivedSidebarWorkspaces: SidebarWorkspace[];
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
  /** Repos for the current workspace */
  repos: RepoWithTargetBranch[];
  isReposLoading: boolean;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

interface WorkspaceProviderProps {
  children: ReactNode;
  isCreateMode?: boolean;
}

export function WorkspaceProvider({
  children,
  isCreateMode = false,
}: WorkspaceProviderProps) {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const navigate = useNavigate();

  // Fetch sidebar workspaces (real IDs with mock display fields)
  const {
    workspaces: sidebarWorkspaces,
    archivedWorkspaces: archivedSidebarWorkspaces,
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
  } = useWorkspaceSessions(workspaceId, { enabled: !isCreateMode });

  // Fetch repos for the current workspace
  const { repos, isLoading: isReposLoading } = useAttemptRepo(workspaceId, {
    enabled: !isCreateMode,
  });

  const isLoading = isLoadingList || isLoadingWorkspace;

  const selectWorkspace = useMemo(
    () => (id: string) => {
      navigate(`/workspaces/${id}`);
    },
    [navigate]
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
      sidebarWorkspaces,
      archivedSidebarWorkspaces,
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
      repos,
      isReposLoading,
    }),
    [
      workspaceId,
      workspace,
      sidebarWorkspaces,
      archivedSidebarWorkspaces,
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
