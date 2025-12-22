import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  ScratchType,
  type Session,
  type DraftFollowUpData,
  type ExecutorAction,
  type ExecutorProfileId,
} from 'shared/types';
import { useScratch } from '@/hooks/useScratch';
import { useFollowUpSend } from '@/hooks/useFollowUpSend';
import { useQueueStatus } from '@/hooks/useQueueStatus';
import { useAttemptExecution } from '@/hooks/useAttemptExecution';
import { useVariant } from '@/hooks/useVariant';
import { useDebouncedCallback } from '@/hooks/useDebouncedCallback';
import { useUserSystem } from '@/components/ConfigProvider';
// Note: useRetryUi and useEntries could be used to block editing during retry/approval
// import { useRetryUi } from '@/contexts/RetryUiContext';
// import { useEntries } from '@/contexts/EntriesContext';
import {
  SessionChatBox,
  type ExecutionStatus,
} from '../primitives/SessionChatBox';

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
}

export function SessionChatBoxContainer({
  session,
  taskId,
  filesChanged,
  linesAdded,
  linesRemoved,
  sessions = [],
  onSelectSession,
}: SessionChatBoxContainerProps) {
  const workspaceId = session?.workspace_id;
  const sessionId = session?.id;

  // Execution state
  const { isAttemptRunning, stopExecution, isStopping, processes } =
    useAttemptExecution(workspaceId, taskId);

  // Scratch for draft persistence
  const {
    scratch,
    updateScratch,
    isLoading: isScratchLoading,
  } = useScratch(ScratchType.DRAFT_FOLLOW_UP, sessionId ?? '');

  // Derive the message and variant from scratch
  const scratchData: DraftFollowUpData | undefined =
    scratch?.payload?.type === 'DRAFT_FOLLOW_UP'
      ? scratch.payload.data
      : undefined;

  // Local message state for immediate UI feedback
  const [localMessage, setLocalMessage] = useState('');

  // Track whether textarea is focused (for sync with scratch)
  const [isTextareaFocused] = useState(false);

  // Variant selection - derive default from latest process
  const latestProfileId = useMemo<ExecutorProfileId | null>(() => {
    if (!processes?.length) return null;

    const extractProfile = (
      action: ExecutorAction | null
    ): ExecutorProfileId | null => {
      let curr: ExecutorAction | null = action;
      while (curr) {
        const typ = curr.typ;
        switch (typ.type) {
          case 'CodingAgentInitialRequest':
          case 'CodingAgentFollowUpRequest':
            return typ.executor_profile_id;
          case 'ScriptRequest':
            curr = curr.next_action;
            continue;
        }
      }
      return null;
    };
    return (
      processes
        .slice()
        .reverse()
        .map((p) => extractProfile(p.executor_action ?? null))
        .find((pid) => pid !== null) ?? null
    );
  }, [processes]);

  const processVariant = latestProfileId?.variant ?? null;

  // Get executor profiles to extract variant options
  const { profiles } = useUserSystem();

  // Get the ExecutorConfig for the current executor
  const currentProfile = useMemo(() => {
    if (!latestProfileId) return null;
    return profiles?.[latestProfileId.executor] ?? null;
  }, [latestProfileId, profiles]);

  // Extract variant names from ExecutorConfig keys
  const variantOptions = useMemo(() => {
    if (!currentProfile) return [];
    return Object.keys(currentProfile);
  }, [currentProfile]);

  // Variant selection with priority: user selection > scratch > process
  const { selectedVariant, setSelectedVariant: setVariantFromHook } =
    useVariant({
      processVariant,
      scratchVariant: scratchData?.variant,
    });

  // Ref to track current variant for use in message save callback
  const variantRef = useRef<string | null>(selectedVariant);
  useEffect(() => {
    variantRef.current = selectedVariant;
  }, [selectedVariant]);

  // Refs to stabilize callbacks
  const scratchRef = useRef(scratch);
  useEffect(() => {
    scratchRef.current = scratch;
  }, [scratch]);

  // Save scratch helper
  const saveToScratch = useCallback(
    async (message: string, variant: string | null) => {
      if (!workspaceId) return;
      if (!message.trim() && !variant && !scratchRef.current) return;
      try {
        await updateScratch({
          payload: {
            type: 'DRAFT_FOLLOW_UP',
            data: { message, variant },
          },
        });
      } catch (e) {
        console.error('Failed to save follow-up draft', e);
      }
    },
    [workspaceId, updateScratch]
  );

  // Wrapper to update variant and save to scratch immediately
  const setSelectedVariant = useCallback(
    (variant: string | null) => {
      setVariantFromHook(variant);
      saveToScratch(localMessage, variant);
    },
    [setVariantFromHook, saveToScratch, localMessage]
  );

  // Debounced save for message changes
  const { debounced: setFollowUpMessage, cancel: cancelDebouncedSave } =
    useDebouncedCallback(
      useCallback(
        (value: string) => saveToScratch(value, variantRef.current),
        [saveToScratch]
      ),
      500
    );

  // Sync local message from scratch when it loads
  useEffect(() => {
    if (isScratchLoading) return;
    if (isTextareaFocused) return;
    setLocalMessage(scratchData?.message ?? '');
  }, [isScratchLoading, scratchData?.message, isTextareaFocused]);

  // Note: Retry/approval blocking could be added here
  // const { activeRetryProcessId } = useRetryUi();

  // Queue status
  const {
    isQueued,
    queuedMessage,
    isLoading: isQueueLoading,
    queueMessage,
    cancelQueue,
    refresh: refreshQueueStatus,
  } = useQueueStatus(sessionId);

  // Track previous process count
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
  ]);

  // Display message - show queued message if queued
  const displayMessage =
    isQueued && queuedMessage ? queuedMessage.data.message : localMessage;

  // Note: Pending approval blocking could be added here
  // const { entries } = useEntries();
  // const hasPendingApproval = entries.some(...);

  // Send follow-up action
  const { isSendingFollowUp, followUpError, setFollowUpError, onSendFollowUp } =
    useFollowUpSend({
      sessionId,
      message: localMessage,
      conflictMarkdown: null,
      reviewMarkdown: '',
      clickedMarkdown: '',
      selectedVariant,
      clearComments: () => {},
      clearClickedElements: () => {},
      onAfterSendCleanup: () => {
        cancelDebouncedSave();
        setLocalMessage('');
      },
    });

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

  // Refs for stable onChange handler
  const setFollowUpMessageRef = useRef(setFollowUpMessage);
  useEffect(() => {
    setFollowUpMessageRef.current = setFollowUpMessage;
  }, [setFollowUpMessage]);

  const followUpErrorRef = useRef(followUpError);
  useEffect(() => {
    followUpErrorRef.current = followUpError;
  }, [followUpError]);

  const isQueuedRef = useRef(isQueued);
  useEffect(() => {
    isQueuedRef.current = isQueued;
  }, [isQueued]);

  const cancelQueueRef = useRef(cancelQueue);
  useEffect(() => {
    cancelQueueRef.current = cancelQueue;
  }, [cancelQueue]);

  const queuedMessageRef = useRef(queuedMessage);
  useEffect(() => {
    queuedMessageRef.current = queuedMessage;
  }, [queuedMessage]);

  // Handle image paste/attach
  const handleAttach = useCallback(async () => {
    // This is called when user clicks attach - file selection handled in primitive
    // For now, this is a placeholder - full implementation would need file input ref
  }, []);

  // Editor change handler
  const handleEditorChange = useCallback(
    (value: string) => {
      if (isQueuedRef.current) {
        cancelQueueRef.current();
      }
      setLocalMessage(value);
      setFollowUpMessageRef.current(value);
      if (followUpErrorRef.current) setFollowUpError(null);
    },
    [setFollowUpError]
  );

  // Derive execution status from booleans
  const getExecutionStatus = (): ExecutionStatus => {
    if (isStopping) return 'stopping';
    if (isQueueLoading) return 'queue-loading';
    if (isSendingFollowUp) return 'sending';
    if (isQueued) return 'queued';
    if (isAttemptRunning) return 'running';
    return 'idle';
  };

  // Don't render if no session
  if (!session) {
    return null;
  }

  // Loading state
  if (isScratchLoading) {
    return null;
  }

  return (
    <SessionChatBox
      status={getExecutionStatus()}
      editor={{
        value: displayMessage,
        onChange: handleEditorChange,
      }}
      actions={{
        onSend: onSendFollowUp,
        onQueue: handleQueueMessage,
        onCancelQueue: cancelQueue,
        onStop: stopExecution,
        onAttach: handleAttach,
      }}
      variant={{
        selected: selectedVariant,
        options: variantOptions,
        onChange: setSelectedVariant,
      }}
      session={{
        sessions,
        selectedSessionId: sessionId,
        onSelectSession,
      }}
      stats={{
        filesChanged,
        linesAdded,
        linesRemoved,
      }}
      error={followUpError}
    />
  );
}
