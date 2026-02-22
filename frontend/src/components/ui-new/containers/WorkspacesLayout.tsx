import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from '@tanstack/react-router';
import { Group, Layout, Panel, Separator } from 'react-resizable-panels';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { usePageTitle } from '@/hooks/usePageTitle';
import { ExecutionProcessesProvider } from '@/contexts/ExecutionProcessesContext';
import { CreateModeProvider } from '@/contexts/CreateModeContext';
import { ReviewProvider } from '@/contexts/ReviewProvider';
import { ChangesViewProvider } from '@/contexts/ChangesViewContext';
import { WorkspacesSidebarContainer } from '@/components/ui-new/containers/WorkspacesSidebarContainer';
import { LogsContentContainer } from '@/components/ui-new/containers/LogsContentContainer';
import {
  WorkspacesMainContainer,
  type WorkspacesMainContainerHandle,
} from '@/components/ui-new/containers/WorkspacesMainContainer';
import { RightSidebar } from '@/components/ui-new/containers/RightSidebar';
import { ChangesPanelContainer } from '@/components/ui-new/containers/ChangesPanelContainer';
import { CreateChatBoxContainer } from '@/components/ui-new/containers/CreateChatBoxContainer';
import { PreviewBrowserContainer } from '@/components/ui-new/containers/PreviewBrowserContainer';
import { WorkspacesGuideDialog } from '@/components/ui-new/dialogs/WorkspacesGuideDialog';
import { useUserSystem } from '@/components/ConfigProvider';

import {
  PERSIST_KEYS,
  usePaneSize,
  useWorkspacePanelState,
  useMobileActiveTab,
  useMobileCodePanel,
  RIGHT_MAIN_PANEL_MODES,
  type RightMainPanelMode,
} from '@/stores/useUiPreferencesStore';
import { toWorkspace } from '@/lib/routes/navigation';
import { useIsMobile } from '@/hooks/useIsMobile';
import { cn } from '@/lib/utils';

const WORKSPACES_GUIDE_ID = 'workspaces-guide';

export function WorkspacesLayout() {
  const navigate = useNavigate();
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

  const { t } = useTranslation('common');
  usePageTitle(
    isCreateMode ? t('workspaces.newWorkspace') : selectedWorkspace?.name
  );

  const mainContainerRef = useRef<WorkspacesMainContainerHandle>(null);

  const handleScrollToBottom = useCallback(() => {
    mainContainerRef.current?.scrollToBottom();
  }, []);

  const handleWorkspaceCreated = useCallback(
    (workspaceId: string) => {
      navigate(toWorkspace(workspaceId));
    },
    [navigate]
  );

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
  const hasAutoShownWorkspacesGuide = useRef(false);

  // Auto-show Workspaces Guide on first visit
  useEffect(() => {
    if (hasAutoShownWorkspacesGuide.current) return;
    if (configLoading || !config) return;

    const seenFeatures = config.showcases?.seen_features ?? [];
    if (seenFeatures.includes(WORKSPACES_GUIDE_ID)) return;

    hasAutoShownWorkspacesGuide.current = true;

    void updateAndSaveConfig({
      showcases: { seen_features: [...seenFeatures, WORKSPACES_GUIDE_ID] },
    });
    WorkspacesGuideDialog.show().finally(() => WorkspacesGuideDialog.hide());
  }, [configLoading, config, updateAndSaveConfig]);

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

  const isMobile = useIsMobile();
  const [mobileTab] = useMobileActiveTab();
  const [mobileCodePanel, setMobileCodePanel] = useMobileCodePanel();

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

  // Mobile layout: single full-width panel at a time
  if (isMobile) {
    const CODE_SUB_TABS: {
      id: RightMainPanelMode;
      label: string;
    }[] = [
      { id: RIGHT_MAIN_PANEL_MODES.CHANGES, label: 'Changes' },
      { id: RIGHT_MAIN_PANEL_MODES.LOGS, label: 'Logs' },
      { id: RIGHT_MAIN_PANEL_MODES.PREVIEW, label: 'Preview' },
    ];

    const mobileContent = (
      <ReviewProvider attemptId={selectedWorkspace?.id}>
        <ChangesViewProvider>
          {/* Workspaces tab */}
          <div
            className={cn(
              'h-full overflow-auto',
              mobileTab !== 'workspaces' && 'hidden'
            )}
          >
            <WorkspacesSidebarContainer
              onScrollToBottom={handleScrollToBottom}
            />
          </div>
          {/* Chat tab */}
          <div
            className={cn(
              'h-full flex flex-col overflow-hidden',
              mobileTab !== 'chat' && 'hidden'
            )}
          >
            {isCreateMode ? (
              <CreateChatBoxContainer
                onWorkspaceCreated={handleWorkspaceCreated}
              />
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
          </div>
          {/* Code tab (changes/logs/preview with sub-tabs) */}
          <div
            className={cn(
              'h-full flex flex-col overflow-hidden',
              mobileTab !== 'changes' && 'hidden'
            )}
          >
            {/* Sub-tab selector */}
            <div className="flex items-center gap-1 px-base py-1 bg-secondary border-b shrink-0">
              {CODE_SUB_TABS.map((sub) => (
                <button
                  key={sub.id}
                  type="button"
                  onClick={() => setMobileCodePanel(sub.id)}
                  className={cn(
                    'px-2 py-0.5 rounded-sm text-sm',
                    mobileCodePanel === sub.id
                      ? 'text-normal bg-fill-tertiary'
                      : 'text-low hover:text-normal'
                  )}
                >
                  {sub.label}
                </button>
              ))}
            </div>
            {/* Sub-tab content */}
            <div className="flex-1 min-h-0 overflow-hidden">
              {mobileCodePanel === RIGHT_MAIN_PANEL_MODES.CHANGES &&
                selectedWorkspace?.id && (
                  <ChangesPanelContainer
                    attemptId={selectedWorkspace.id}
                    className=""
                  />
                )}
              {mobileCodePanel === RIGHT_MAIN_PANEL_MODES.LOGS && (
                <LogsContentContainer className="" />
              )}
              {mobileCodePanel === RIGHT_MAIN_PANEL_MODES.PREVIEW &&
                selectedWorkspace?.id && (
                  <PreviewBrowserContainer
                    attemptId={selectedWorkspace.id}
                    className=""
                  />
                )}
            </div>
          </div>
          {/* Git tab */}
          <div
            className={cn(
              'h-full overflow-hidden',
              mobileTab !== 'git' && 'hidden'
            )}
          >
            {!isCreateMode && selectedWorkspace && (
              <RightSidebar
                rightMainPanelMode={rightMainPanelMode}
                selectedWorkspace={selectedWorkspace}
                repos={repos}
              />
            )}
          </div>
        </ChangesViewProvider>
      </ReviewProvider>
    );

    return (
      <div className="flex flex-col flex-1 min-h-0 h-full overflow-hidden">
        {isCreateMode ? (
          <CreateModeProvider>{mobileContent}</CreateModeProvider>
        ) : (
          <ExecutionProcessesProvider
            key={`${selectedWorkspace?.id}-${selectedSessionId}`}
            attemptId={selectedWorkspace?.id}
            sessionId={selectedSessionId}
          >
            {mobileContent}
          </ExecutionProcessesProvider>
        )}
      </div>
    );
  }

  // Desktop layout
  const mainContent = (
    <ReviewProvider attemptId={selectedWorkspace?.id}>
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
                minSize="20%"
                className="min-w-0 h-full overflow-hidden"
              >
                {isCreateMode ? (
                  <CreateChatBoxContainer
                    onWorkspaceCreated={handleWorkspaceCreated}
                  />
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
                minSize="20%"
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

          {isRightSidebarVisible && !isCreateMode && (
            <div className="w-[300px] shrink-0 h-full overflow-hidden">
              <RightSidebar
                rightMainPanelMode={rightMainPanelMode}
                selectedWorkspace={selectedWorkspace}
                repos={repos}
              />
            </div>
          )}
        </div>
      </ChangesViewProvider>
    </ReviewProvider>
  );

  return (
    <div className="flex flex-1 min-h-0 h-full">
      {isLeftSidebarVisible && (
        <div className="w-[300px] shrink-0 h-full overflow-hidden">
          <WorkspacesSidebarContainer onScrollToBottom={handleScrollToBottom} />
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
  );
}
