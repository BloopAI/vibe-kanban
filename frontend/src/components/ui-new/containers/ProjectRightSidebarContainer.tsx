import { useCallback, useMemo } from 'react';
import { useProjectContext } from '@/contexts/remote/ProjectContext';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { ExecutionProcessesProvider } from '@/contexts/ExecutionProcessesContext';
import { ApprovalFeedbackProvider } from '@/contexts/ApprovalFeedbackContext';
import { EntriesProvider } from '@/contexts/EntriesContext';
import { MessageEditProvider } from '@/contexts/MessageEditContext';
import { CreateModeProvider } from '@/contexts/CreateModeContext';
import { useWorkspaceSessions } from '@/hooks/useWorkspaceSessions';
import { useProjectRightSidebar } from '@/contexts/ProjectRightSidebarContext';
import { SessionChatBoxContainer } from '@/components/ui-new/containers/SessionChatBoxContainer';
import { CreateChatBoxContainer } from '@/components/ui-new/containers/CreateChatBoxContainer';
import { KanbanIssuePanelContainer } from '@/components/ui-new/containers/KanbanIssuePanelContainer';

interface WorkspaceSessionPanelProps {
  workspaceId: string;
}

function WorkspaceSessionPanel({ workspaceId }: WorkspaceSessionPanelProps) {
  const { projectId } = useProjectContext();
  const { activeWorkspaces, archivedWorkspaces } = useWorkspaceContext();
  const {
    sessions,
    selectedSession,
    selectedSessionId,
    selectSession,
    isLoading: isSessionsLoading,
    isNewSessionMode,
    startNewSession,
  } = useWorkspaceSessions(workspaceId, { enabled: !!workspaceId });

  const workspaceSummary = useMemo(
    () =>
      [...activeWorkspaces, ...archivedWorkspaces].find(
        (workspace) => workspace.id === workspaceId
      ),
    [activeWorkspaces, archivedWorkspaces, workspaceId]
  );

  const handleNoop = useCallback(() => {}, []);

  const modeProps = useMemo(() => {
    if (isSessionsLoading) {
      return { mode: 'placeholder' as const };
    }
    if (isNewSessionMode) {
      return {
        mode: 'new-session' as const,
        workspaceId,
        onSelectSession: selectSession,
      };
    }
    if (selectedSession) {
      return {
        mode: 'existing-session' as const,
        session: selectedSession,
        onSelectSession: selectSession,
        onStartNewSession: startNewSession,
      };
    }
    return { mode: 'placeholder' as const };
  }, [
    isSessionsLoading,
    isNewSessionMode,
    workspaceId,
    selectSession,
    selectedSession,
    startNewSession,
  ]);

  return (
    <ExecutionProcessesProvider
      attemptId={workspaceId}
      sessionId={selectedSessionId}
    >
      <ApprovalFeedbackProvider>
        <EntriesProvider key={`${workspaceId}-${selectedSessionId ?? 'new'}`}>
          <MessageEditProvider>
            <div className="flex h-full flex-col bg-primary">
              <div className="mt-auto @container">
                <SessionChatBoxContainer
                  {...modeProps}
                  sessions={sessions}
                  projectId={projectId}
                  filesChanged={workspaceSummary?.filesChanged ?? 0}
                  linesAdded={workspaceSummary?.linesAdded ?? 0}
                  linesRemoved={workspaceSummary?.linesRemoved ?? 0}
                  disableViewCode
                  onScrollToPreviousMessage={handleNoop}
                  onScrollToBottom={handleNoop}
                />
              </div>
            </div>
          </MessageEditProvider>
        </EntriesProvider>
      </ApprovalFeedbackProvider>
    </ExecutionProcessesProvider>
  );
}

export function ProjectRightSidebarContainer() {
  const { mode, openWorkspaceSession } = useProjectRightSidebar();

  if (mode.type === 'workspace-create') {
    return (
      <CreateModeProvider
        key={mode.instanceId}
        initialState={mode.initialState}
      >
        <CreateChatBoxContainer onWorkspaceCreated={openWorkspaceSession} />
      </CreateModeProvider>
    );
  }

  if (mode.type === 'workspace-session') {
    return <WorkspaceSessionPanel workspaceId={mode.workspaceId} />;
  }

  return <KanbanIssuePanelContainer />;
}
