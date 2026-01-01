import { useCallback, useEffect, useMemo, useRef } from 'react';
import { type Session } from 'shared/types';
import { useAttemptExecution } from '@/hooks/useAttemptExecution';
import { useUserSystem } from '@/components/ConfigProvider';
import { useApprovalFeedbackOptional } from '@/contexts/ApprovalFeedbackContext';
import { getLatestProfileFromProcesses } from '@/utils/executor';
import { useExecutorSelection } from '@/hooks/useExecutorSelection';
import { useSessionMessageEditor } from '@/hooks/useSessionMessageEditor';
import { useSessionQueueInteraction } from '@/hooks/useSessionQueueInteraction';
import { useSessionSend } from '@/hooks/useSessionSend';
import {
  SessionChatBox,
  type ExecutionStatus,
} from '../primitives/SessionChatBox';

/** Compute execution status from boolean flags */
function computeExecutionStatus(params: {
  isInFeedbackMode: boolean;
  isStopping: boolean;
  isQueueLoading: boolean;
  isSendingFollowUp: boolean;
  isQueued: boolean;
  isAttemptRunning: boolean;
}): ExecutionStatus {
  if (params.isInFeedbackMode) return 'feedback';
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
  /** Number of files changed in current session */
  filesChanged?: number;
  /** Number of lines added */
  linesAdded?: number;
  /** Number of lines removed */
  linesRemoved?: number;
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
  filesChanged,
  linesAdded,
  linesRemoved,
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

  // Execution state
  const { isAttemptRunning, stopExecution, isStopping, processes } =
    useAttemptExecution(workspaceId, taskId);

  // Approval feedback context
  const feedbackContext = useApprovalFeedbackOptional();
  const isInFeedbackMode = !!feedbackContext?.activeApproval;

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
    saveToScratch,
    clearDraft,
    cancelDebouncedSave,
    handleMessageChange,
  } = useSessionMessageEditor({ scratchId });

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
      setLocalMessage(scratchData?.message ?? '');
    }
  }, [
    isAttemptRunning,
    workspaceId,
    processes.length,
    refreshQueueStatus,
    scratchData?.message,
    setLocalMessage,
  ]);

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
    } catch {
      // Error is handled in context
    }
  }, [feedbackContext, localMessage, cancelDebouncedSave, setLocalMessage]);

  // Handle cancel feedback mode
  const handleCancelFeedback = useCallback(() => {
    feedbackContext?.exitFeedbackMode();
  }, [feedbackContext]);

  // Compute execution status
  const status = computeExecutionStatus({
    isInFeedbackMode,
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

  // Loading state (only applies when we have a session)
  if (isScratchLoading && !isNewSessionMode) {
    return null;
  }

  return (
    <SessionChatBox
      status={status}
      projectId={projectId}
      editor={{
        value: queuedMessage ?? localMessage,
        onChange: handleEditorChange,
      }}
      actions={{
        onSend: handleSend,
        onQueue: handleQueueMessage,
        onCancelQueue: cancelQueue,
        onStop: stopExecution,
        onAttach: () => {},
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
      }}
      error={sendError}
      agent={latestProfileId?.executor}
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
    />
  );
}
