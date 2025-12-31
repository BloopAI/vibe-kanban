import { useRef, useMemo, useCallback, useState } from 'react';
import type { Workspace, Session } from 'shared/types';
import type { WorkspaceWithSession } from '@/types/attempt';
import { WorkspacesMain } from '@/components/ui-new/views/WorkspacesMain';
import { useTask } from '@/hooks/useTask';
import { useOpenInEditor } from '@/hooks/useOpenInEditor';

interface WorkspacesMainContainerProps {
  selectedWorkspace: Workspace | null;
  selectedSession: Session | undefined;
  sessions: Session[];
  onSelectSession: (sessionId: string) => void;
  isLoading: boolean;
}

export function WorkspacesMainContainer({
  selectedWorkspace,
  selectedSession,
  sessions,
  onSelectSession,
  isLoading,
}: WorkspacesMainContainerProps) {
  const containerRef = useRef<HTMLElement>(null);
  const [copied, setCopied] = useState(false);

  // Fetch task to get project_id for file search
  const { data: task } = useTask(selectedWorkspace?.task_id, {
    enabled: !!selectedWorkspace?.task_id,
  });

  // Open in IDE handler
  const openInEditor = useOpenInEditor(selectedWorkspace?.id);

  const handleOpen = useCallback(() => {
    openInEditor();
  }, [openInEditor]);

  const handleCopy = useCallback(async () => {
    if (!selectedWorkspace?.container_ref) return;
    try {
      await navigator.clipboard.writeText(selectedWorkspace.container_ref);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.warn('Copy to clipboard failed:', err);
    }
  }, [selectedWorkspace?.container_ref]);

  // Create WorkspaceWithSession for ConversationList
  const workspaceWithSession: WorkspaceWithSession | undefined = useMemo(() => {
    if (!selectedWorkspace) return undefined;
    return { ...selectedWorkspace, session: selectedSession };
  }, [selectedWorkspace, selectedSession]);

  return (
    <WorkspacesMain
      selectedWorkspace={selectedWorkspace}
      selectedSession={selectedSession}
      sessions={sessions}
      onSelectSession={onSelectSession}
      isLoading={isLoading}
      containerRef={containerRef}
      workspaceWithSession={workspaceWithSession}
      projectId={task?.project_id}
      copied={copied}
      onOpen={handleOpen}
      onCopy={handleCopy}
    />
  );
}
