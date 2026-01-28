// VS Code webview integration - install keyboard/clipboard bridge
import '@/vscode/bridge';

import { useRef } from 'react';
import { AppWithStyleOverride } from '@/utils/StyleOverride';
import { WebviewContextMenu } from '@/vscode/ContextMenu';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { SessionChatBoxContainer } from '@/components/ui-new/containers/SessionChatBoxContainer';
import {
  ConversationList,
  type ConversationListHandle,
} from '@/components/ui-new/containers/ConversationListContainer';
import { EntriesProvider } from '@/contexts/EntriesContext';
import { MessageEditProvider } from '@/contexts/MessageEditContext';
import { RetryUiProvider } from '@/contexts/RetryUiContext';
import { ApprovalFeedbackProvider } from '@/contexts/ApprovalFeedbackContext';

export function VSCodeWorkspacePage() {
  const conversationListRef = useRef<ConversationListHandle>(null);

  const {
    workspace,
    sessions,
    selectedSession,
    selectSession,
    isLoading,
  } = useWorkspaceContext();

  const workspaceWithSession = workspace && selectedSession
    ? { ...workspace, session: selectedSession }
    : undefined;

  const handleScrollToPreviousMessage = () => {
    conversationListRef.current?.scrollToPreviousUserMessage();
  };

  const handleScrollToBottom = () => {
    conversationListRef.current?.scrollToBottom();
  };

  return (
    <AppWithStyleOverride>
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
                    <p className="text-low">Loading workspace...</p>
                  </div>
                ) : !workspaceWithSession ? (
                  <div className="flex-1 flex items-center justify-center">
                    <p className="text-low">Workspace not found</p>
                  </div>
                ) : (
                  <div className="flex-1 min-h-0 overflow-hidden flex justify-center">
                    <div className="w-chat max-w-full h-full">
                      <RetryUiProvider attemptId={workspaceWithSession.id}>
                        <ConversationList
                          ref={conversationListRef}
                          attempt={workspaceWithSession}
                        />
                      </RetryUiProvider>
                    </div>
                  </div>
                )}
                <div className="flex justify-center @container pl-px">
                  <SessionChatBoxContainer
                    {...(selectedSession
                      ? {
                          mode: 'existing-session',
                          session: selectedSession,
                          onSelectSession: selectSession,
                          onStartNewSession: undefined,
                        }
                      : {
                          mode: 'placeholder',
                        })}
                    sessions={sessions}
                    projectId={undefined}
                    filesChanged={0}
                    linesAdded={0}
                    linesRemoved={0}
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
