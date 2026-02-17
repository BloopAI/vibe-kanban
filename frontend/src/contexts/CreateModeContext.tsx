import { useContext, useMemo, type ReactNode } from 'react';
import { createHmrContext } from '@/lib/hmrContext.ts';
import type { Repo } from 'shared/types';
import {
  useCreateModeState,
  type CreateModeInitialState,
} from '@/hooks/useCreateModeState';
import { useWorkspaces } from '@/components/ui-new/hooks/useWorkspaces';
import { useUserContext } from '@/contexts/remote/UserContext';
import { useTask } from '@/hooks/useTask';

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
  // Fetch most recent workspace to seed project selection only
  const {
    workspaces: activeWorkspaces,
    archivedWorkspaces,
    isLoading: localWorkspacesLoading,
  } = useWorkspaces();
  const { workspaces: remoteWorkspaces, isLoading: remoteWorkspacesLoading } =
    useUserContext();
  const mostRecentWorkspace = activeWorkspaces[0] ?? archivedWorkspaces[0];
  const localWorkspaceIds = useMemo(
    () =>
      new Set([
        ...activeWorkspaces.map((workspace) => workspace.id),
        ...archivedWorkspaces.map((workspace) => workspace.id),
      ]),
    [activeWorkspaces, archivedWorkspaces]
  );

  const { data: lastWorkspaceTask } = useTask(mostRecentWorkspace?.taskId, {
    enabled: !!mostRecentWorkspace?.taskId,
  });

  const state = useCreateModeState({
    initialProjectId: lastWorkspaceTask?.project_id,
    initialState,
    draftId,
    lastWorkspaceId: mostRecentWorkspace?.id ?? null,
    remoteWorkspaces,
    localWorkspaceIds,
    localWorkspacesLoading,
    remoteWorkspacesLoading,
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
