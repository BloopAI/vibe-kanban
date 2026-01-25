import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useDropzone } from 'react-dropzone';
import {
  type Session,
  type ToolStatus,
  type BaseCodingAgent,
} from 'shared/types';
import { useAttemptExecution } from '@/hooks/useAttemptExecution';
import { useExecutionProcesses } from '@/hooks/useExecutionProcesses';
import { useUserSystem } from '@/components/ConfigProvider';
import { useApprovalFeedbackOptional } from '@/contexts/ApprovalFeedbackContext';
import { useMessageEditContext } from '@/contexts/MessageEditContext';
import { useEntries, useTokenUsage } from '@/contexts/EntriesContext';
import { useReviewOptional } from '@/contexts/ReviewProvider';
import { useActions } from '@/contexts/ActionsContext';
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
import { buildAgentPrompt } from '@/utils/promptMessage';
import {
  SessionChatBox,
  type ExecutionStatus,
} from '../primitives/SessionChatBox';
import {
  useWorkspacePanelState,
  RIGHT_MAIN_PANEL_MODES,
} from '@/stores/useUiPreferencesStore';
import { Actions, type ActionDefinition } from '../actions';
import {
  isActionVisible,
  useActionVisibilityContext,
} from '../actions/useActionVisibility';

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

/** Shared props across all modes */
interface SharedProps {
  /** Available sessions for this workspace */
  sessions: Session[];
  /** Project ID for file search in typeahead */
  projectId: string | undefined;
  /** Number of files changed in current session */
  filesChanged: number;
  /** Number of lines added */
  linesAdded: number;
  /** Number of lines removed */
  linesRemoved: number;
  /** Callback to scroll to previous user message */
  onScrollToPreviousMessage: () => void;
  /** Callback to scroll to bottom of conversation */
  onScrollToBottom: () => void;
}

/** Props for existing session mode */
interface ExistingSessionProps extends SharedProps {
  mode: 'existing-session';
  /** The current session */
  session: Session;
  /** Called when a session is selected */
  onSelectSession: (sessionId: string) => void;
  /** Callback to start new session mode */
  onStartNewSession: (() => void) | undefined;
}

/** Props for new session mode */
interface NewSessionProps extends SharedProps {
  mode: 'new-session';
  /** Workspace ID for creating new sessions */
  workspaceId: string;
  /** Called when a session is selected */
  onSelectSession: (sessionId: string) => void;
}

/** Props for placeholder mode (no workspace selected) */
interface PlaceholderProps extends SharedProps {
  mode: 'placeholder';
}

type SessionChatBoxContainerProps =
  | ExistingSessionProps
  | NewSessionProps
  | PlaceholderProps;

export function SessionChatBoxContainer(props: SessionChatBoxContainerProps) {
  const {
    mode,
    sessions,
    projectId,
    filesChanged,
    linesAdded,
    linesRemoved,
    onScrollToPreviousMessage,
    onScrollToBottom,
  } = props;

  // Extract mode-specific values
  const session = mode === 'existing-session' ? props.session : undefined;
  const workspaceId =
    mode === 'existing-session'
      ? props.session.workspace_id
      : mode === 'new-session'
        ? props.workspaceId
        : undefined;
  const isNewSessionMode = mode === 'new-session';
  const onSelectSession =
    mode === 'placeholder' ? undefined : props.onSelectSession;
  const onStartNewSession =
    mode === 'existing-session' ? props.onStartNewSession : undefined;

  const sessionId = session?.id;
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { executeAction } = useActions();
  const actionCtx = useActionVisibilityContext();
  const { rightMainPanelMode, setRightMainPanelMode } =
    useWorkspacePanelState(workspaceId);

  const handleViewCode = useCallback(() => {
    setRightMainPanelMode(
      rightMainPanelMode === RIGHT_MAIN_PANEL_MODES.CHANGES
        ? null
        : RIGHT_MAIN_PANEL_MODES.CHANGES
    );
  }, [rightMainPanelMode, setRightMainPanelMode]);

  // Get entries early to extract pending approval for scratch key
  const { entries } = useEntries();
  const tokenUsageInfo = useTokenUsage();

  // Extract pending approval metadata from entries (needed for scratchId)
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

  // Use approval_id as scratch key when pending approval exists to avoid
  // prefilling approval response with queued follow-up message
  const scratchId = useMemo(() => {
    if (pendingApproval?.approvalId) {
      return pendingApproval.approvalId;
    }
    return isNewSessionMode ? workspaceId : sessionId;
  }, [pendingApproval?.approvalId, isNewSessionMode, workspaceId, sessionId]);

  // Execution state
  const { isAttemptRunning, stopExecution, isStopping, processes } =
    useAttemptExecution(workspaceId);

  // Approval feedback context
  const feedbackContext = useApprovalFeedbackOptional();
  const isInFeedbackMode = !!feedbackContext?.activeApproval;

  // Message edit context
  const editContext = useMessageEditContext();
  const isInEditMode = editContext.isInEditMode;

  // Get todos from entries
  const { todos, inProgressTodo } = useTodos(entries);

  // Review comments context (optional - only available when ReviewProvider wraps this)
  const reviewContext = useReviewOptional();
  const reviewMarkdown = useMemo(
    () => reviewContext?.generateReviewMarkdown() ?? '',
    [reviewContext]
  );
  const hasReviewComments = (reviewContext?.comments.length ?? 0) > 0;

  // Approval mutation for approve/deny actions
  const { approveAsync, denyAsync, isApproving, isDenying, denyError } =
    useApprovalMutation();

  // Branch status for edit retry and conflict detection
  const { data: branchStatus } = useBranchStatus(workspaceId);

  // Derive conflict state from branch status
  const hasConflicts = useMemo(() => {
    return (
      branchStatus?.some((r) => (r.conflicted_files?.length ?? 0) > 0) ?? false
    );
  }, [branchStatus]);

  const conflictedFilesCount = useMemo(() => {
    return (
      branchStatus?.reduce(
        (sum, r) => sum + (r.conflicted_files?.length ?? 0),
        0
      ) ?? 0
    );
  }, [branchStatus]);

  // User profiles, config preference, and latest executor from processes
  const { profiles, config } = useUserSystem();

  // Fetch processes from last session to get full profile (only in new session mode)
  const lastSessionId = isNewSessionMode ? sessions?.[0]?.id : undefined;
  const { executionProcesses: lastSessionProcesses } =
    useExecutionProcesses(lastSessionId);

  // Compute latestProfileId: current processes > last session processes > session metadata
  const latestProfileId = useMemo(() => {
    // Current session's processes take priority
    const fromProcesses = getLatestProfileFromProcesses(processes);
    if (fromProcesses) return fromProcesses;

    // Try full profile from last session's processes (includes variant)
    const fromLastSession = getLatestProfileFromProcesses(lastSessionProcesses);
    if (fromLastSession) return fromLastSession;

    // Fallback: just executor from session metadata, no variant
    const lastSessionExecutor = sessions?.[0]?.executor;
    if (lastSessionExecutor) {
      return {
        executor: lastSessionExecutor as BaseCodingAgent,
        variant: null,
      };
    }

    return null;
  }, [processes, lastSessionProcesses, sessions]);

  const needsExecutorSelection =
    isNewSessionMode || (!session?.executor && !latestProfileId?.executor);

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

  const { uploadFiles, localImages, clearUploadedImages } =
    useSessionAttachments(workspaceId, handleInsertMarkdown);

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const imageFiles = acceptedFiles.filter((f) =>
        f.type.startsWith('image/')
      );
      if (imageFiles.length > 0) {
        uploadFiles(imageFiles);
      }
    },
    [uploadFiles]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': [] },
    disabled: mode === 'placeholder' || isAttemptRunning,
    noClick: true,
    noKeyboard: true,
  });

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
    scratchVariant: scratchData?.executor_profile_id?.variant,
    configExecutorProfile: config?.executor_profile,
  });

  // Wrap variant change to also save to scratch
  const setSelectedVariant = useCallback(
    (variant: string | null) => {
      setVariantFromHook(variant);
      if (effectiveExecutor) {
        saveToScratch(localMessage, { executor: effectiveExecutor, variant });
      }
    },
    [setVariantFromHook, saveToScratch, localMessage, effectiveExecutor]
  );

  // Navigate to agent settings to customise variants
  const handleCustomise = useCallback(() => {
    navigate('/settings/agents');
  }, [navigate]);

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
    const { prompt, isSlashCommand } = buildAgentPrompt(localMessage, [
      reviewMarkdown,
    ]);

    const success = await send(prompt, selectedVariant);
    if (success) {
      cancelDebouncedSave();
      setLocalMessage('');
      clearUploadedImages();
      if (isNewSessionMode) await clearDraft();
      if (!isSlashCommand) {
        reviewContext?.clearComments();
      }
      onScrollToBottom();
    }
  }, [
    send,
    localMessage,
    reviewMarkdown,
    selectedVariant,
    cancelDebouncedSave,
    setLocalMessage,
    clearUploadedImages,
    isNewSessionMode,
    clearDraft,
    reviewContext,
    onScrollToBottom,
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
    // Allow queueing if there's a message OR review comments, and we have an executor
    if ((!localMessage.trim() && !reviewMarkdown) || !effectiveExecutor) return;

    const { prompt } = buildAgentPrompt(localMessage, [reviewMarkdown]);

    cancelDebouncedSave();
    await saveToScratch(localMessage, {
      executor: effectiveExecutor,
      variant: selectedVariant,
    });
    await queueMessage(prompt, {
      executor: effectiveExecutor,
      variant: selectedVariant,
    });

    // Clear local state after queueing (same as handleSend)
    setLocalMessage('');
    clearUploadedImages();
    reviewContext?.clearComments();
  }, [
    localMessage,
    reviewMarkdown,
    effectiveExecutor,
    selectedVariant,
    queueMessage,
    cancelDebouncedSave,
    saveToScratch,
    setLocalMessage,
    clearUploadedImages,
    reviewContext,
  ]);

  // Editor change handler
  const handleEditorChange = useCallback(
    (value: string) => {
      if (isQueued) cancelQueue();
      if (effectiveExecutor) {
        handleMessageChange(value, {
          executor: effectiveExecutor,
          variant: selectedVariant,
        });
      } else {
        setLocalMessage(value);
      }
      if (sendError) clearError();
    },
    [
      isQueued,
      cancelQueue,
      handleMessageChange,
      effectiveExecutor,
      selectedVariant,
      sendError,
      clearError,
      setLocalMessage,
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

  // Handle cancel queue - restore message to editor
  const handleCancelQueue = useCallback(async () => {
    if (queuedMessage) {
      setLocalMessage(queuedMessage);
    }
    await cancelQueue();
  }, [queuedMessage, setLocalMessage, cancelQueue]);

  // Message edit retry mutation
  const editRetryMutation = useMessageEditRetry(sessionId ?? '', () => {
    // On success, clear edit mode and reset editor
    editContext.cancelEdit();
    cancelDebouncedSave();
    setLocalMessage('');
  });

  // Handle edit submission
  const handleSubmitEdit = useCallback(async () => {
    if (!editContext.activeEdit || !localMessage.trim() || !effectiveExecutor)
      return;
    editRetryMutation.mutate({
      message: localMessage,
      executor: effectiveExecutor,
      variant: selectedVariant,
      executionProcessId: editContext.activeEdit.processId,
      branchStatus,
      processes,
    });
  }, [
    editContext.activeEdit,
    localMessage,
    effectiveExecutor,
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

  // Toolbar actions handler - intercepts action execution to provide extra context
  const handleToolbarAction = useCallback(
    (action: ActionDefinition) => {
      if (action.requiresTarget && workspaceId) {
        executeAction(action, workspaceId);
      } else {
        executeAction(action);
      }
    },
    [executeAction, workspaceId]
  );

  // Define which actions appear in the toolbar
  const toolbarActionsList = useMemo(
    () =>
      [Actions.StartReview].filter((action) =>
        isActionVisible(action, actionCtx)
      ),
    [actionCtx]
  );

  // Handle approve action
  const handleApprove = useCallback(async () => {
    if (!pendingApproval) return;

    // Exit feedback mode if active
    feedbackContext?.exitFeedbackMode();

    try {
      await approveAsync({
        approvalId: pendingApproval.approvalId,
        executionProcessId: pendingApproval.executionProcessId,
      });

      // Invalidate workspace summary cache to update sidebar
      queryClient.invalidateQueries({ queryKey: workspaceSummaryKeys.all });
    } catch {
      // Error is handled by mutation
    }
  }, [pendingApproval, feedbackContext, approveAsync, queryClient]);

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

  const status = computeExecutionStatus({
    isInFeedbackMode,
    isInEditMode,
    isStopping,
    isQueueLoading,
    isSendingFollowUp: isSending,
    isQueued,
    isAttemptRunning,
  });

  // During loading, render with empty editor to preserve container UI
  // In approval mode, don't show queued message - it's for follow-up, not approval response
  const editorValue = useMemo(() => {
    if (isScratchLoading || !hasInitialValue) return '';
    if (pendingApproval) return localMessage;
    return queuedMessage ?? localMessage;
  }, [
    isScratchLoading,
    hasInitialValue,
    pendingApproval,
    queuedMessage,
    localMessage,
  ]);

  // In placeholder mode, render a disabled version to maintain visual structure
  if (mode === 'placeholder') {
    return (
      <SessionChatBox
        status="idle"
        workspaceId={workspaceId}
        projectId={projectId}
        tokenUsageInfo={tokenUsageInfo}
        editor={{
          value: '',
          onChange: () => {},
        }}
        actions={{
          onSend: () => {},
          onQueue: () => {},
          onCancelQueue: () => {},
          onStop: () => {},
          onPasteFiles: () => {},
        }}
        session={{
          sessions: [],
          selectedSessionId: undefined,
          onSelectSession: () => {},
          isNewSessionMode: false,
          onNewSession: undefined,
        }}
        stats={{
          filesChanged: 0,
          linesAdded: 0,
          linesRemoved: 0,
        }}
        onViewCode={handleViewCode}
      />
    );
  }

  return (
    <SessionChatBox
      status={status}
      onViewCode={handleViewCode}
      onScrollToPreviousMessage={onScrollToPreviousMessage}
      workspaceId={workspaceId}
      projectId={projectId}
      tokenUsageInfo={tokenUsageInfo}
      editor={{
        value: editorValue,
        onChange: handleEditorChange,
      }}
      actions={{
        onSend: handleSend,
        onQueue: handleQueueMessage,
        onCancelQueue: handleCancelQueue,
        onStop: stopExecution,
        onPasteFiles: uploadFiles,
      }}
      variant={{
        selected: selectedVariant,
        options: variantOptions,
        onChange: setSelectedVariant,
        onCustomise: handleCustomise,
      }}
      session={{
        sessions,
        selectedSessionId: sessionId,
        onSelectSession: onSelectSession ?? (() => {}),
        isNewSessionMode: needsExecutorSelection,
        onNewSession: onStartNewSession,
      }}
      toolbarActions={{
        actions: toolbarActionsList,
        context: actionCtx,
        onExecuteAction: handleToolbarAction,
      }}
      stats={{
        filesChanged,
        linesAdded,
        linesRemoved,
        hasConflicts,
        conflictedFilesCount,
      }}
      error={sendError}
      agent={latestProfileId?.executor}
      todos={todos}
      inProgressTodo={inProgressTodo}
      executor={
        needsExecutorSelection
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
      reviewComments={
        hasReviewComments && reviewContext
          ? {
              count: reviewContext.comments.length,
              previewMarkdown: reviewMarkdown,
              onClear: reviewContext.clearComments,
            }
          : undefined
      }
      localImages={localImages}
      dropzone={{ getRootProps, getInputProps, isDragActive }}
    />
  );
}
