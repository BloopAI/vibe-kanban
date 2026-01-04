import { useMutation, useQueryClient } from '@tanstack/react-query';
import { sessionsApi } from '@/lib/api';
import type { Session, CreateFollowUpAttempt } from 'shared/types';

interface CreateSessionParams {
  workspaceId: string;
  prompt: string;
  variant: string | null;
  executor: string;
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
    }: CreateSessionParams): Promise<Session> => {
      // Step 1: Create the session with the executor
      const session = await sessionsApi.create({
        workspace_id: workspaceId,
        executor,
      });

      // Step 2: Send the first message as a follow-up
      const body: CreateFollowUpAttempt = {
        prompt,
        variant,
        retry_process_id: null,
        force_when_dirty: null,
        perform_git_reset: null,
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
