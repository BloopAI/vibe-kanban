import { useMutation, useQueryClient } from '@tanstack/react-query';
import { sessionsApi } from '@/lib/api';
import type {
  Session,
  CreateFollowUpAttempt,
  BaseCodingAgent,
  ExecutorSessionOverrides,
} from 'shared/types';

interface CreateSessionParams {
  workspaceId: string;
  prompt: string;
  variant: string | null;
  executor: BaseCodingAgent;
  sessionOverrides?: ExecutorSessionOverrides | null;
}

/**
 * Hook for creating a new session and sending the first message.
 * Uses TanStack Query mutation for proper cache management.
 */
export function useCreateSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      workspaceId,
      prompt,
      variant,
      executor,
      sessionOverrides,
    }: CreateSessionParams): Promise<Session> => {
      const session = await sessionsApi.create({
        workspace_id: workspaceId,
      });

      const body: CreateFollowUpAttempt = {
        prompt,
        executor_profile_id: { executor, variant },
        retry_process_id: null,
        force_when_dirty: null,
        perform_git_reset: null,
        ...(sessionOverrides ? { session_overrides: sessionOverrides } : {}),
      };
      await sessionsApi.followUp(session.id, body);

      return session;
    },
    onSuccess: (session) => {
      // Invalidate session queries to refresh the list
      queryClient.invalidateQueries({
        queryKey: ['workspaceSessions', session.workspace_id],
      });
    },
  });
}
