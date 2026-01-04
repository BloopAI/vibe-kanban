import type { RefObject } from 'react';
import type { Session } from 'shared/types';
import type { WorkspaceWithSession } from '@/types/attempt';
import { SessionChatBoxContainer } from '@/components/ui-new/containers/SessionChatBoxContainer';
import { ContextBar } from '@/components/ui-new/primitives/ContextBar';
import { ConversationList } from '../ConversationList';
import { EntriesProvider } from '@/contexts/EntriesContext';
import { MessageEditProvider } from '@/contexts/MessageEditContext';
import { RetryUiProvider } from '@/contexts/RetryUiContext';
import { ApprovalFeedbackProvider } from '@/contexts/ApprovalFeedbackContext';

interface WorkspacesMainProps {
  workspaceWithSession: WorkspaceWithSession | undefined;
  sessions: Session[];
  onSelectSession: (sessionId: string) => void;
  isLoading: boolean;
  containerRef: RefObject<HTMLElement | null>;
  projectId?: string;
  copied: boolean;
  onOpen: () => void;
  onCopy: () => void;
  onViewCode?: () => void;
  /** Whether user is creating a new session */
  isNewSessionMode?: boolean;
  /** Callback to start new session mode */
  onStartNewSession?: () => void;
}

export function WorkspacesMain({
  workspaceWithSession,
  sessions,
  onSelectSession,
  isLoading,
  containerRef,
  projectId,
  copied,
  onOpen,
  onCopy,
  onViewCode,
  isNewSessionMode,
  onStartNewSession,
}: WorkspacesMainProps) {
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
                <p className="text-low">Loading...</p>
              </div>
            ) : !workspaceWithSession ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-low">Select a workspace to get started</p>
              </div>
            ) : (
              <div className="flex-1 min-h-0 overflow-hidden flex justify-center">
                <div className="w-chat max-w-full h-full">
                  <RetryUiProvider attemptId={workspaceWithSession.id}>
                    <ConversationList attempt={workspaceWithSession} />
                  </RetryUiProvider>
                </div>
              </div>
            )}
            {/* Chat box - always rendered to prevent flash during workspace switch */}
            <div className="flex justify-center @container pl-px">
              <SessionChatBoxContainer
                session={session}
                sessions={sessions}
                onSelectSession={onSelectSession}
                filesChanged={19}
                linesAdded={10}
                linesRemoved={3}
                projectId={projectId}
                isNewSessionMode={isNewSessionMode}
                onStartNewSession={onStartNewSession}
                workspaceId={workspaceWithSession?.id}
              />
            </div>
          </MessageEditProvider>
        </EntriesProvider>
      </ApprovalFeedbackProvider>
      {/* Context Bar - floating toolbar */}
      {workspaceWithSession && (
        <ContextBar
          containerRef={containerRef}
          copied={copied}
          onOpen={onOpen}
          onCopy={onCopy}
          onViewCode={onViewCode}
          attemptId={workspaceWithSession.id}
        />
      )}
    </main>
  );
}
