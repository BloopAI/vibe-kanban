import { useContext, useMemo, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createHmrContext } from '@/lib/hmrContext.ts';
import type { Repo, ExecutorProfileId } from 'shared/types';
import {
  useCreateModeState,
  type CreateModeInitialState,
} from '@/hooks/useCreateModeState';
import { useWorkspaces } from '@/components/ui-new/hooks/useWorkspaces';
import { useTask } from '@/hooks/useTask';
import { useAttemptRepo } from '@/hooks/useAttemptRepo';
import { repoApi } from '@/lib/api';

interface LinkedIssue {
  issueId: string;
  simpleId?: string;
  title?: string;
  remoteProjectId: string;
}

interface CreateModeContextValue {
  selectedProjectId: string | null;
  setSelectedProjectId: (id: string | null) => void;
  repos: Repo[];
  addRepo: (repo: Repo) => void;
  removeRepo: (repoId: string) => void;
  clearRepos: () => void;
  targetBranches: Record<string, string | null>;
  setTargetBranch: (repoId: string, branch: string) => void;
  selectedProfile: ExecutorProfileId | null;
  setSelectedProfile: (profile: ExecutorProfileId | null) => void;
  message: string;
  setMessage: (message: string) => void;
  clearDraft: () => Promise<void>;
  /** Whether the initial value has been applied from scratch */
  hasInitialValue: boolean;
  /** Issue to link the workspace to when created */
  linkedIssue: LinkedIssue | null;
  /** Clear the linked issue */
  clearLinkedIssue: () => void;
}

const CreateModeContext = createHmrContext<CreateModeContextValue | null>(
  'CreateModeContext',
  null
);

interface CreateModeProviderProps {
  children: ReactNode;
  initialState?: CreateModeInitialState | null;
  draftId?: string | null;
}

export function CreateModeProvider({
  children,
  initialState,
  draftId,
}: CreateModeProviderProps) {
  // Fetch most recent workspace to use as initial values
  const { workspaces: activeWorkspaces, archivedWorkspaces } = useWorkspaces();
  const mostRecentWorkspace = activeWorkspaces[0] ?? archivedWorkspaces[0];

  const { data: lastWorkspaceTask } = useTask(mostRecentWorkspace?.taskId, {
    enabled: !!mostRecentWorkspace?.taskId,
  });

  // Primary source: repos from the most recent workspace
  const { repos: lastWorkspaceRepos, isLoading: workspaceReposLoading } =
    useAttemptRepo(mostRecentWorkspace?.id, {
      enabled: !!mostRecentWorkspace?.id,
    });

  // Fallback: recently-used repos from the server (for new users with no workspaces)
  const hasWorkspace = !!mostRecentWorkspace;
  const { data: recentRepos, isLoading: recentReposLoading } = useQuery({
    queryKey: ['recentReposForCreate'],
    queryFn: () => repoApi.listRecent(),
    enabled: !hasWorkspace,
  });

  const reposLoading = hasWorkspace
    ? workspaceReposLoading
    : recentReposLoading;

  const initialRepos = useMemo(() => {
    // Use last workspace repos if available
    if (hasWorkspace) return lastWorkspaceRepos;
    // Fall back to first recent repo for new users
    if (!recentRepos || recentRepos.length === 0) return [];
    const repo = recentRepos[0];
    return [{ ...repo, target_branch: '' }];
  }, [hasWorkspace, lastWorkspaceRepos, recentRepos]);

  const state = useCreateModeState({
    initialProjectId: lastWorkspaceTask?.project_id,
    // Pass undefined while loading to prevent premature initialization
    initialRepos: reposLoading ? undefined : initialRepos,
    initialState,
    draftId,
  });

  const value = useMemo<CreateModeContextValue>(
    () => ({
      selectedProjectId: state.selectedProjectId,
      setSelectedProjectId: state.setSelectedProjectId,
      repos: state.repos,
      addRepo: state.addRepo,
      removeRepo: state.removeRepo,
      clearRepos: state.clearRepos,
      targetBranches: state.targetBranches,
      setTargetBranch: state.setTargetBranch,
      selectedProfile: state.selectedProfile,
      setSelectedProfile: state.setSelectedProfile,
      message: state.message,
      setMessage: state.setMessage,
      clearDraft: state.clearDraft,
      hasInitialValue: state.hasInitialValue,
      linkedIssue: state.linkedIssue,
      clearLinkedIssue: state.clearLinkedIssue,
    }),
    [
      state.selectedProjectId,
      state.setSelectedProjectId,
      state.repos,
      state.addRepo,
      state.removeRepo,
      state.clearRepos,
      state.targetBranches,
      state.setTargetBranch,
      state.selectedProfile,
      state.setSelectedProfile,
      state.message,
      state.setMessage,
      state.clearDraft,
      state.hasInitialValue,
      state.linkedIssue,
      state.clearLinkedIssue,
    ]
  );

  return (
    <CreateModeContext.Provider value={value}>
      {children}
    </CreateModeContext.Provider>
  );
}

export function useCreateMode() {
  const context = useContext(CreateModeContext);
  if (!context) {
    throw new Error('useCreateMode must be used within a CreateModeProvider');
  }
  return context;
}
