// VS Code webview integration - install keyboard/clipboard bridge
import '@/integrations/vscode/bridge';

import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppWithStyleOverride } from '@/shared/lib/StyleOverride';
import { useStyleOverrideThemeSetter } from '@/shared/lib/StyleOverride';
import { WebviewContextMenu } from '@/integrations/vscode/ContextMenu';
import { ArrowDownIcon } from '@phosphor-icons/react';
import { useWorkspaceContext } from '@/shared/hooks/useWorkspaceContext';
import { usePageTitle } from '@/shared/hooks/usePageTitle';
import { SessionChatBoxContainer } from '@/features/workspace-chat/ui/SessionChatBoxContainer';
import {
  ConversationList,
  type ConversationListHandle,
} from '@/features/workspace-chat/ui/ConversationListContainer';
import { EntriesProvider } from '@/features/workspace-chat/model/contexts/EntriesContext';
import { MessageEditProvider } from '@/features/workspace-chat/model/contexts/MessageEditContext';
import { RetryUiProvider } from '@/features/workspace-chat/model/contexts/RetryUiContext';
import { ApprovalFeedbackProvider } from '@/features/workspace-chat/model/contexts/ApprovalFeedbackContext';
import { createWorkspaceWithSession } from '@/shared/types/attempt';

export function VSCodeWorkspacePage() {
  const { t } = useTranslation('common');
  const setTheme = useStyleOverrideThemeSetter();
  const conversationListRef = useRef<ConversationListHandle>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const {
    workspace,
    sessions,
    selectedSession,
    selectSession,
    isLoading,
    diffStats,
    isNewSessionMode,
    startNewSession,
  } = useWorkspaceContext();

  usePageTitle(workspace?.name);

  const workspaceWithSession = workspace
    ? createWorkspaceWithSession(workspace, selectedSession)
    : undefined;

  const handleScrollToPreviousMessage = () => {
    conversationListRef.current?.scrollToPreviousUserMessage();
  };

  const handleScrollToBottom = useCallback(() => {
    conversationListRef.current?.scrollToBottom();
  }, []);

  const handleAtBottomChange = useCallback((atBottom: boolean) => {
    setIsAtBottom(atBottom);
  }, []);

  return (
    <AppWithStyleOverride setTheme={setTheme}>
      <div className="h-screen flex flex-col bg-primary">
        <WebviewContextMenu />

        <main className="relative flex flex-1 flex-col h-full min-h-0">
          <ApprovalFeedbackProvider>
            <EntriesProvider
              key={
                workspaceWithSession
                  ? `${workspaceWithSession.id}-${selectedSession?.id}`
                  : 'empty'
              }
            >
              <MessageEditProvider>
                {isLoading ? (
                  <div className="flex-1 flex items-center justify-center">
                    <p className="text-low">{t('workspaces.loading')}</p>
                  </div>
                ) : !workspaceWithSession ? (
                  <div className="flex-1 flex items-center justify-center">
                    <p className="text-low">{t('workspaces.notFound')}</p>
                  </div>
                ) : (
                  <div className="flex-1 min-h-0 overflow-hidden flex justify-center">
                    <div className="w-chat max-w-full h-full">
                      <RetryUiProvider attemptId={workspaceWithSession.id}>
                        <ConversationList
                          ref={conversationListRef}
                          attempt={workspaceWithSession}
                          onAtBottomChange={handleAtBottomChange}
                        />
                      </RetryUiProvider>
                    </div>
                  </div>
                )}

                {workspaceWithSession && !isAtBottom && (
                  <div className="flex justify-center pointer-events-none">
                    <div className="w-chat max-w-full relative">
                      <button
                        type="button"
                        onClick={handleScrollToBottom}
                        className="absolute bottom-2 right-4 z-10 pointer-events-auto flex items-center justify-center size-8 rounded-full bg-secondary/80 backdrop-blur-sm border border-secondary text-low hover:text-normal hover:bg-secondary shadow-md transition-all"
                        aria-label="Scroll to bottom"
                        title="Scroll to bottom"
                      >
                        <ArrowDownIcon
                          className="size-icon-base"
                          weight="bold"
                        />
                      </button>
                    </div>
                  </div>
                )}
                <div className="flex justify-center @container pl-px">
                  <SessionChatBoxContainer
                    {...(isNewSessionMode && workspaceWithSession
                      ? {
                          mode: 'new-session',
                          workspaceId: workspaceWithSession.id,
                          onSelectSession: selectSession,
                        }
                      : selectedSession
                        ? {
                            mode: 'existing-session',
                            session: selectedSession,
                            onSelectSession: selectSession,
                            onStartNewSession: startNewSession,
                          }
                        : {
                            mode: 'placeholder',
                          })}
                    sessions={sessions}
                    filesChanged={diffStats.files_changed}
                    linesAdded={diffStats.lines_added}
                    linesRemoved={diffStats.lines_removed}
                    disableViewCode
                    showOpenWorkspaceButton={false}
                    onScrollToPreviousMessage={handleScrollToPreviousMessage}
                    onScrollToBottom={handleScrollToBottom}
                  />
                </div>
              </MessageEditProvider>
            </EntriesProvider>
          </ApprovalFeedbackProvider>
          {/* NO ContextBarContainer here - intentionally excluded for VS Code */}
        </main>
      </div>
    </AppWithStyleOverride>
  );
}
