import { useRef, useMemo } from 'react';
import type { Workspace, Session } from 'shared/types';
import type { WorkspaceWithSession } from '@/types/attempt';
import { SessionChatBox } from '@/components/ui-new/primitives/SessionChatBox';
import { ContextBar } from '@/components/ui-new/primitives/ContextBar';
import { ConversationList } from '../ConversationList';
import { EntriesProvider } from '@/contexts/EntriesContext';
import { RetryUiProvider } from '@/contexts/RetryUiContext';

interface WorkspacesMainProps {
  selectedWorkspace: Workspace | null;
  selectedSession: Session | undefined;
  sessions: Session[];
  onSelectSession: (sessionId: string) => void;
  isLoading: boolean;
  chatValue: string;
  onChatChange: (value: string) => void;
  onSend: () => void;
}

export function WorkspacesMain({
  selectedWorkspace,
  selectedSession,
  sessions,
  onSelectSession,
  isLoading,
  chatValue,
  onChatChange,
  onSend,
}: WorkspacesMainProps) {
  const containerRef = useRef<HTMLElement>(null);

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
        <SessionChatBox
          filesChanged={19}
          linesAdded={10}
          linesRemoved={3}
          value={chatValue}
          onChange={onChatChange}
          onSend={onSend}
          sessions={sessions}
          selectedSessionId={selectedSession?.id}
          onSelectSession={onSelectSession}
        />
      </div>
      {/* Context Bar - floating toolbar */}
      <ContextBar containerRef={containerRef} />
    </main>
  );
}
