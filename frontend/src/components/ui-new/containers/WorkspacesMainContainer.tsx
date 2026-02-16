import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';
import { useNavigate } from 'react-router-dom';
import type { Workspace, Session } from 'shared/types';
import { createWorkspaceWithSession } from '@/types/attempt';
import {
  WorkspacesMain,
  type ConversationListHandle,
} from '@/components/ui-new/views/WorkspacesMain';
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
  /** Whether the workspace fetch failed (e.g. 404) */
  isError: boolean;
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
    isError,
    isNewSessionMode,
    onStartNewSession,
  },
  ref
) {
  const { diffStats } = useWorkspaceContext();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLElement>(null);
  const conversationListRef = useRef<ConversationListHandle>(null);

  // Create WorkspaceWithSession for ConversationList
  const workspaceWithSession = useMemo(() => {
    if (!selectedWorkspace) return undefined;
    return createWorkspaceWithSession(selectedWorkspace, selectedSession);
  }, [selectedWorkspace, selectedSession]);

  const handleGoToWorkspaces = useCallback(() => {
    navigate('/workspaces');
  }, [navigate]);

  const handleScrollToPreviousMessage = useCallback(() => {
    conversationListRef.current?.scrollToPreviousUserMessage();
  }, []);

  const handleScrollToBottom = useCallback(() => {
    conversationListRef.current?.scrollToBottom();
  }, []);

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
    <WorkspacesMain
      conversationListRef={conversationListRef}
      workspaceWithSession={workspaceWithSession}
      sessions={sessions}
      onSelectSession={onSelectSession}
      isLoading={isLoading}
      isError={isError}
      onGoToWorkspaces={handleGoToWorkspaces}
      containerRef={containerRef}
      isNewSessionMode={isNewSessionMode}
      onStartNewSession={onStartNewSession}
      diffStats={{
        filesChanged: diffStats.files_changed,
        linesAdded: diffStats.lines_added,
        linesRemoved: diffStats.lines_removed,
      }}
      onScrollToPreviousMessage={handleScrollToPreviousMessage}
      onScrollToBottom={handleScrollToBottom}
    />
  );
});
