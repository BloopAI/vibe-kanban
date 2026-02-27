import { useMemo, type ReactNode } from "react";
import {
  WorkspaceContext,
  type WorkspaceContextValue,
} from "@/shared/hooks/useWorkspaceContext";

interface RemoteWorkspaceProviderProps {
  children: ReactNode;
}

function noop() {}

export function RemoteWorkspaceProvider({
  children,
}: RemoteWorkspaceProviderProps) {
  const value = useMemo<WorkspaceContextValue>(
    () => ({
      workspaceId: undefined,
      workspace: undefined,
      activeWorkspaces: [],
      archivedWorkspaces: [],
      isLoading: false,
      isCreateMode: false,
      selectWorkspace: noop,
      navigateToCreate: noop,
      sessions: [],
      selectedSession: undefined,
      selectedSessionId: undefined,
      selectSession: noop,
      selectLatestSession: noop,
      isSessionsLoading: false,
      isNewSessionMode: false,
      startNewSession: noop,
      repos: [],
      isReposLoading: false,
      gitHubComments: [],
      isGitHubCommentsLoading: false,
      showGitHubComments: false,
      setShowGitHubComments: noop,
      getGitHubCommentsForFile: () => [],
      getGitHubCommentCountForFile: () => 0,
      getFilesWithGitHubComments: () => [],
      getFirstCommentLineForFile: () => null,
      diffs: [],
      diffPaths: new Set<string>(),
      diffStats: {
        files_changed: 0,
        lines_added: 0,
        lines_removed: 0,
      },
    }),
    [],
  );

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}
