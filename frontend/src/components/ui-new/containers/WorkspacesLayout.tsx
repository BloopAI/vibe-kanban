import { useCallback, useEffect, useRef } from 'react';
import { Group, Layout, Panel, Separator } from 'react-resizable-panels';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { ExecutionProcessesProvider } from '@/contexts/ExecutionProcessesContext';
import { CreateModeProvider } from '@/contexts/CreateModeContext';
import { ReviewProvider } from '@/contexts/ReviewProvider';
import { ChangesViewProvider } from '@/contexts/ChangesViewContext';
import { LogsPanelProvider } from '@/contexts/LogsPanelContext';
import { WorkspacesSidebarContainer } from '@/components/ui-new/containers/WorkspacesSidebarContainer';
import { LogsContentContainer } from '@/components/ui-new/containers/LogsContentContainer';
import {
  WorkspacesMainContainer,
  type WorkspacesMainContainerHandle,
} from '@/components/ui-new/containers/WorkspacesMainContainer';
import { RightSidebar } from '@/components/ui-new/containers/RightSidebar';
import { ChangesPanelContainer } from '@/components/ui-new/containers/ChangesPanelContainer';
import { CreateChatBoxContainer } from '@/components/ui-new/containers/CreateChatBoxContainer';
import { NavbarContainer } from '@/components/ui-new/containers/NavbarContainer';
import { PreviewBrowserContainer } from '@/components/ui-new/containers/PreviewBrowserContainer';
import { WorkspacesGuideDialog } from '@/components/ui-new/dialogs/WorkspacesGuideDialog';
import { useUserSystem } from '@/components/ConfigProvider';

import {
  PERSIST_KEYS,
  usePaneSize,
  useWorkspacePanelState,
  RIGHT_MAIN_PANEL_MODES,
} from '@/stores/useUiPreferencesStore';

import { CommandBarDialog } from '@/components/ui-new/dialogs/CommandBarDialog';
import { useCommandBarShortcut } from '@/hooks/useCommandBarShortcut';

const WORKSPACES_GUIDE_ID = 'workspaces-guide';

export function WorkspacesLayout() {
  const {
    workspaceId,
    workspace: selectedWorkspace,
    isLoading,
    isCreateMode,
    selectedSession,
    selectedSessionId,
    sessions,
    selectSession,
    repos,
    isNewSessionMode,
    startNewSession,
  } = useWorkspaceContext();

  const mainContainerRef = useRef<WorkspacesMainContainerHandle>(null);

  const handleScrollToBottom = useCallback(() => {
    mainContainerRef.current?.scrollToBottom();
  }, []);

  // Use workspace-specific panel state (pass undefined when in create mode)
  const {
    isLeftSidebarVisible,
    isLeftMainPanelVisible,
    isRightSidebarVisible,
    rightMainPanelMode,
    setLeftSidebarVisible,
    setLeftMainPanelVisible,
  } = useWorkspacePanelState(isCreateMode ? undefined : workspaceId);

  const {
    config,
    updateAndSaveConfig,
    loading: configLoading,
  } = useUserSystem();

  useCommandBarShortcut(() => CommandBarDialog.show());

  // Auto-show Workspaces Guide on first visit
  useEffect(() => {
    const seenFeatures = config?.showcases?.seen_features ?? [];
    if (configLoading || seenFeatures.includes(WORKSPACES_GUIDE_ID)) return;

    void updateAndSaveConfig({
      showcases: { seen_features: [...seenFeatures, WORKSPACES_GUIDE_ID] },
    });
    WorkspacesGuideDialog.show().finally(() => WorkspacesGuideDialog.hide());
  }, [configLoading, config?.showcases?.seen_features, updateAndSaveConfig]);

  // Ensure left panels visible when right main panel hidden
  useEffect(() => {
    if (rightMainPanelMode === null) {
      setLeftSidebarVisible(true);
      if (!isLeftMainPanelVisible) setLeftMainPanelVisible(true);
    }
  }, [
    isLeftMainPanelVisible,
    rightMainPanelMode,
    setLeftSidebarVisible,
    setLeftMainPanelVisible,
  ]);

  const [rightMainPanelSize, setRightMainPanelSize] = usePaneSize(
    PERSIST_KEYS.rightMainPanel,
    50
  );

  const defaultLayout: Layout =
    typeof rightMainPanelSize === 'number'
      ? {
          'left-main': 100 - rightMainPanelSize,
          'right-main': rightMainPanelSize,
        }
      : { 'left-main': 50, 'right-main': 50 };

  const onLayoutChange = (layout: Layout) => {
    if (isLeftMainPanelVisible && rightMainPanelMode !== null)
      setRightMainPanelSize(layout['right-main']);
  };

  const mainContent = (
    <ReviewProvider attemptId={selectedWorkspace?.id}>
      <LogsPanelProvider>
        <ChangesViewProvider>
          <div className="flex h-full">
            <Group
              orientation="horizontal"
              className="flex-1 min-w-0 h-full"
              defaultLayout={defaultLayout}
              onLayoutChange={onLayoutChange}
            >
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
                      ref={mainContainerRef}
                      selectedWorkspace={selectedWorkspace ?? null}
                      selectedSession={selectedSession}
                      sessions={sessions}
                      onSelectSession={selectSession}
                      isLoading={isLoading}
                      isNewSessionMode={isNewSessionMode}
                      onStartNewSession={startNewSession}
                    />
                  )}
                </Panel>
              )}

              {isLeftMainPanelVisible && rightMainPanelMode !== null && (
                <Separator
                  id="main-separator"
                  className="w-1 bg-transparent hover:bg-brand/50 transition-colors cursor-col-resize"
                />
              )}

              {rightMainPanelMode !== null && (
                <Panel
                  id="right-main"
                  minSize={20}
                  className="min-w-0 h-full overflow-hidden"
                >
                  {rightMainPanelMode === RIGHT_MAIN_PANEL_MODES.CHANGES &&
                    selectedWorkspace?.id && (
                      <ChangesPanelContainer
                        className=""
                        attemptId={selectedWorkspace.id}
                      />
                    )}
                  {rightMainPanelMode === RIGHT_MAIN_PANEL_MODES.LOGS && (
                    <LogsContentContainer className="" />
                  )}
                  {rightMainPanelMode === RIGHT_MAIN_PANEL_MODES.PREVIEW &&
                    selectedWorkspace?.id && (
                      <PreviewBrowserContainer
                        attemptId={selectedWorkspace.id}
                        className=""
                      />
                    )}
                </Panel>
              )}
            </Group>

            {isRightSidebarVisible && (
              <div className="w-[300px] shrink-0 h-full overflow-hidden">
                <RightSidebar
                  isCreateMode={isCreateMode}
                  rightMainPanelMode={rightMainPanelMode}
                  selectedWorkspace={selectedWorkspace}
                  repos={repos}
                />
              </div>
            )}
          </div>
        </ChangesViewProvider>
      </LogsPanelProvider>
    </ReviewProvider>
  );

  return (
    <div className="flex flex-col h-screen">
      <NavbarContainer />
      <div className="flex flex-1 min-h-0">
        {isLeftSidebarVisible && (
          <div className="w-[300px] shrink-0 h-full overflow-hidden">
            <WorkspacesSidebarContainer
              onScrollToBottom={handleScrollToBottom}
            />
          </div>
        )}

        <div className="flex-1 min-w-0 h-full">
          {isCreateMode ? (
            <CreateModeProvider>{mainContent}</CreateModeProvider>
          ) : (
            <ExecutionProcessesProvider
              key={`${selectedWorkspace?.id}-${selectedSessionId}`}
              attemptId={selectedWorkspace?.id}
              sessionId={selectedSessionId}
            >
              {mainContent}
            </ExecutionProcessesProvider>
          )}
        </div>
      </div>
    </div>
  );
}
