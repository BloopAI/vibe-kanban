import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';
import type { Workspace, Session } from 'shared/types';
import { createWorkspaceWithSession } from '@/types/attempt';
import {
  WorkspacesMain,
  type ConversationListHandle,
} from '@/components/ui-new/views/WorkspacesMain';
import { useTask } from '@/hooks/useTask';
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

  // Fetch task to get project_id for file search
  const { data: task } = useTask(selectedWorkspace?.task_id, {
    enabled: !!selectedWorkspace?.task_id,
  });

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
      containerRef={containerRef}
      projectId={task?.project_id}
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
