import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { type Session, type ToolStatus } from 'shared/types';
import { useAttemptExecution } from '@/hooks/useAttemptExecution';
import { useUserSystem } from '@/components/ConfigProvider';
import { useApprovalFeedbackOptional } from '@/contexts/ApprovalFeedbackContext';
import { useMessageEditContext } from '@/contexts/MessageEditContext';
import { useEntries } from '@/contexts/EntriesContext';
import { useTodos } from '@/hooks/useTodos';
import { getLatestProfileFromProcesses } from '@/utils/executor';
import { useExecutorSelection } from '@/hooks/useExecutorSelection';
import { useSessionMessageEditor } from '@/hooks/useSessionMessageEditor';
import { useSessionQueueInteraction } from '@/hooks/useSessionQueueInteraction';
import { useSessionSend } from '@/hooks/useSessionSend';
import { useSessionAttachments } from '@/hooks/useSessionAttachments';
import { useMessageEditRetry } from '@/hooks/useMessageEditRetry';
import { useBranchStatus } from '@/hooks/useBranchStatus';
import { useApprovalMutation } from '@/hooks/useApprovalMutation';
import { workspaceSummaryKeys } from '@/components/ui-new/hooks/useWorkspaces';
import {
  SessionChatBox,
  type ExecutionStatus,
} from '../primitives/SessionChatBox';

/** Compute execution status from boolean flags */
function computeExecutionStatus(params: {
  isInFeedbackMode: boolean;
  isInEditMode: boolean;
  isStopping: boolean;
  isQueueLoading: boolean;
  isSendingFollowUp: boolean;
  isQueued: boolean;
  isAttemptRunning: boolean;
}): ExecutionStatus {
  if (params.isInFeedbackMode) return 'feedback';
  if (params.isInEditMode) return 'edit';
  if (params.isStopping) return 'stopping';
  if (params.isQueueLoading) return 'queue-loading';
  if (params.isSendingFollowUp) return 'sending';
  if (params.isQueued) return 'queued';
  if (params.isAttemptRunning) return 'running';
  return 'idle';
}

interface SessionChatBoxContainerProps {
  /** The current session */
  session?: Session;
  /** Task ID for execution tracking */
  taskId?: string;
  /** Attempt ID for branch status (required for edit mode) */
  attemptId?: string;
  /** Number of files changed in current session */
  filesChanged?: number;
  /** Number of lines added */
  linesAdded?: number;
  /** Number of lines removed */
  linesRemoved?: number;
  /** Callback to view code changes (toggle ChangesPanel) */
  onViewCode?: () => void;
  /** Available sessions for this workspace */
  sessions?: Session[];
  /** Called when a session is selected */
  onSelectSession?: (sessionId: string) => void;
  /** Project ID for file search in typeahead */
  projectId?: string;
  /** Whether user is creating a new session */
  isNewSessionMode?: boolean;
  /** Callback to start new session mode */
  onStartNewSession?: () => void;
  /** Workspace ID for creating new sessions */
  workspaceId?: string;
}

export function SessionChatBoxContainer({
  session,
  taskId,
  attemptId,
  filesChanged,
  linesAdded,
  linesRemoved,
  onViewCode,
  sessions = [],
  onSelectSession,
  projectId,
  isNewSessionMode = false,
  onStartNewSession,
  workspaceId: propWorkspaceId,
}: SessionChatBoxContainerProps) {
  const workspaceId = propWorkspaceId ?? session?.workspace_id;
  const sessionId = session?.id;
  const scratchId = isNewSessionMode ? workspaceId : sessionId;
  const queryClient = useQueryClient();

  // Execution state
  const { isAttemptRunning, stopExecution, isStopping, processes } =
    useAttemptExecution(workspaceId, taskId);

  // Approval feedback context
  const feedbackContext = useApprovalFeedbackOptional();
  const isInFeedbackMode = !!feedbackContext?.activeApproval;

  // Message edit context
  const editContext = useMessageEditContext();
  const isInEditMode = editContext.isInEditMode;

  // Detect pending approval and todos from entries
  const { entries } = useEntries();
  const { inProgressTodo } = useTodos(entries);

  // Extract pending approval metadata from entries
  const pendingApproval = useMemo(() => {
    for (const entry of entries) {
      if (entry.type !== 'NORMALIZED_ENTRY') continue;
      const entryType = entry.content.entry_type;
      if (
        entryType.type === 'tool_use' &&
        entryType.status.status === 'pending_approval'
      ) {
        const status = entryType.status as Extract<
          ToolStatus,
          { status: 'pending_approval' }
        >;
        return {
          approvalId: status.approval_id,
          timeoutAt: status.timeout_at,
          executionProcessId: entry.executionProcessId,
        };
      }
    }
    return null;
  }, [entries]);

  // Approval mutation for approve/deny actions
  const { approve, denyAsync, isApproving, isDenying, denyError } =
    useApprovalMutation();

  // Branch status for edit retry
  const { data: branchStatus } = useBranchStatus(attemptId);

  // User profiles and latest executor from processes
  const { profiles } = useUserSystem();
  const latestProfileId = useMemo(
    () => getLatestProfileFromProcesses(processes),
    [processes]
  );

  // Message editor state
  const {
    localMessage,
    setLocalMessage,
    scratchData,
    isScratchLoading,
    hasInitialValue,
    saveToScratch,
    clearDraft,
    cancelDebouncedSave,
    handleMessageChange,
  } = useSessionMessageEditor({ scratchId });

  // Ref to access current message value for attachment handler
  const localMessageRef = useRef(localMessage);
  useEffect(() => {
    localMessageRef.current = localMessage;
  }, [localMessage]);

  // Attachment handling - insert markdown when images are uploaded
  const handleInsertMarkdown = useCallback(
    (markdown: string) => {
      const currentMessage = localMessageRef.current;
      const newMessage = currentMessage.trim()
        ? `${currentMessage}\n\n${markdown}`
        : markdown;
      setLocalMessage(newMessage);
    },
    [setLocalMessage]
  );

  const { uploadFiles } = useSessionAttachments(
    workspaceId,
    handleInsertMarkdown
  );

  // Executor/variant selection
  const {
    effectiveExecutor,
    executorOptions,
    handleExecutorChange,
    selectedVariant,
    variantOptions,
    setSelectedVariant: setVariantFromHook,
  } = useExecutorSelection({
    profiles,
    latestProfileId,
    isNewSessionMode,
    scratchVariant: scratchData?.variant,
  });

  // Wrap variant change to also save to scratch
  const setSelectedVariant = useCallback(
    (variant: string | null) => {
      setVariantFromHook(variant);
      saveToScratch(localMessage, variant);
    },
    [setVariantFromHook, saveToScratch, localMessage]
  );

  // Queue interaction
  const {
    isQueued,
    queuedMessage,
    isQueueLoading,
    queueMessage,
    cancelQueue,
    refreshQueueStatus,
  } = useSessionQueueInteraction({ sessionId });

  // Send actions
  const {
    send,
    isSending,
    error: sendError,
    clearError,
  } = useSessionSend({
    sessionId,
    workspaceId,
    isNewSessionMode,
    effectiveExecutor,
    onSelectSession,
  });

  const handleSend = useCallback(async () => {
    const success = await send(localMessage, selectedVariant);
    if (success) {
      cancelDebouncedSave();
      setLocalMessage('');
      if (isNewSessionMode) await clearDraft();
    }
  }, [
    send,
    localMessage,
    selectedVariant,
    cancelDebouncedSave,
    setLocalMessage,
    isNewSessionMode,
    clearDraft,
  ]);

  // Track previous process count for queue refresh
  const prevProcessCountRef = useRef(processes.length);

  // Refresh queue status when execution stops or new process starts
  useEffect(() => {
    const prevCount = prevProcessCountRef.current;
    prevProcessCountRef.current = processes.length;

    if (!workspaceId) return;

    if (!isAttemptRunning) {
      refreshQueueStatus();
      return;
    }

    if (processes.length > prevCount) {
      refreshQueueStatus();
    }
  }, [isAttemptRunning, workspaceId, processes.length, refreshQueueStatus]);

  // Queue message handler
  const handleQueueMessage = useCallback(async () => {
    if (!localMessage.trim()) return;
    cancelDebouncedSave();
    await saveToScratch(localMessage, selectedVariant);
    await queueMessage(localMessage, selectedVariant);
  }, [
    localMessage,
    selectedVariant,
    queueMessage,
    cancelDebouncedSave,
    saveToScratch,
  ]);

  // Editor change handler
  const handleEditorChange = useCallback(
    (value: string) => {
      if (isQueued) cancelQueue();
      handleMessageChange(value, selectedVariant);
      if (sendError) clearError();
    },
    [
      isQueued,
      cancelQueue,
      handleMessageChange,
      selectedVariant,
      sendError,
      clearError,
    ]
  );

  // Handle feedback submission
  const handleSubmitFeedback = useCallback(async () => {
    if (!feedbackContext || !localMessage.trim()) return;
    try {
      await feedbackContext.submitFeedback(localMessage);
      cancelDebouncedSave();
      setLocalMessage('');
      await clearDraft();
    } catch {
      // Error is handled in context
    }
  }, [
    feedbackContext,
    localMessage,
    cancelDebouncedSave,
    setLocalMessage,
    clearDraft,
  ]);

  // Handle cancel feedback mode
  const handleCancelFeedback = useCallback(() => {
    feedbackContext?.exitFeedbackMode();
  }, [feedbackContext]);

  // Message edit retry mutation
  const editRetryMutation = useMessageEditRetry(sessionId ?? '', () => {
    // On success, clear edit mode and reset editor
    editContext.cancelEdit();
    cancelDebouncedSave();
    setLocalMessage('');
  });

  // Handle edit submission
  const handleSubmitEdit = useCallback(async () => {
    if (!editContext.activeEdit || !localMessage.trim()) return;
    editRetryMutation.mutate({
      message: localMessage,
      variant: selectedVariant,
      executionProcessId: editContext.activeEdit.processId,
      branchStatus,
      processes,
    });
  }, [
    editContext.activeEdit,
    localMessage,
    selectedVariant,
    branchStatus,
    processes,
    editRetryMutation,
  ]);

  // Handle cancel edit mode
  const handleCancelEdit = useCallback(() => {
    editContext.cancelEdit();
    setLocalMessage('');
  }, [editContext, setLocalMessage]);

  // Populate editor with original message when entering edit mode
  const prevEditRef = useRef(editContext.activeEdit);
  useEffect(() => {
    if (editContext.activeEdit && !prevEditRef.current) {
      // Just entered edit mode - populate with original message
      setLocalMessage(editContext.activeEdit.originalMessage);
    }
    prevEditRef.current = editContext.activeEdit;
  }, [editContext.activeEdit, setLocalMessage]);

  // Handle approve action
  const handleApprove = useCallback(() => {
    if (!pendingApproval) return;

    // Exit feedback mode if active
    feedbackContext?.exitFeedbackMode();

    approve({
      approvalId: pendingApproval.approvalId,
      executionProcessId: pendingApproval.executionProcessId,
    });

    // Invalidate workspace summary cache to update sidebar
    queryClient.invalidateQueries({ queryKey: workspaceSummaryKeys.all });
  }, [pendingApproval, feedbackContext, approve, queryClient]);

  // Handle request changes (deny with feedback)
  const handleRequestChanges = useCallback(async () => {
    if (!pendingApproval || !localMessage.trim()) return;

    try {
      await denyAsync({
        approvalId: pendingApproval.approvalId,
        executionProcessId: pendingApproval.executionProcessId,
        reason: localMessage.trim(),
      });
      cancelDebouncedSave();
      setLocalMessage('');
      await clearDraft();

      // Invalidate workspace summary cache to update sidebar
      queryClient.invalidateQueries({ queryKey: workspaceSummaryKeys.all });
    } catch {
      // Error is handled by mutation
    }
  }, [
    pendingApproval,
    localMessage,
    denyAsync,
    cancelDebouncedSave,
    setLocalMessage,
    clearDraft,
    queryClient,
  ]);

  // Check if approval is timed out
  const isApprovalTimedOut = pendingApproval
    ? new Date() > new Date(pendingApproval.timeoutAt)
    : false;

  // Compute execution status
  const status = computeExecutionStatus({
    isInFeedbackMode,
    isInEditMode,
    isStopping,
    isQueueLoading,
    isSendingFollowUp: isSending,
    isQueued,
    isAttemptRunning,
  });

  // Don't render if no session and not in new session mode
  if (!session && !isNewSessionMode) {
    return null;
  }

  // During loading, render with empty editor to preserve container UI
  const editorValue =
    isScratchLoading || !hasInitialValue ? '' : (queuedMessage ?? localMessage);

  return (
    <SessionChatBox
      status={status}
      projectId={projectId}
      editor={{
        value: editorValue,
        onChange: handleEditorChange,
      }}
      actions={{
        onSend: handleSend,
        onQueue: handleQueueMessage,
        onCancelQueue: cancelQueue,
        onStop: stopExecution,
        onPasteFiles: uploadFiles,
      }}
      variant={{
        selected: selectedVariant,
        options: variantOptions,
        onChange: setSelectedVariant,
      }}
      session={{
        sessions,
        selectedSessionId: sessionId,
        onSelectSession: onSelectSession ?? (() => {}),
        isNewSessionMode,
        onNewSession: onStartNewSession,
      }}
      stats={{
        filesChanged,
        linesAdded,
        linesRemoved,
        onViewCode,
      }}
      error={sendError}
      agent={latestProfileId?.executor}
      inProgressTodo={inProgressTodo}
      executor={
        isNewSessionMode
          ? {
              selected: effectiveExecutor,
              options: executorOptions,
              onChange: handleExecutorChange,
            }
          : undefined
      }
      feedbackMode={
        feedbackContext
          ? {
              isActive: isInFeedbackMode,
              onSubmitFeedback: handleSubmitFeedback,
              onCancel: handleCancelFeedback,
              isSubmitting: feedbackContext.isSubmitting,
              error: feedbackContext.error,
              isTimedOut: feedbackContext.isTimedOut,
            }
          : undefined
      }
      approvalMode={
        pendingApproval
          ? {
              isActive: true,
              onApprove: handleApprove,
              onRequestChanges: handleRequestChanges,
              isSubmitting: isApproving || isDenying,
              isTimedOut: isApprovalTimedOut,
              error: denyError?.message ?? null,
            }
          : undefined
      }
      editMode={{
        isActive: isInEditMode,
        onSubmitEdit: handleSubmitEdit,
        onCancel: handleCancelEdit,
        isSubmitting: editRetryMutation.isPending,
      }}
    />
  );
}
