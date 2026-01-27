import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { Repo, ExecutorProfileId } from 'shared/types';
import { useCreateModeState } from '@/hooks/useCreateModeState';
import { useWorkspaces } from '@/components/ui-new/hooks/useWorkspaces';
import { useTask } from '@/hooks/useTask';
import { useAttemptRepo } from '@/hooks/useAttemptRepo';

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
}

const CreateModeContext = createContext<CreateModeContextValue | null>(null);

interface CreateModeProviderProps {
  children: ReactNode;
}

export function CreateModeProvider({ children }: CreateModeProviderProps) {
  // Fetch most recent workspace to use as initial values
  const { workspaces: activeWorkspaces, archivedWorkspaces } = useWorkspaces();
  const mostRecentWorkspace = activeWorkspaces[0] ?? archivedWorkspaces[0];

  const { data: lastWorkspaceTask } = useTask(mostRecentWorkspace?.taskId, {
    enabled: !!mostRecentWorkspace?.taskId,
  });

  const { repos: lastWorkspaceRepos, isLoading: reposLoading } = useAttemptRepo(
    mostRecentWorkspace?.id,
    {
      enabled: !!mostRecentWorkspace?.id,
    }
  );

  const state = useCreateModeState({
    initialProjectId: lastWorkspaceTask?.project_id,
    // Pass undefined while loading to prevent premature initialization
    initialRepos: reposLoading ? undefined : lastWorkspaceRepos,
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
