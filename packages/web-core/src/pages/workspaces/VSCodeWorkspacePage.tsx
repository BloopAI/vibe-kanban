// VS Code webview integration - install keyboard/clipboard bridge
import '@/integrations/vscode/bridge';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session } from 'shared/types';
import { useTranslation } from 'react-i18next';
import { AppWithStyleOverride } from '@/shared/lib/StyleOverride';
import { useStyleOverrideThemeSetter } from '@/shared/lib/StyleOverride';
import { WebviewContextMenu } from '@/integrations/vscode/ContextMenu';
import { ArrowDownIcon } from '@phosphor-icons/react';
import {
  useWorkspaceContext,
  useWorkspaceDiffContext,
} from '@/shared/hooks/useWorkspaceContext';
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
import { forwardWheelToScroller } from '@/features/workspace-chat/ui/forwardWheelToScroller';
import { createWorkspaceWithSession } from '@/shared/types/attempt';

function VSCodeChatBox({
  session,
  workspaceId,
  isNewSessionMode,
  sessions,
  onSelectSession,
  onStartNewSession,
  onScrollToPreviousMessage,
  onScrollToBottom,
  onScrollToUserMessage,
  getActiveTurnPatchKey,
}: {
  session: Session | undefined;
  workspaceId: string | undefined;
  isNewSessionMode: boolean;
  sessions: Session[];
  onSelectSession: (sessionId: string) => void;
  onStartNewSession: () => void;
  onScrollToPreviousMessage: () => void;
  onScrollToBottom: (behavior?: 'auto' | 'smooth') => void;
  onScrollToUserMessage: (patchKey: string) => void;
  getActiveTurnPatchKey: () => string | null;
}) {
  const { diffStats } = useWorkspaceDiffContext();

  return (
    <SessionChatBoxContainer
      {...(isNewSessionMode && workspaceId
        ? {
            mode: 'new-session' as const,
            workspaceId,
            onSelectSession,
          }
        : session
          ? {
              mode: 'existing-session' as const,
              session,
              onSelectSession,
              onStartNewSession,
            }
          : {
              mode: 'placeholder' as const,
            })}
      sessions={sessions}
      filesChanged={diffStats.files_changed}
      linesAdded={diffStats.lines_added}
      linesRemoved={diffStats.lines_removed}
      disableViewCode
      showOpenWorkspaceButton={false}
      onScrollToPreviousMessage={onScrollToPreviousMessage}
      onScrollToBottom={onScrollToBottom}
      onScrollToUserMessage={onScrollToUserMessage}
      getActiveTurnPatchKey={getActiveTurnPatchKey}
    />
  );
}

export function VSCodeWorkspacePage() {
  const { t } = useTranslation('common');
  const setTheme = useStyleOverrideThemeSetter();
  const mainContainerRef = useRef<HTMLElement>(null);
  const conversationListRef = useRef<ConversationListHandle>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const isAtBottomRef = useRef(isAtBottom);

  const {
    workspace,
    sessions,
    selectedSession,
    selectedSessionId,
    selectSession,
    isLoading,
    isNewSessionMode,
    startNewSession,
    repos,
  } = useWorkspaceContext();

  usePageTitle(workspace?.name);

  const workspaceWithSession = workspace
    ? createWorkspaceWithSession(workspace, selectedSession)
    : undefined;

  const handleScrollToPreviousMessage = () => {
    conversationListRef.current?.scrollToPreviousUserMessage();
  };

  const handleScrollToUserMessage = useCallback((patchKey: string) => {
    conversationListRef.current?.scrollToEntryByPatchKey(patchKey);
  }, []);

  const handleGetActiveTurnPatchKey = useCallback(() => {
    return conversationListRef.current?.getVisibleUserMessagePatchKey() ?? null;
  }, []);

  const handleScrollToBottom = useCallback(
    (behavior: 'auto' | 'smooth' = 'smooth') => {
      conversationListRef.current?.scrollToBottom(behavior);
    },
    []
  );

  const handleAtBottomChange = useCallback((atBottom: boolean) => {
    isAtBottomRef.current = atBottom;
    setIsAtBottom(atBottom);
  }, []);

  useEffect(() => {
    isAtBottomRef.current = isAtBottom;
  }, [isAtBottom]);

  useEffect(() => {
    const container = mainContainerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;

    const chatBoxContainer = container.querySelector<HTMLElement>(
      '[data-chatbox-container="true"]'
    );
    if (!chatBoxContainer) return;

    let previousHeight = chatBoxContainer.getBoundingClientRect().height;

    const observer = new ResizeObserver((entries) => {
      const nextHeight =
        entries[0]?.contentRect.height ??
        chatBoxContainer.getBoundingClientRect().height;

      if (Math.abs(nextHeight - previousHeight) < 0.5) return;
      const heightDelta = nextHeight - previousHeight;
      previousHeight = nextHeight;

      if (!isAtBottomRef.current) return;

      requestAnimationFrame(() => {
        if (!isAtBottomRef.current) return;
        conversationListRef.current?.adjustScrollBy(heightDelta);
      });
    });

    observer.observe(chatBoxContainer);

    return () => {
      observer.disconnect();
    };
  }, [workspaceWithSession?.id, selectedSession?.id]);

  return (
    <AppWithStyleOverride setTheme={setTheme}>
      <div className="h-screen flex flex-col bg-primary">
        <WebviewContextMenu />

        <main
          ref={mainContainerRef}
          className="relative flex flex-1 flex-col h-full min-h-0"
        >
          <ApprovalFeedbackProvider>
            <EntriesProvider
              key={
                workspaceWithSession
                  ? `${workspaceWithSession.id}-${selectedSessionId ?? 'new'}`
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
                  <div
                    className="flex-1 min-h-0 overflow-hidden flex justify-center"
                    onWheel={(e) =>
                      forwardWheelToScroller(e, conversationListRef)
                    }
                  >
                    <div className="w-chat max-w-full h-full">
                      <RetryUiProvider workspaceId={workspaceWithSession.id}>
                        <ConversationList
                          key={`${workspaceWithSession.id}-${selectedSessionId ?? 'new'}`}
                          ref={conversationListRef}
                          attempt={workspaceWithSession}
                          repos={repos}
                          onAtBottomChange={handleAtBottomChange}
                          sessionScopeId={selectedSessionId}
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
                        onClick={() => handleScrollToBottom('auto')}
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
                <div
                  className="flex justify-center @container pl-px"
                  data-chatbox-container="true"
                >
                  <VSCodeChatBox
                    session={selectedSession}
                    workspaceId={workspaceWithSession?.id}
                    isNewSessionMode={isNewSessionMode}
                    sessions={sessions}
                    onSelectSession={selectSession}
                    onStartNewSession={startNewSession}
                    onScrollToPreviousMessage={handleScrollToPreviousMessage}
                    onScrollToBottom={handleScrollToBottom}
                    onScrollToUserMessage={handleScrollToUserMessage}
                    getActiveTurnPatchKey={handleGetActiveTurnPatchKey}
                  />
                </div>
              </MessageEditProvider>
            </EntriesProvider>
          </ApprovalFeedbackProvider>
        </main>
      </div>
    </AppWithStyleOverride>
  );
}
