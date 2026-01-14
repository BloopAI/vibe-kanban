import { useCallback, useMemo, useEffect, type ReactNode } from 'react';
import { Group, Layout, Panel, Separator } from 'react-resizable-panels';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { ExecutionProcessesProvider } from '@/contexts/ExecutionProcessesContext';
import { CreateModeProvider } from '@/contexts/CreateModeContext';
import { ReviewProvider } from '@/contexts/ReviewProvider';
import type { RepoWithTargetBranch } from 'shared/types';

import { LogsPanelProvider } from '@/contexts/LogsPanelContext';
import { ChangesViewProvider } from '@/contexts/ChangesViewContext';
import { WorkspacesSidebarContainer } from '@/components/ui-new/containers/WorkspacesSidebarContainer';
import { LogsContentContainer } from '@/components/ui-new/containers/LogsContentContainer';
import { WorkspacesMainContainer } from '@/components/ui-new/containers/WorkspacesMainContainer';
import { RightSidebar } from '@/components/ui-new/containers/RightSidebar';
import { ChangesPanelContainer } from '@/components/ui-new/containers/ChangesPanelContainer';
import { CreateChatBoxContainer } from '@/components/ui-new/containers/CreateChatBoxContainer';
import { NavbarContainer } from '@/components/ui-new/containers/NavbarContainer';
import { PreviewBrowserContainer } from '@/components/ui-new/containers/PreviewBrowserContainer';
import { WorkspacesGuideDialog } from '@/components/ui-new/dialogs/WorkspacesGuideDialog';
import { useUserSystem } from '@/components/ConfigProvider';
import { useTask } from '@/hooks/useTask';
import { useAttemptRepo } from '@/hooks/useAttemptRepo';

import {
  PERSIST_KEYS,
  useExpandedAll,
  usePaneSize,
  useUiPreferencesStore,
  useIsRightMainPanelVisible,
  RIGHT_MAIN_PANEL_MODES,
} from '@/stores/useUiPreferencesStore';
import { useDiffViewStore } from '@/stores/useDiffViewStore';
import { CommandBarDialog } from '@/components/ui-new/dialogs/CommandBarDialog';
import { useCommandBarShortcut } from '@/hooks/useCommandBarShortcut';

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
    activeWorkspaces,
    archivedWorkspaces,
    isLoading,
    isCreateMode,
    selectedSession,
    selectedSessionId,
    sessions,
    selectSession,
    repos,
    isNewSessionMode,
    startNewSession,
    diffPaths,
  } = useWorkspaceContext();

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

  // Command bar keyboard shortcut (CMD+K) - defined later after isChangesMode
  // See useCommandBarShortcut call below

  // Fetch task for current workspace (used for old UI navigation)
  const { data: selectedWorkspaceTask } = useTask(selectedWorkspace?.task_id, {
    enabled: !!selectedWorkspace?.task_id,
  });

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

  return (
    <div className="flex flex-col h-screen">
      <NavbarContainer />
      <div className="flex flex-1 min-h-0">
        {/* Left sidebar */}
        {isLeftSidebarVisible && (
          <div className="w-[300px] shrink-0 h-full overflow-hidden">
            <WorkspacesSidebarContainer />
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
                <ChangesViewProvider>
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
