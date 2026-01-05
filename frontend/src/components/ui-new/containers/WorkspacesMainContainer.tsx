import { useRef, useMemo, useCallback, useState, useEffect } from 'react';
import type { Workspace, Session } from 'shared/types';
import { createWorkspaceWithSession } from '@/types/attempt';
import { WorkspacesMain } from '@/components/ui-new/views/WorkspacesMain';
import { useTask } from '@/hooks/useTask';
import { useOpenInEditor } from '@/hooks/useOpenInEditor';

interface DiffStats {
  filesChanged: number;
  linesAdded: number;
  linesRemoved: number;
}

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
  /** Callback to toggle changes panel */
  onViewCode?: () => void;
  /** Diff statistics from the workspace */
  diffStats?: DiffStats;
}

export function WorkspacesMainContainer({
  selectedWorkspace,
  selectedSession,
  sessions,
  onSelectSession,
  isLoading,
  isNewSessionMode,
  onStartNewSession,
  onViewCode,
  diffStats,
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
    } catch (err) {
      console.warn('Copy to clipboard failed:', err);
    }
  }, [selectedWorkspace?.container_ref]);

  // Reset copied state after 2 seconds
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

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
      copied={copied}
      onOpen={handleOpen}
      onCopy={handleCopy}
      onViewCode={onViewCode}
      isNewSessionMode={isNewSessionMode}
      onStartNewSession={onStartNewSession}
      diffStats={diffStats}
    />
  );
}
