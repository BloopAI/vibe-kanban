import { useEffect, useRef, type ReactNode } from 'react';
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
import { useMediaQuery } from '@/hooks/useMediaQuery';

import {
  PERSIST_KEYS,
  usePaneSize,
  useWorkspacePanelState,
  useUiPreferencesStore,
  RIGHT_MAIN_PANEL_MODES,
} from '@/stores/useUiPreferencesStore';

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

  // Mobile detection (< 640px is Tailwind's sm breakpoint)
  const isMobile = useMediaQuery('(max-width: 639px)');

  // Use workspace-specific panel state (pass undefined when in create mode)
  const {
    isLeftSidebarVisible,
    isLeftMainPanelVisible,
    isRightSidebarVisible,
    rightMainPanelMode,
    setLeftSidebarVisible,
    setLeftMainPanelVisible,
  } = useWorkspacePanelState(isCreateMode ? undefined : workspaceId);

  // Store setters for mobile transitions
  const setRightSidebarVisible = useUiPreferencesStore(
    (s) => s.setRightSidebarVisible
  );

  // Track previous create mode to detect workspace creation completion
  const prevIsCreateModeRef = useRef<boolean>(isCreateMode);

  // Mobile: hide sidebar when in create mode (show git panel + chat by default)
  useEffect(() => {
    if (isMobile && isCreateMode && isLeftSidebarVisible) {
      setLeftSidebarVisible(false);
    }
  }, [isMobile, isCreateMode, isLeftSidebarVisible, setLeftSidebarVisible]);

  // Mobile: transition from create mode to chat-only view after workspace creation
  useEffect(() => {
    if (isMobile && prevIsCreateModeRef.current && !isCreateMode) {
      // Just finished creating workspace, show only chat panel
      setLeftSidebarVisible(false);
      setLeftMainPanelVisible(true);
      setRightSidebarVisible(false);
    }
    prevIsCreateModeRef.current = isCreateMode;
  }, [
    isMobile,
    isCreateMode,
    setLeftSidebarVisible,
    setLeftMainPanelVisible,
    setRightSidebarVisible,
  ]);

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

  // Ensure left panels visible when right main panel hidden (desktop only)
  useEffect(() => {
    // Skip on mobile - mobile has its own panel management
    if (isMobile) return;
    if (rightMainPanelMode === null) {
      setLeftSidebarVisible(true);
      if (!isLeftMainPanelVisible) setLeftMainPanelVisible(true);
    }
  }, [
    isMobile,
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
    if (rightMainPanelMode !== null)
      setRightMainPanelSize(layout['right-main']);
  };

  // Mobile: render content based on which panel is visible (one at a time)
  const renderMobileContent = () => {
    // Sidebar takes priority if visible (works in both create and non-create mode)
    if (isLeftSidebarVisible) {
      return <WorkspacesSidebarContainer />;
    }

    // Create mode on mobile: git panel on top, chat below
    if (isCreateMode) {
      return (
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="flex-1 min-h-0 overflow-hidden border-b border-border">
            <RightSidebar
              isCreateMode={isCreateMode}
              rightMainPanelMode={rightMainPanelMode}
              selectedWorkspace={selectedWorkspace}
              repos={repos}
            />
          </div>
          <div className="shrink-0 overflow-hidden">
            <CreateChatBoxContainer />
          </div>
        </div>
      );
    }

    // Non-create mode: show one panel at a time (radio button behavior)

    if (isRightSidebarVisible) {
      return (
        <RightSidebar
          isCreateMode={isCreateMode}
          rightMainPanelMode={rightMainPanelMode}
          selectedWorkspace={selectedWorkspace}
          repos={repos}
        />
      );
    }

    if (rightMainPanelMode === RIGHT_MAIN_PANEL_MODES.CHANGES) {
      return <ChangesPanelContainer attemptId={selectedWorkspace?.id} />;
    }

    if (rightMainPanelMode === RIGHT_MAIN_PANEL_MODES.LOGS) {
      return <LogsContentContainer />;
    }

    if (rightMainPanelMode === RIGHT_MAIN_PANEL_MODES.PREVIEW) {
      return <PreviewBrowserContainer attemptId={selectedWorkspace?.id} />;
    }

    // Default: show chat panel
    return (
      <WorkspacesMainContainer
        selectedWorkspace={selectedWorkspace ?? null}
        selectedSession={selectedSession}
        sessions={sessions}
        onSelectSession={selectSession}
        isLoading={isLoading}
        isNewSessionMode={isNewSessionMode}
        onStartNewSession={startNewSession}
      />
    );
  };

  // Mobile layout: single panel at a time, full width
  if (isMobile) {
    return (
      <div className="flex flex-col h-screen">
        <NavbarContainer />
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
              <ChangesViewProvider>{renderMobileContent()}</ChangesViewProvider>
            </LogsPanelProvider>
          </ReviewProvider>
        </ModeProvider>
      </div>
    );
  }

  // Desktop layout: resizable panels
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
                            />
                          )}
                        </Panel>
                      )}

                      {isLeftMainPanelVisible &&
                        rightMainPanelMode !== null && (
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
                          {rightMainPanelMode ===
                            RIGHT_MAIN_PANEL_MODES.CHANGES && (
                            <ChangesPanelContainer
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
          </ModeProvider>
        </div>
      </div>
    </div>
  );
}
