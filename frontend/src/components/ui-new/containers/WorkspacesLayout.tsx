import {
  useState,
  useCallback,
  useMemo,
  useEffect,
  type ReactNode,
} from 'react';
import { Group, Layout, Panel, Separator } from 'react-resizable-panels';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { useActions } from '@/contexts/ActionsContext';
import { ExecutionProcessesProvider } from '@/contexts/ExecutionProcessesContext';
import { CreateModeProvider } from '@/contexts/CreateModeContext';
import { ReviewProvider } from '@/contexts/ReviewProvider';
import { splitMessageToTitleDescription } from '@/utils/string';
import { useScratch } from '@/hooks/useScratch';
import { ScratchType, type DraftWorkspaceData } from 'shared/types';

import { LogsPanelProvider } from '@/contexts/LogsPanelContext';
import { ChangesViewProvider } from '@/contexts/ChangesViewContext';
import { WorkspacesSidebar } from '@/components/ui-new/views/WorkspacesSidebar';
import { LogsContentContainer } from '@/components/ui-new/containers/LogsContentContainer';
import { WorkspacesMainContainer } from '@/components/ui-new/containers/WorkspacesMainContainer';
import { type RepoInfo } from '@/components/ui-new/views/GitPanel';
import { RightSidebar } from '@/components/ui-new/containers/RightSidebar';
import { ChangesPanelContainer } from '@/components/ui-new/containers/ChangesPanelContainer';
import { CreateChatBoxContainer } from '@/components/ui-new/containers/CreateChatBoxContainer';
import { NavbarContainer } from '@/components/ui-new/containers/NavbarContainer';
import { PreviewBrowserContainer } from '@/components/ui-new/containers/PreviewBrowserContainer';
import { useRenameBranch } from '@/hooks/useRenameBranch';
import { WorkspacesGuideDialog } from '@/components/ui-new/dialogs/WorkspacesGuideDialog';
import { useUserSystem } from '@/components/ConfigProvider';
import { useDiffStream } from '@/hooks/useDiffStream';
import { useTask } from '@/hooks/useTask';
import { useAttemptRepo } from '@/hooks/useAttemptRepo';
import { useBranchStatus } from '@/hooks/useBranchStatus';
import {
  PERSIST_KEYS,
  useExpandedAll,
  usePaneSize,
  usePersistedExpanded,
  useUiPreferencesStore,
  useIsRightMainPanelVisible,
  RIGHT_MAIN_PANEL_MODES,
} from '@/stores/useUiPreferencesStore';
import { useDiffViewStore } from '@/stores/useDiffViewStore';
import { CommandBarDialog } from '@/components/ui-new/dialogs/CommandBarDialog';
import { useCommandBarShortcut } from '@/hooks/useCommandBarShortcut';
import { Actions } from '@/components/ui-new/actions';
import type { Merge, RepoWithTargetBranch } from 'shared/types';

// Fixed UUID for the universal workspace draft (same as in useCreateModeState.ts)
const DRAFT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000001';

interface ModeProviderProps {
  isCreateMode: boolean;
  createModeProps: {
    initialProjectId?: string;
    initialRepos?: RepoWithTargetBranch[];
  };
  executionProps: {
    key: string;
    attemptId?: string;
    sessionId?: string;
  };
  children: ReactNode;
}

function ModeProvider({
  isCreateMode,
  createModeProps,
  executionProps,
  children,
}: ModeProviderProps) {
  if (isCreateMode) {
    return (
      <CreateModeProvider
        initialProjectId={createModeProps.initialProjectId}
        initialRepos={createModeProps.initialRepos}
      >
        {children}
      </CreateModeProvider>
    );
  }
  return (
    <ExecutionProcessesProvider
      key={executionProps.key}
      attemptId={executionProps.attemptId}
      sessionId={executionProps.sessionId}
    >
      {children}
    </ExecutionProcessesProvider>
  );
}

export function WorkspacesLayout() {
  const {
    workspace: selectedWorkspace,
    workspaceId: selectedWorkspaceId,
    activeWorkspaces,
    archivedWorkspaces,
    isLoading,
    isCreateMode,
    selectWorkspace,
    navigateToCreate,
    selectedSession,
    selectedSessionId,
    sessions,
    selectSession,
    repos,
    isNewSessionMode,
    startNewSession,
  } = useWorkspaceContext();
  const [searchQuery, setSearchQuery] = useState('');

  // Layout state from store
  const {
    isLeftSidebarVisible,
    isLeftMainPanelVisible,
    isRightSidebarVisible,
    rightMainPanelMode,
    setRightMainPanelMode,
    resetForCreateMode,
    setLeftSidebarVisible,
    setLeftMainPanelVisible,
  } = useUiPreferencesStore();

  const [rightMainPanelSize, setRightMainPanelSize] = usePaneSize(
    PERSIST_KEYS.rightMainPanel,
    50
  );
  const isRightMainPanelVisible = useIsRightMainPanelVisible();
  const [showArchive, setShowArchive] = usePersistedExpanded(
    PERSIST_KEYS.workspacesSidebarArchived,
    false
  );

  const defaultLayout = (): Layout => {
    let layout = { 'left-main': 50, 'right-main': 50 };
    if (typeof rightMainPanelSize === 'number') {
      layout = {
        'left-main': 100 - rightMainPanelSize,
        'right-main': rightMainPanelSize,
      };
    }
    return layout;
  };

  const onLayoutChange = (layout: Layout) => {
    if (isRightMainPanelVisible) {
      setRightMainPanelSize(layout['right-main']);
    }
  };

  // === Auto-show Workspaces Guide on first visit ===
  const WORKSPACES_GUIDE_ID = 'workspaces-guide';
  const {
    config,
    updateAndSaveConfig,
    loading: configLoading,
  } = useUserSystem();

  const seenFeatures = useMemo(
    () => config?.showcases?.seen_features ?? [],
    [config?.showcases?.seen_features]
  );

  const hasSeenGuide =
    !configLoading && seenFeatures.includes(WORKSPACES_GUIDE_ID);

  useEffect(() => {
    if (configLoading || hasSeenGuide) return;

    // Mark as seen immediately before showing, so page reload doesn't re-trigger
    void updateAndSaveConfig({
      showcases: { seen_features: [...seenFeatures, WORKSPACES_GUIDE_ID] },
    });

    WorkspacesGuideDialog.show().finally(() => {
      WorkspacesGuideDialog.hide();
    });
  }, [configLoading, hasSeenGuide, seenFeatures, updateAndSaveConfig]);

  // Read persisted draft for sidebar placeholder (works outside of CreateModeProvider)
  const { scratch: draftScratch } = useScratch(
    ScratchType.DRAFT_WORKSPACE,
    DRAFT_WORKSPACE_ID
  );

  // Extract draft title from persisted scratch
  const persistedDraftTitle = useMemo(() => {
    const scratchData: DraftWorkspaceData | undefined =
      draftScratch?.payload?.type === 'DRAFT_WORKSPACE'
        ? draftScratch.payload.data
        : undefined;

    if (!scratchData?.message?.trim()) return undefined;
    const { title } = splitMessageToTitleDescription(
      scratchData.message.trim()
    );
    return title || 'New Workspace';
  }, [draftScratch]);

  // Command bar keyboard shortcut (CMD+K) - defined later after isChangesMode
  // See useCommandBarShortcut call below

  // Fetch task for current workspace (used for old UI navigation)
  const { data: selectedWorkspaceTask } = useTask(selectedWorkspace?.task_id, {
    enabled: !!selectedWorkspace?.task_id,
  });

  // Stream real diffs for the selected workspace
  const { diffs: realDiffs } = useDiffStream(
    selectedWorkspace?.id ?? null,
    !isCreateMode && !!selectedWorkspace?.id
  );

  // Hook to rename branch via API
  const renameBranch = useRenameBranch(selectedWorkspace?.id);

  // Fetch branch status (including PR/merge info)
  const { data: branchStatus } = useBranchStatus(selectedWorkspace?.id);

  const handleBranchNameChange = useCallback(
    (newName: string) => {
      renameBranch.mutate(newName);
    },
    [renameBranch]
  );

  // Compute aggregate diff stats from real diffs (for WorkspacesMainContainer)
  const diffStats = useMemo(
    () => ({
      filesChanged: realDiffs.length,
      linesAdded: realDiffs.reduce((sum, d) => sum + (d.additions ?? 0), 0),
      linesRemoved: realDiffs.reduce((sum, d) => sum + (d.deletions ?? 0), 0),
    }),
    [realDiffs]
  );

  // Transform repos to RepoInfo format for GitPanel
  const repoInfos: RepoInfo[] = useMemo(
    () =>
      repos.map((repo) => {
        // Find branch status for this repo to get PR info
        const repoStatus = branchStatus?.find((s) => s.repo_id === repo.id);

        // Find the most relevant PR (prioritize open, then merged)
        let prNumber: number | undefined;
        let prUrl: string | undefined;
        let prStatus: 'open' | 'merged' | 'closed' | 'unknown' | undefined;

        if (repoStatus?.merges) {
          const openPR = repoStatus.merges.find(
            (m: Merge) => m.type === 'pr' && m.pr_info.status === 'open'
          );
          const mergedPR = repoStatus.merges.find(
            (m: Merge) => m.type === 'pr' && m.pr_info.status === 'merged'
          );

          const relevantPR = openPR || mergedPR;
          if (relevantPR && relevantPR.type === 'pr') {
            prNumber = Number(relevantPR.pr_info.number);
            prUrl = relevantPR.pr_info.url;
            prStatus = relevantPR.pr_info.status;
          }
        }

        // Compute per-repo diff stats
        const repoDiffs = realDiffs.filter((d) => d.repoId === repo.id);
        const filesChanged = repoDiffs.length;
        const linesAdded = repoDiffs.reduce(
          (sum, d) => sum + (d.additions ?? 0),
          0
        );
        const linesRemoved = repoDiffs.reduce(
          (sum, d) => sum + (d.deletions ?? 0),
          0
        );

        return {
          id: repo.id,
          name: repo.display_name || repo.name,
          targetBranch: repo.target_branch || 'main',
          commitsAhead: repoStatus?.commits_ahead ?? 0,
          remoteCommitsAhead: repoStatus?.remote_commits_ahead ?? 0,
          filesChanged,
          linesAdded,
          linesRemoved,
          prNumber,
          prUrl,
          prStatus,
        };
      }),
    [repos, realDiffs, branchStatus]
  );

  // Reset changes and logs mode when entering create mode
  useEffect(() => {
    if (isCreateMode) {
      resetForCreateMode();
    }
  }, [isCreateMode, resetForCreateMode]);

  // Show left sidebar when right main panel is hidden
  useEffect(() => {
    if (!isRightMainPanelVisible) {
      setLeftSidebarVisible(true);
    }
  }, [isRightMainPanelVisible, setLeftSidebarVisible]);

  // Ensure left main panel (chat) is visible when right main panel is hidden
  // This prevents invalid state where only sidebars are visible after page reload
  useEffect(() => {
    if (!isLeftMainPanelVisible && !isRightMainPanelVisible) {
      setLeftMainPanelVisible(true);
    }
  }, [
    isLeftMainPanelVisible,
    isRightMainPanelVisible,
    setLeftMainPanelVisible,
  ]);

  // Command bar keyboard shortcut (CMD+K)
  const handleOpenCommandBar = useCallback(() => {
    CommandBarDialog.show();
  }, []);
  useCommandBarShortcut(handleOpenCommandBar);

  // Expanded state for file tree selection
  const { setExpanded } = useExpandedAll();

  // Toggle changes mode for "View Code" button in main panel
  const handleToggleChangesMode = useCallback(() => {
    if (rightMainPanelMode === RIGHT_MAIN_PANEL_MODES.CHANGES) {
      setRightMainPanelMode(null);
    } else {
      setRightMainPanelMode(RIGHT_MAIN_PANEL_MODES.CHANGES);
    }
  }, [rightMainPanelMode, setRightMainPanelMode]);

  // Compute diffPaths for FileNavigationContext
  const diffPaths = useMemo(() => {
    return new Set(
      realDiffs.map((d) => d.newPath || d.oldPath || '').filter(Boolean)
    );
  }, [realDiffs]);

  // Sync diffPaths to store for actions (ToggleAllDiffs, ExpandAllDiffs, etc.)
  useEffect(() => {
    useDiffViewStore.getState().setDiffPaths(Array.from(diffPaths));
    return () => useDiffViewStore.getState().setDiffPaths([]);
  }, [diffPaths]);

  // Get the most recent workspace to auto-select its project and repos in create mode
  // Fall back to archived workspaces if no active workspaces exist
  const mostRecentWorkspace = activeWorkspaces[0] ?? archivedWorkspaces[0];

  const { data: lastWorkspaceTask } = useTask(mostRecentWorkspace?.taskId, {
    enabled: isCreateMode && !!mostRecentWorkspace?.taskId,
  });

  // Fetch repos from the most recent workspace to auto-select in create mode
  const { repos: lastWorkspaceRepos } = useAttemptRepo(
    mostRecentWorkspace?.id,
    {
      enabled: isCreateMode && !!mostRecentWorkspace?.id,
    }
  );

  // Action handlers for sidebar workspace actions
  const { executeAction } = useActions();

  const handleArchiveWorkspace = useCallback(
    (workspaceId: string) => {
      executeAction(Actions.ArchiveWorkspace, workspaceId);
    },
    [executeAction]
  );

  const handlePinWorkspace = useCallback(
    (workspaceId: string) => {
      executeAction(Actions.PinWorkspace, workspaceId);
    },
    [executeAction]
  );

  return (
    <div className="flex flex-col h-screen">
      <NavbarContainer />
      <div className="flex flex-1 min-h-0">
        {/* Left sidebar - OUTSIDE providers, won't remount on workspace switch */}
        {isLeftSidebarVisible && (
          <div className="w-[300px] shrink-0 h-full overflow-hidden">
            <WorkspacesSidebar
              workspaces={activeWorkspaces}
              archivedWorkspaces={archivedWorkspaces}
              selectedWorkspaceId={selectedWorkspaceId ?? null}
              onSelectWorkspace={selectWorkspace}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              onAddWorkspace={navigateToCreate}
              onArchiveWorkspace={handleArchiveWorkspace}
              onPinWorkspace={handlePinWorkspace}
              isCreateMode={isCreateMode}
              draftTitle={persistedDraftTitle}
              onSelectCreate={navigateToCreate}
              showArchive={showArchive}
              onShowArchiveChange={setShowArchive}
            />
          </div>
        )}

        {/* Container for provider-wrapped inner content */}
        <div className="flex-1 min-w-0 h-full">
          <ModeProvider
            isCreateMode={isCreateMode}
            createModeProps={{
              initialProjectId: lastWorkspaceTask?.project_id,
              initialRepos: lastWorkspaceRepos,
            }}
            executionProps={{
              key: `${selectedWorkspace?.id}-${selectedSessionId}`,
              attemptId: selectedWorkspace?.id,
              sessionId: selectedSessionId,
            }}
          >
            <ReviewProvider attemptId={selectedWorkspace?.id}>
              <LogsPanelProvider>
                <ChangesViewProvider diffPaths={diffPaths}>
                  <div className="flex h-full">
                    {/* Resizable area for main + right panels */}
                    <Group
                      orientation="horizontal"
                      className="flex-1 min-w-0 h-full"
                      defaultLayout={defaultLayout()}
                      onLayoutChange={onLayoutChange}
                    >
                      {/* Main panel (chat area) */}
                      {isLeftMainPanelVisible && (
                        <Panel
                          id="left-main"
                          minSize={20}
                          className="min-w-0 h-full overflow-hidden"
                        >
                          {isCreateMode ? (
                            <CreateChatBoxContainer />
                          ) : (
                            <WorkspacesMainContainer
                              selectedWorkspace={selectedWorkspace ?? null}
                              selectedSession={selectedSession}
                              sessions={sessions}
                              onSelectSession={selectSession}
                              isLoading={isLoading}
                              isNewSessionMode={isNewSessionMode}
                              onStartNewSession={startNewSession}
                              onViewCode={handleToggleChangesMode}
                              diffStats={diffStats}
                            />
                          )}
                        </Panel>
                      )}

                      {/* Resize handle between main and right panels */}
                      {isLeftMainPanelVisible && isRightMainPanelVisible && (
                        <Separator
                          id="main-separator"
                          className="w-1 bg-transparent hover:bg-brand/50 transition-colors cursor-col-resize"
                        />
                      )}

                      {/* Right main panel (Changes/Logs/Preview) */}
                      {isRightMainPanelVisible && (
                        <Panel
                          id="right-main"
                          minSize={20}
                          className="min-w-0 h-full overflow-hidden"
                        >
                          {rightMainPanelMode ===
                            RIGHT_MAIN_PANEL_MODES.CHANGES && (
                            <ChangesPanelContainer
                              diffs={realDiffs}
                              projectId={selectedWorkspaceTask?.project_id}
                              attemptId={selectedWorkspace?.id}
                            />
                          )}
                          {rightMainPanelMode ===
                            RIGHT_MAIN_PANEL_MODES.LOGS && (
                            <LogsContentContainer />
                          )}
                          {rightMainPanelMode ===
                            RIGHT_MAIN_PANEL_MODES.PREVIEW && (
                            <PreviewBrowserContainer
                              attemptId={selectedWorkspace?.id}
                            />
                          )}
                        </Panel>
                      )}
                    </Group>

                    {/* Git panel (right sidebar) - fixed width, not resizable */}
                    {isRightSidebarVisible && (
                      <div className="w-[300px] shrink-0 h-full overflow-hidden">
                        <RightSidebar
                          isCreateMode={isCreateMode}
                          rightMainPanelMode={rightMainPanelMode}
                          selectedWorkspace={selectedWorkspace}
                          repos={repos}
                          repoInfos={repoInfos}
                          realDiffs={realDiffs}
                          onBranchNameChange={handleBranchNameChange}
                          onSetExpanded={setExpanded}
                        />
                      </div>
                    )}
                  </div>
                </ChangesViewProvider>
              </LogsPanelProvider>
            </ReviewProvider>
          </ModeProvider>
        </div>
      </div>
    </div>
  );
}
