import { useContext, useMemo, type ReactNode } from 'react';
import { createHmrContext } from '@/lib/hmrContext.ts';
import type { DraftWorkspaceImage, Repo, ExecutorConfig } from 'shared/types';
import {
  useCreateModeState,
  type CreateModeInitialState,
} from '@/hooks/useCreateModeState';
import { useWorkspaces } from '@/components/ui-new/hooks/useWorkspaces';
import { useUserContext } from '@/contexts/remote/UserContext';

interface LinkedIssue {
  issueId: string;
  simpleId?: string;
  title?: string;
  remoteProjectId: string;
}

interface CreateModeContextValue {
  repos: Repo[];
  addRepo: (repo: Repo) => void;
  removeRepo: (repoId: string) => void;
  clearRepos: () => void;
  targetBranches: Record<string, string | null>;
  setTargetBranch: (repoId: string, branch: string) => void;
  hasResolvedInitialRepoDefaults: boolean;
  preferredExecutorConfig: ExecutorConfig | null;
  message: string;
  setMessage: (message: string) => void;
  clearDraft: () => Promise<void>;
  /** Whether the initial value has been applied from scratch */
  hasInitialValue: boolean;
  /** Issue to link the workspace to when created */
  linkedIssue: LinkedIssue | null;
  /** Clear the linked issue */
  clearLinkedIssue: () => void;
  /** Persisted executor config (model selector state) */
  executorConfig: ExecutorConfig | null;
  /** Update executor config (triggers debounced scratch save) */
  setExecutorConfig: (config: ExecutorConfig | null) => void;
  /** Uploaded images persisted in the draft */
  images: DraftWorkspaceImage[];
  /** Update draft images (triggers debounced scratch save) */
  setImages: (images: DraftWorkspaceImage[]) => void;
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

  const state = useCreateModeState({
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
      repos: state.repos,
      addRepo: state.addRepo,
      removeRepo: state.removeRepo,
      clearRepos: state.clearRepos,
      targetBranches: state.targetBranches,
      setTargetBranch: state.setTargetBranch,
      hasResolvedInitialRepoDefaults: state.hasResolvedInitialRepoDefaults,
      preferredExecutorConfig: state.preferredExecutorConfig,
      message: state.message,
      setMessage: state.setMessage,
      clearDraft: state.clearDraft,
      hasInitialValue: state.hasInitialValue,
      linkedIssue: state.linkedIssue,
      clearLinkedIssue: state.clearLinkedIssue,
      executorConfig: state.executorConfig,
      setExecutorConfig: state.setExecutorConfig,
      images: state.images,
      setImages: state.setImages,
    }),
    [
      state.repos,
      state.addRepo,
      state.removeRepo,
      state.clearRepos,
      state.targetBranches,
      state.setTargetBranch,
      state.hasResolvedInitialRepoDefaults,
      state.preferredExecutorConfig,
      state.message,
      state.setMessage,
      state.clearDraft,
      state.hasInitialValue,
      state.linkedIssue,
      state.clearLinkedIssue,
      state.executorConfig,
      state.setExecutorConfig,
      state.images,
      state.setImages,
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
