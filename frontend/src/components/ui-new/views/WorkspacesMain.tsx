import { useRef, useMemo } from 'react';
import type { Workspace, Session } from 'shared/types';
import type { WorkspaceWithSession } from '@/types/attempt';
import { SessionChatBoxContainer } from '@/components/ui-new/containers/SessionChatBoxContainer';
import { ContextBar } from '@/components/ui-new/primitives/ContextBar';
import { ConversationList } from '../ConversationList';
import { EntriesProvider } from '@/contexts/EntriesContext';
import { RetryUiProvider } from '@/contexts/RetryUiContext';
import { useTask } from '@/hooks/useTask';

interface WorkspacesMainProps {
  selectedWorkspace: Workspace | null;
  selectedSession: Session | undefined;
  sessions: Session[];
  onSelectSession: (sessionId: string) => void;
  isLoading: boolean;
}

export function WorkspacesMain({
  selectedWorkspace,
  selectedSession,
  sessions,
  onSelectSession,
  isLoading,
}: WorkspacesMainProps) {
  const containerRef = useRef<HTMLElement>(null);

  // Fetch task to get project_id for file search
  const { data: task } = useTask(selectedWorkspace?.task_id, {
    enabled: !!selectedWorkspace?.task_id,
  });

  // Create WorkspaceWithSession for ConversationList
  const workspaceWithSession: WorkspaceWithSession | undefined = useMemo(() => {
    if (!selectedWorkspace) return undefined;
    return { ...selectedWorkspace, session: selectedSession };
  }, [selectedWorkspace, selectedSession]);

  if (isLoading) {
    return (
      <main className="flex flex-1 items-center justify-center bg-primary">
        <p className="text-low">Loading...</p>
      </main>
    );
  }

  if (!selectedWorkspace) {
    return (
      <main className="flex flex-1 items-center justify-center bg-primary">
        <p className="text-low">Select a workspace to get started</p>
      </main>
    );
  }

  return (
    <main
      ref={containerRef}
      className="relative flex flex-1 flex-col bg-primary h-full"
    >
      <div className="flex-1 min-h-0 overflow-hidden flex justify-center">
        <div className="w-chat max-w-full h-full">
          {workspaceWithSession && (
            <EntriesProvider
              key={`${selectedWorkspace.id}-${selectedSession?.id}`}
            >
              <RetryUiProvider attemptId={selectedWorkspace.id}>
                <ConversationList attempt={workspaceWithSession} />
              </RetryUiProvider>
            </EntriesProvider>
          )}
        </div>
      </div>
      {/* Chat box centered at bottom */}
      <div className="flex justify-center @container">
        <SessionChatBoxContainer
          session={selectedSession}
          sessions={sessions}
          onSelectSession={onSelectSession}
          filesChanged={19}
          linesAdded={10}
          linesRemoved={3}
          projectId={task?.project_id}
        />
      </div>
      {/* Context Bar - floating toolbar */}
      <ContextBar containerRef={containerRef} />
    </main>
  );
}
