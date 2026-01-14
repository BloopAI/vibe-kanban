import { useEffect, type ReactNode } from 'react';
import { Group, Layout, Panel, Separator } from 'react-resizable-panels';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { ExecutionProcessesProvider } from '@/contexts/ExecutionProcessesContext';
import { CreateModeProvider } from '@/contexts/CreateModeContext';
import { ReviewProvider } from '@/contexts/ReviewProvider';
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

const WORKSPACES_GUIDE_ID = 'workspaces-guide';

interface ModeProviderProps {
  isCreateMode: boolean;
  executionProps: {
    key: string;
    attemptId?: string;
    sessionId?: string;
  };
  children: ReactNode;
}

function ModeProvider({
  isCreateMode,
  executionProps,
  children,
}: ModeProviderProps) {
  if (isCreateMode) {
    return <CreateModeProvider>{children}</CreateModeProvider>;
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

  const {
    isLeftSidebarVisible,
    isLeftMainPanelVisible,
    isRightSidebarVisible,
    rightMainPanelMode,
    setLeftSidebarVisible,
    setLeftMainPanelVisible,
  } = useUiPreferencesStore();

  const [rightMainPanelSize, setRightMainPanelSize] = usePaneSize(
    PERSIST_KEYS.rightMainPanel,
    50
  );
  const isRightMainPanelVisible = useIsRightMainPanelVisible();
  const { setExpanded } = useExpandedAll();

  const {
    config,
    updateAndSaveConfig,
    loading: configLoading,
  } = useUserSystem();

  const { data: selectedWorkspaceTask } = useTask(selectedWorkspace?.task_id, {
    enabled: !!selectedWorkspace?.task_id,
  });

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
    if (!isRightMainPanelVisible) {
      setLeftSidebarVisible(true);
      if (!isLeftMainPanelVisible) setLeftMainPanelVisible(true);
    }
  }, [isLeftMainPanelVisible, isRightMainPanelVisible, setLeftSidebarVisible, setLeftMainPanelVisible]);

  // Sync diffPaths to store
  useEffect(() => {
    useDiffViewStore.getState().setDiffPaths(Array.from(diffPaths));
    return () => useDiffViewStore.getState().setDiffPaths([]);
  }, [diffPaths]);

  const defaultLayout: Layout =
    typeof rightMainPanelSize === 'number'
      ? { 'left-main': 100 - rightMainPanelSize, 'right-main': rightMainPanelSize }
      : { 'left-main': 50, 'right-main': 50 };

  const onLayoutChange = (layout: Layout) => {
    if (isRightMainPanelVisible) setRightMainPanelSize(layout['right-main']);
  };

  return (
    <div className="flex flex-col h-screen">
      <NavbarContainer />
      <div className="flex flex-1 min-h-0">
        {isLeftSidebarVisible && (
          <div className="w-[300px] shrink-0 h-full overflow-hidden">
            <WorkspacesSidebarContainer />
          </div>
        )}

        <div className="flex-1 min-w-0 h-full">
          <ModeProvider
            isCreateMode={isCreateMode}
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
                    <Group
                      orientation="horizontal"
                      className="flex-1 min-w-0 h-full"
                      defaultLayout={defaultLayout}
                      onLayoutChange={onLayoutChange}
                    >
                      {isLeftMainPanelVisible && (
                        <Panel id="left-main" minSize={20} className="min-w-0 h-full overflow-hidden">
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
                            />
                          )}
                        </Panel>
                      )}

                      {isLeftMainPanelVisible && isRightMainPanelVisible && (
                        <Separator
                          id="main-separator"
                          className="w-1 bg-transparent hover:bg-brand/50 transition-colors cursor-col-resize"
                        />
                      )}

                      {isRightMainPanelVisible && (
                        <Panel id="right-main" minSize={20} className="min-w-0 h-full overflow-hidden">
                          {rightMainPanelMode === RIGHT_MAIN_PANEL_MODES.CHANGES && (
                            <ChangesPanelContainer
                              projectId={selectedWorkspaceTask?.project_id}
                              attemptId={selectedWorkspace?.id}
                            />
                          )}
                          {rightMainPanelMode === RIGHT_MAIN_PANEL_MODES.LOGS && <LogsContentContainer />}
                          {rightMainPanelMode === RIGHT_MAIN_PANEL_MODES.PREVIEW && (
                            <PreviewBrowserContainer attemptId={selectedWorkspace?.id} />
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
