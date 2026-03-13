import { useContext } from 'react';
import { createHmrContext } from '@/shared/lib/hmrContext';
import type {
  DraftWorkspaceAttachment,
  Repo,
  ExecutorConfig,
} from 'shared/types';

interface LinkedIssue {
  issueId: string;
  simpleId?: string;
  title?: string;
  remoteProjectId: string;
}

export interface CreateModeContextValue {
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
  /** Uploaded attachments persisted in the draft */
  attachments: DraftWorkspaceAttachment[];
  /** Update draft attachments (triggers debounced scratch save) */
  setAttachments: (attachments: DraftWorkspaceAttachment[]) => void;
}

export const CreateModeContext =
  createHmrContext<CreateModeContextValue | null>('CreateModeContext', null);

export function useCreateMode() {
  const context = useContext(CreateModeContext);
  if (!context) {
    throw new Error('useCreateMode must be used within a CreateModeProvider');
  }
  return context;
}
