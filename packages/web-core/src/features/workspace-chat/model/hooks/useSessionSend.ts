import { useCallback, useState } from 'react';
import type { ExecutorConfig } from 'shared/types';
import { cursorMcpApi, sessionsApi } from '@/shared/lib/api';
import { useCreateSession } from './useCreateSession';

interface UseSessionSendOptions {
  /** Session ID for existing sessions */
  sessionId: string | undefined;
  /** Workspace ID for creating new sessions */
  workspaceId: string | undefined;
  /** Whether in new session mode */
  isNewSessionMode: boolean;
  /** Callback when session is selected (to exit new session mode) */
  onSelectSession?: (sessionId: string) => void;
  /** Unified executor config (executor + variant + overrides) */
  executorConfig?: ExecutorConfig | null;
  /**
   * `true` if this session is bound to a Cursor MCP bridge conversation.
   * When set, send() short-circuits to `cursorMcpApi.resolve` instead of
   * `sessionsApi.followUp` — there is no real coding agent process to
   * spawn, just the in-memory rendezvous holding Cursor's
   * `wait_for_user_input` tool call open.
   *
   * Computed from the per-session cursor-mcp snapshot (presence of
   * `bridge_session_id`) rather than `session.executor`, because the
   * executor field can lag behind a fresh adoption while React Query's
   * session list is mid-refetch.
   */
  isCursorMcpSession?: boolean;
}

interface UseSessionSendResult {
  /** Send a message. Returns true on success, false on failure. */
  send: (message: string) => Promise<boolean>;
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
 * - Takes message/variant as parameters to send() (not captured in closure)
 * - Returns boolean for success/failure (caller handles cleanup)
 * - Has no prompt composition (no conflict/review/clicked markdown)
 */
export function useSessionSend({
  sessionId,
  workspaceId,
  isNewSessionMode,
  onSelectSession,
  executorConfig,
  isCursorMcpSession = false,
}: UseSessionSendOptions): UseSessionSendResult {
  const { mutateAsync: createSession, isPending: isCreatingSession } =
    useCreateSession();
  const [isSendingFollowUp, setIsSendingFollowUp] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = useCallback(
    async (message: string): Promise<boolean> => {
      const trimmed = message.trim();
      if (!trimmed) return false;

      // Cursor MCP fast path: deliver the user reply straight to the
      // in-memory rendezvous so Cursor's `wait_for_user_input` tool
      // call returns. No executor process is spawned and `executorConfig`
      // is intentionally optional here — adoption may have completed
      // before the executor metadata propagated to the session row.
      //
      // The endpoint returns `{ data: false }` when there is no
      // pending wait to resolve (Cursor hasn't called
      // `wait_for_user_input` yet, or it was cancelled). In that
      // case we keep the user's message in the editor and surface a
      // friendly error instead of silently losing it. UI-level state
      // (placeholder copy, disabled send button once we observe
      // `pendingCount === 0`) is the primary defence; this is the
      // backstop for races.
      if (isCursorMcpSession && !isNewSessionMode && sessionId) {
        setError(null);
        setIsSendingFollowUp(true);
        try {
          const resolved = await cursorMcpApi.resolve(sessionId, {
            text: trimmed,
          });
          if (!resolved) {
            setError(
              'Cursor has no pending wait to resolve — wait for the next wait_for_user_input call to reply.'
            );
            return false;
          }
          return true;
        } catch (e: unknown) {
          const err = e as { message?: string };
          setError(
            `Failed to reply to Cursor MCP: ${err.message ?? 'Unknown error'}`
          );
          return false;
        } finally {
          setIsSendingFollowUp(false);
        }
      }

      if (!executorConfig) {
        setError('No executor selected');
        return false;
      }

      setError(null);

      if (isNewSessionMode) {
        // New session flow
        if (!workspaceId) {
          setError('No workspace selected');
          return false;
        }
        try {
          const session = await createSession({
            workspaceId,
            prompt: trimmed,
            executorConfig,
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
            executor_config: executorConfig,
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
      createSession,
      onSelectSession,
      executorConfig,
      isCursorMcpSession,
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
