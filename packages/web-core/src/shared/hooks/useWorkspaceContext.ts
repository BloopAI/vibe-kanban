import { useContext } from 'react';
import { createHmrContext } from '@/shared/lib/hmrContext';
import type {
  Session,
  RepoWithTargetBranch,
  UnifiedPrComment,
  Diff,
  DiffStats,
  Workspace as ApiWorkspace,
} from 'shared/types';
import type { SidebarWorkspace } from '@/shared/hooks/useWorkspaces';
import { DiffSide } from '@/shared/types/diff';

export interface NormalizedGitHubComment {
  id: string;
  author: string;
  body: string;
  createdAt: string;
  url: string | null;
  filePath: string;
  lineNumber: number;
  side: DiffSide;
  diffHunk: string | null;
}

// ---------------------------------------------------------------------------
// Diff / GitHub-comments context — changes frequently during streaming.
// Separated so that conversation-shell components do not rerender on diff churn.
// ---------------------------------------------------------------------------

export interface WorkspaceDiffContextValue {
  /** Diffs for the current workspace */
  diffs: Diff[];
  /** Set of file paths in the diffs */
  diffPaths: Set<string>;
  /** Aggregate diff statistics */
  diffStats: DiffStats;
  /** GitHub PR Comments */
  gitHubComments: UnifiedPrComment[];
  isGitHubCommentsLoading: boolean;
  showGitHubComments: boolean;
  setShowGitHubComments: (show: boolean) => void;
  getGitHubCommentsForFile: (filePath: string) => NormalizedGitHubComment[];
  getGitHubCommentCountForFile: (filePath: string) => number;
  getFilesWithGitHubComments: () => string[];
  getFirstCommentLineForFile: (filePath: string) => number | null;
}

export const WorkspaceDiffContext =
  createHmrContext<WorkspaceDiffContextValue | null>(
    'WorkspaceDiffContext',
    null
  );

export function useWorkspaceDiffContext(): WorkspaceDiffContextValue {
  const context = useContext(WorkspaceDiffContext);
  if (!context) {
    throw new Error(
      'useWorkspaceDiffContext must be used within a WorkspaceProvider'
    );
  }
  return context;
}

// ---------------------------------------------------------------------------
// Core workspace context — workspace, sessions, repos, navigation.
// Changes infrequently; safe for conversation-shell subscriptions.
// ---------------------------------------------------------------------------

export interface WorkspaceContextValue {
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

// Exported for optional usage outside WorkspaceProvider (e.g., old UI)
export const WorkspaceContext = createHmrContext<WorkspaceContextValue | null>(
  'WorkspaceContext',
  null
);

export function useWorkspaceContext(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error(
      'useWorkspaceContext must be used within a WorkspaceProvider'
    );
  }
  return context;
}
