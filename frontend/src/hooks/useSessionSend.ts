import { useCallback, useState } from 'react';
import type { ExecutorProfileId } from 'shared/types';
import { sessionsApi } from '@/lib/api';
import { useCreateSession } from './useCreateSession';

interface UseSessionSendOptions {
  /** Session ID for existing sessions */
  sessionId: string | undefined;
  /** Workspace ID for creating new sessions */
  workspaceId: string | undefined;
  /** Whether in new session mode */
  isNewSessionMode: boolean;
  /** Effective executor profile for new sessions */
  effectiveExecutorProfileId: ExecutorProfileId | null;
  /** Callback when session is selected (to exit new session mode) */
  onSelectSession?: (sessionId: string) => void;
}

interface UseSessionSendResult {
  /** Send a message. Returns true on success, false on failure. */
  send: (
    message: string,
    executorProfileId: ExecutorProfileId
  ) => Promise<boolean>;
  /** Whether a send operation is in progress */
  isSending: boolean;
  /** Error message if send failed */
  error: string | null;
  /** Clear the error */
  clearError: () => void;
}

/**
 * Hook for sending messages in SessionChatBoxContainer.
 * Handles both new session creation and existing session follow-up.
 *
 * Unlike useFollowUpSend, this hook:
 * - Takes message/executorProfileId as parameters to send() (not captured in closure)
 * - Returns boolean for success/failure (caller handles cleanup)
 * - Has no prompt composition (no conflict/review/clicked markdown)
 */
export function useSessionSend({
  sessionId,
  workspaceId,
  isNewSessionMode,
  effectiveExecutorProfileId,
  onSelectSession,
}: UseSessionSendOptions): UseSessionSendResult {
  const { mutateAsync: createSession, isPending: isCreatingSession } =
    useCreateSession();
  const [isSendingFollowUp, setIsSendingFollowUp] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = useCallback(
    async (
      message: string,
      executorProfileId: ExecutorProfileId
    ): Promise<boolean> => {
      const trimmed = message.trim();
      if (!trimmed) return false;

      setError(null);

      if (isNewSessionMode) {
        // New session flow
        if (!workspaceId || !effectiveExecutorProfileId) {
          setError('No executor selected');
          return false;
        }
        try {
          const session = await createSession({
            workspaceId,
            prompt: trimmed,
            executorProfileId: effectiveExecutorProfileId,
          });
          onSelectSession?.(session.id);
          return true;
        } catch (e: unknown) {
          const err = e as { message?: string };
          setError(
            `Failed to create session: ${err.message ?? 'Unknown error'}`
          );
          return false;
        }
      } else {
        // Existing session flow
        if (!sessionId) return false;
        setIsSendingFollowUp(true);
        try {
          await sessionsApi.followUp(sessionId, {
            prompt: trimmed,
            executor_profile_id: executorProfileId,
            retry_process_id: null,
            force_when_dirty: null,
            perform_git_reset: null,
          });
          return true;
        } catch (e: unknown) {
          const err = e as { message?: string };
          setError(`Failed to send: ${err.message ?? 'Unknown error'}`);
          return false;
        } finally {
          setIsSendingFollowUp(false);
        }
      }
    },
    [
      sessionId,
      workspaceId,
      isNewSessionMode,
      effectiveExecutorProfileId,
      createSession,
      onSelectSession,
    ]
  );

  const clearError = useCallback(() => setError(null), []);

  return {
    send,
    isSending: isSendingFollowUp || isCreatingSession,
    error,
    clearError,
  };
}
