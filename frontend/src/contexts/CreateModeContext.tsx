import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type {
  Repo,
  ExecutorProfileId,
  RepoWithTargetBranch,
} from 'shared/types';
import { useCreateModeState } from '@/hooks/useCreateModeState';

interface CreateModeContextValue {
  selectedProjectId: string | null;
  setSelectedProjectId: (id: string | null) => void;
  repos: Repo[];
  addRepo: (repo: Repo) => void;
  removeRepo: (repoId: string) => void;
  clearRepos: () => void;
  targetBranches: Record<string, string>;
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
  initialProjectId?: string;
  initialRepos?: RepoWithTargetBranch[];
}

export function CreateModeProvider({
  children,
  initialProjectId,
  initialRepos,
}: CreateModeProviderProps) {
  const state = useCreateModeState({ initialProjectId, initialRepos });

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
