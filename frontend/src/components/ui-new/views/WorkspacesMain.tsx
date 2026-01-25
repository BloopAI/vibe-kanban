import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { Session } from 'shared/types';
import type { WorkspaceWithSession } from '@/types/attempt';
import { SessionChatBoxContainer } from '@/components/ui-new/containers/SessionChatBoxContainer';
import { ContextBarContainer } from '@/components/ui-new/containers/ContextBarContainer';
import {
  ConversationList,
  type ConversationListHandle,
} from '../containers/ConversationListContainer';
import { EntriesProvider } from '@/contexts/EntriesContext';
import { MessageEditProvider } from '@/contexts/MessageEditContext';
import { RetryUiProvider } from '@/contexts/RetryUiContext';
import { ApprovalFeedbackProvider } from '@/contexts/ApprovalFeedbackContext';

export type { ConversationListHandle };

interface DiffStats {
  filesChanged: number;
  linesAdded: number;
  linesRemoved: number;
}

interface WorkspacesMainProps {
  workspaceWithSession: WorkspaceWithSession | undefined;
  sessions: Session[];
  onSelectSession: (sessionId: string) => void;
  isLoading: boolean;
  containerRef: RefObject<HTMLElement | null>;
  conversationListRef: RefObject<ConversationListHandle>;
  projectId?: string;
  /** Whether user is creating a new session */
  isNewSessionMode?: boolean;
  /** Callback to start new session mode */
  onStartNewSession?: () => void;
  /** Diff statistics from the workspace */
  diffStats?: DiffStats;
  /** Callback to scroll to previous user message */
  onScrollToPreviousMessage: () => void;
  /** Callback to scroll to bottom of conversation */
  onScrollToBottom: () => void;
}

export function WorkspacesMain({
  workspaceWithSession,
  sessions,
  onSelectSession,
  isLoading,
  containerRef,
  conversationListRef,
  projectId,
  isNewSessionMode,
  onStartNewSession,
  diffStats,
  onScrollToPreviousMessage,
  onScrollToBottom,
}: WorkspacesMainProps) {
  const { t } = useTranslation(['tasks', 'common']);
  const { session } = workspaceWithSession ?? {};

  // Always render the main structure to prevent chat box flash during workspace transitions
  return (
    <main
      ref={containerRef as React.RefObject<HTMLElement>}
      className="relative flex flex-1 flex-col bg-primary h-full"
    >
      <ApprovalFeedbackProvider>
        <EntriesProvider
          key={
            workspaceWithSession
              ? `${workspaceWithSession.id}-${session?.id}`
              : 'empty'
          }
        >
          {/* Conversation content - conditional based on loading/workspace state */}
          <MessageEditProvider>
            {isLoading ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-low">{t('common:workspaces.loading')}</p>
              </div>
            ) : !workspaceWithSession ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-low">
                  {t('common:workspaces.selectToStart')}
                </p>
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
            {/* Chat box - always rendered to prevent flash during workspace switch */}
            <div className="flex justify-center @container pl-px">
              <SessionChatBoxContainer
                {...(isNewSessionMode && workspaceWithSession
                  ? {
                      mode: 'new-session',
                      workspaceId: workspaceWithSession.id,
                      onSelectSession,
                    }
                  : session
                    ? {
                        mode: 'existing-session',
                        session,
                        onSelectSession,
                        onStartNewSession,
                      }
                    : {
                        mode: 'placeholder',
                      })}
                sessions={sessions}
                projectId={projectId}
                filesChanged={diffStats?.filesChanged ?? 0}
                linesAdded={diffStats?.linesAdded ?? 0}
                linesRemoved={diffStats?.linesRemoved ?? 0}
                onScrollToPreviousMessage={onScrollToPreviousMessage}
                onScrollToBottom={onScrollToBottom}
              />
            </div>
          </MessageEditProvider>
        </EntriesProvider>
      </ApprovalFeedbackProvider>
      {/* Context Bar - floating toolbar */}
      {workspaceWithSession && (
        <ContextBarContainer containerRef={containerRef} />
      )}
    </main>
  );
}
