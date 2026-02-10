import { useCallback, useMemo, useRef, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowsOutIcon, XIcon } from '@phosphor-icons/react';
import { useProjectContext } from '@/contexts/remote/ProjectContext';
import { useUserContext } from '@/contexts/remote/UserContext';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { ExecutionProcessesProvider } from '@/contexts/ExecutionProcessesContext';
import { ApprovalFeedbackProvider } from '@/contexts/ApprovalFeedbackContext';
import { EntriesProvider } from '@/contexts/EntriesContext';
import { MessageEditProvider } from '@/contexts/MessageEditContext';
import { CreateModeProvider } from '@/contexts/CreateModeContext';
import { useWorkspaceSessions } from '@/hooks/useWorkspaceSessions';
import { useAttempt } from '@/hooks/useAttempt';
import { useKanbanNavigation } from '@/hooks/useKanbanNavigation';
import { SessionChatBoxContainer } from '@/components/ui-new/containers/SessionChatBoxContainer';
import { CreateChatBoxContainer } from '@/components/ui-new/containers/CreateChatBoxContainer';
import { KanbanIssuePanelContainer } from '@/components/ui-new/containers/KanbanIssuePanelContainer';
import {
  ConversationList,
  type ConversationListHandle,
} from '@/components/ui-new/containers/ConversationListContainer';
import { RetryUiProvider } from '@/contexts/RetryUiContext';
import { createWorkspaceWithSession } from '@/types/attempt';

interface WorkspaceSessionPanelProps {
  workspaceId: string;
  onClose: () => void;
}

interface WorkspaceCreatePanelProps {
  linkedIssueId: string | null;
  linkedIssueSimpleId: string | null;
  onOpenIssue: (issueId: string) => void;
  onClose: () => void;
  children: ReactNode;
}

function WorkspaceCreatePanel({
  linkedIssueId,
  linkedIssueSimpleId,
  onOpenIssue,
  onClose,
  children,
}: WorkspaceCreatePanelProps) {
  const { t } = useTranslation('tasks');
  const breadcrumbButtonClass =
    'min-w-0 text-sm text-normal truncate rounded-sm px-1 py-0.5 hover:bg-panel hover:text-high transition-colors';

  const handleOpenIssue = useCallback(() => {
    if (linkedIssueId) {
      onOpenIssue(linkedIssueId);
      return;
    }
    onClose();
  }, [linkedIssueId, onOpenIssue, onClose]);

  return (
    <div className="relative flex h-full flex-1 flex-col bg-primary">
      <div className="flex items-center justify-between px-base py-half border-b shrink-0">
        <div className="flex items-center gap-half min-w-0 font-ibm-plex-mono">
          <button
            type="button"
            onClick={handleOpenIssue}
            className={`${breadcrumbButtonClass} shrink-0`}
            aria-label="Open linked issue"
          >
            {linkedIssueSimpleId ?? 'Issue'}
          </button>
          <span className="text-low text-sm shrink-0">/</span>
          <span className={breadcrumbButtonClass}>
            {t('createWorkspaceFromPr.createWorkspace')}
          </span>
        </div>
        <div className="flex items-center gap-half">
          <button
            type="button"
            onClick={onClose}
            className="p-half rounded-sm text-low hover:text-normal hover:bg-panel transition-colors"
            aria-label="Close create workspace view"
          >
            <XIcon className="size-icon-sm" weight="bold" />
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  );
}

function WorkspaceSessionPanel({
  workspaceId,
  onClose,
}: WorkspaceSessionPanelProps) {
  const navigate = useNavigate();
  const { issueId: routeIssueId, openIssue } = useKanbanNavigation();
  const { projectId, getIssue } = useProjectContext();
  const { workspaces: remoteWorkspaces } = useUserContext();
  const { activeWorkspaces, archivedWorkspaces } = useWorkspaceContext();
  const conversationListRef = useRef<ConversationListHandle>(null);
  const { data: workspace, isLoading: isWorkspaceLoading } = useAttempt(
    workspaceId,
    { enabled: !!workspaceId }
  );
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

  const linkedWorkspace = useMemo(
    () =>
      remoteWorkspaces.find(
        (ws) =>
          ws.local_workspace_id === workspaceId && ws.project_id === projectId
      ) ?? null,
    [remoteWorkspaces, workspaceId, projectId]
  );

  const linkedIssueId = linkedWorkspace?.issue_id ?? null;
  const breadcrumbIssueId = routeIssueId ?? linkedIssueId;

  const issueSimpleId = useMemo(() => {
    if (!breadcrumbIssueId) return null;
    return getIssue(breadcrumbIssueId)?.simple_id ?? null;
  }, [breadcrumbIssueId, getIssue]);

  const workspaceBranch = workspace?.branch ?? workspaceSummary?.branch ?? null;

  const handleOpenIssuePanel = useCallback(() => {
    if (breadcrumbIssueId) {
      openIssue(breadcrumbIssueId);
      return;
    }
    onClose();
  }, [breadcrumbIssueId, openIssue, onClose]);

  const handleOpenWorkspaceView = useCallback(() => {
    navigate(`/workspaces/${workspaceId}`);
  }, [navigate, workspaceId]);

  const breadcrumbButtonClass =
    'min-w-0 text-sm text-normal truncate rounded-sm px-1 py-0.5 hover:bg-panel hover:text-high transition-colors';

  const workspaceWithSession = useMemo(() => {
    if (!workspace) return undefined;
    return createWorkspaceWithSession(workspace, selectedSession);
  }, [workspace, selectedSession]);

  const handleScrollToPreviousMessage = useCallback(() => {
    conversationListRef.current?.scrollToPreviousUserMessage();
  }, []);

  const handleScrollToBottom = useCallback(() => {
    conversationListRef.current?.scrollToBottom();
  }, []);

  return (
    <ExecutionProcessesProvider
      attemptId={workspaceId}
      sessionId={selectedSessionId}
    >
      <ApprovalFeedbackProvider>
        <EntriesProvider key={`${workspaceId}-${selectedSessionId ?? 'new'}`}>
          <MessageEditProvider>
            <div className="relative flex h-full flex-1 flex-col bg-primary">
              <div className="flex items-center justify-between px-base py-half border-b shrink-0">
                <div className="flex items-center gap-half min-w-0 font-ibm-plex-mono">
                  <button
                    type="button"
                    onClick={handleOpenIssuePanel}
                    className={`${breadcrumbButtonClass} shrink-0`}
                    aria-label="Open linked issue"
                  >
                    {issueSimpleId ?? 'Issue'}
                  </button>
                  <span className="text-low text-sm shrink-0">/</span>
                  <button
                    type="button"
                    onClick={handleOpenWorkspaceView}
                    className={breadcrumbButtonClass}
                    aria-label="Open workspace"
                  >
                    {workspaceBranch ?? 'Workspace'}
                  </button>
                </div>

                <div className="flex items-center gap-half">
                  <button
                    type="button"
                    onClick={handleOpenWorkspaceView}
                    className="p-half rounded-sm text-low hover:text-normal hover:bg-panel transition-colors"
                    aria-label="Open in workspace view"
                  >
                    <ArrowsOutIcon className="size-icon-sm" weight="bold" />
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="p-half rounded-sm text-low hover:text-normal hover:bg-panel transition-colors"
                    aria-label="Close conversation view"
                  >
                    <XIcon className="size-icon-sm" weight="bold" />
                  </button>
                </div>
              </div>

              {workspaceWithSession ? (
                <div className="flex flex-1 min-h-0 overflow-hidden justify-center">
                  <div className="w-chat max-w-full h-full">
                    <RetryUiProvider attemptId={workspaceWithSession.id}>
                      <ConversationList
                        ref={conversationListRef}
                        attempt={workspaceWithSession}
                      />
                    </RetryUiProvider>
                  </div>
                </div>
              ) : (
                <div className="flex-1" />
              )}

              <div className="flex justify-center @container pl-px">
                <SessionChatBoxContainer
                  {...(isSessionsLoading || isWorkspaceLoading
                    ? {
                        mode: 'placeholder' as const,
                      }
                    : isNewSessionMode
                      ? {
                          mode: 'new-session' as const,
                          workspaceId,
                          onSelectSession: selectSession,
                        }
                      : selectedSession
                        ? {
                            mode: 'existing-session' as const,
                            session: selectedSession,
                            onSelectSession: selectSession,
                            onStartNewSession: startNewSession,
                          }
                        : {
                            mode: 'placeholder' as const,
                          })}
                  sessions={sessions}
                  projectId={projectId}
                  filesChanged={workspaceSummary?.filesChanged ?? 0}
                  linesAdded={workspaceSummary?.linesAdded ?? 0}
                  linesRemoved={workspaceSummary?.linesRemoved ?? 0}
                  disableViewCode
                  showOpenWorkspaceButton
                  onScrollToPreviousMessage={handleScrollToPreviousMessage}
                  onScrollToBottom={handleScrollToBottom}
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
  const navigate = useNavigate();
  const { getIssue } = useProjectContext();
  const {
    issueId,
    workspaceId,
    draftId,
    isWorkspaceCreateMode,
    openIssue,
    openIssueWorkspace,
    closePanel,
  } = useKanbanNavigation();

  const handleOpenIssueFromCreate = useCallback(
    (targetIssueId: string) => {
      openIssue(targetIssueId);
    },
    [openIssue]
  );

  const handleWorkspaceCreated = useCallback(
    (createdWorkspaceId: string) => {
      if (issueId) {
        openIssueWorkspace(issueId, createdWorkspaceId);
        return;
      }

      navigate(`/workspaces/${createdWorkspaceId}`);
    },
    [issueId, openIssueWorkspace, navigate]
  );

  if (isWorkspaceCreateMode && draftId) {
    const linkedIssueId = issueId;
    const linkedIssueSimpleId = linkedIssueId
      ? (getIssue(linkedIssueId)?.simple_id ?? null)
      : null;

    return (
      <WorkspaceCreatePanel
        linkedIssueId={linkedIssueId}
        linkedIssueSimpleId={linkedIssueSimpleId}
        onOpenIssue={handleOpenIssueFromCreate}
        onClose={closePanel}
      >
        <CreateModeProvider key={draftId} draftId={draftId}>
          <CreateChatBoxContainer onWorkspaceCreated={handleWorkspaceCreated} />
        </CreateModeProvider>
      </WorkspaceCreatePanel>
    );
  }

  if (workspaceId) {
    return (
      <WorkspaceSessionPanel workspaceId={workspaceId} onClose={closePanel} />
    );
  }

  return <KanbanIssuePanelContainer />;
}
