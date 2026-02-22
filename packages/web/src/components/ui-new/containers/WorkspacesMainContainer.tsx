import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';
import type { Workspace, Session } from 'shared/types';
import { createWorkspaceWithSession } from '@/types/attempt';
import { WorkspacesMain } from '@vibe/ui/components/WorkspacesMain';
import {
  ConversationList,
  type ConversationListHandle,
} from '@/components/ui-new/containers/ConversationListContainer';
import { SessionChatBoxContainer } from '@/components/ui-new/containers/SessionChatBoxContainer';
import { ContextBarContainer } from '@/components/ui-new/containers/ContextBarContainer';
import { EntriesProvider } from '@/contexts/EntriesContext';
import { MessageEditProvider } from '@/contexts/MessageEditContext';
import { RetryUiProvider } from '@/contexts/RetryUiContext';
import { ApprovalFeedbackProvider } from '@/contexts/ApprovalFeedbackContext';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';

export interface WorkspacesMainContainerHandle {
  scrollToBottom: () => void;
}

interface WorkspacesMainContainerProps {
  selectedWorkspace: Workspace | null;
  selectedSession: Session | undefined;
  sessions: Session[];
  onSelectSession: (sessionId: string) => void;
  isLoading: boolean;
  /** Whether user is creating a new session */
  isNewSessionMode: boolean;
  /** Callback to start new session mode */
  onStartNewSession: () => void;
}

export const WorkspacesMainContainer = forwardRef<
  WorkspacesMainContainerHandle,
  WorkspacesMainContainerProps
>(function WorkspacesMainContainer(
  {
    selectedWorkspace,
    selectedSession,
    sessions,
    onSelectSession,
    isLoading,
    isNewSessionMode,
    onStartNewSession,
  },
  ref
) {
  const { diffStats } = useWorkspaceContext();
  const containerRef = useRef<HTMLElement>(null);
  const conversationListRef = useRef<ConversationListHandle>(null);

  // Create WorkspaceWithSession for ConversationList
  const workspaceWithSession = useMemo(() => {
    if (!selectedWorkspace) return undefined;
    return createWorkspaceWithSession(selectedWorkspace, selectedSession);
  }, [selectedWorkspace, selectedSession]);

  const handleScrollToPreviousMessage = useCallback(() => {
    conversationListRef.current?.scrollToPreviousUserMessage();
  }, []);

  const handleScrollToBottom = useCallback(() => {
    conversationListRef.current?.scrollToBottom();
  }, []);

  const { session } = workspaceWithSession ?? {};

  const entriesProviderKey = workspaceWithSession
    ? `${workspaceWithSession.id}-${session?.id}`
    : 'empty';

  const conversationContent = workspaceWithSession ? (
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
  ) : null;

  const chatBoxContent = (
    <SessionChatBoxContainer
      {...(isNewSessionMode && workspaceWithSession
        ? {
            mode: 'new-session' as const,
            workspaceId: workspaceWithSession.id,
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
      disableViewCode={false}
      showOpenWorkspaceButton={false}
      onScrollToPreviousMessage={handleScrollToPreviousMessage}
      onScrollToBottom={handleScrollToBottom}
    />
  );

  const contextBarContent = workspaceWithSession ? (
    <ContextBarContainer containerRef={containerRef} />
  ) : null;

  useImperativeHandle(
    ref,
    () => ({
      scrollToBottom: () => {
        conversationListRef.current?.scrollToBottom();
      },
    }),
    []
  );

  return (
    <ApprovalFeedbackProvider>
      <EntriesProvider key={entriesProviderKey}>
        <MessageEditProvider>
          <WorkspacesMain
            workspaceWithSession={
              workspaceWithSession ? { id: workspaceWithSession.id } : undefined
            }
            isLoading={isLoading}
            containerRef={containerRef}
            conversationContent={conversationContent}
            chatBoxContent={chatBoxContent}
            contextBarContent={contextBarContent}
          />
        </MessageEditProvider>
      </EntriesProvider>
    </ApprovalFeedbackProvider>
  );
});
