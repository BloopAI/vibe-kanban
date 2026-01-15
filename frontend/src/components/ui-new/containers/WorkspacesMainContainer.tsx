import { useRef, useMemo } from 'react';
import type { Workspace, Session } from 'shared/types';
import { createWorkspaceWithSession } from '@/types/attempt';
import { WorkspacesMain } from '@/components/ui-new/views/WorkspacesMain';
import { useTask } from '@/hooks/useTask';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';

interface WorkspacesMainContainerProps {
  selectedWorkspace: Workspace | null;
  selectedSession: Session | undefined;
  sessions: Session[];
  onSelectSession: (sessionId: string) => void;
  isLoading: boolean;
  /** Whether user is creating a new session */
  isNewSessionMode?: boolean;
  /** Callback to start new session mode */
  onStartNewSession?: () => void;
}

export function WorkspacesMainContainer({
  selectedWorkspace,
  selectedSession,
  sessions,
  onSelectSession,
  isLoading,
  isNewSessionMode,
  onStartNewSession,
}: WorkspacesMainContainerProps) {
  const { diffStats } = useWorkspaceContext();
  const containerRef = useRef<HTMLElement>(null);

  // Fetch task to get project_id for file search
  const { data: task } = useTask(selectedWorkspace?.task_id, {
    enabled: !!selectedWorkspace?.task_id,
  });

  // Create WorkspaceWithSession for ConversationList
  const workspaceWithSession = useMemo(() => {
    if (!selectedWorkspace) return undefined;
    return createWorkspaceWithSession(selectedWorkspace, selectedSession);
  }, [selectedWorkspace, selectedSession]);

  return (
    <WorkspacesMain
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
    />
  );
}
