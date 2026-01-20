import { useCallback, useState } from 'react';
import { sessionsApi } from '@/lib/api';
import type { BaseCodingAgent, CreateFollowUpAttempt } from 'shared/types';
import { buildAgentPrompt } from '@/utils/promptMessage';

type Args = {
  sessionId?: string;
  message: string;
  conflictMarkdown: string | null;
  reviewMarkdown: string;
  clickedMarkdown?: string;
  executor: BaseCodingAgent | null;
  variant: string | null;
  clearComments: () => void;
  clearClickedElements?: () => void;
  onAfterSendCleanup: () => void;
};

export function useFollowUpSend({
  sessionId,
  message,
  conflictMarkdown,
  reviewMarkdown,
  clickedMarkdown,
  executor,
  variant,
  clearComments,
  clearClickedElements,
  onAfterSendCleanup,
}: Args) {
  const [isSendingFollowUp, setIsSendingFollowUp] = useState(false);
  const [followUpError, setFollowUpError] = useState<string | null>(null);

  const onSendFollowUp = useCallback(async () => {
    if (!sessionId || !executor) return;
    const extraMessage = message.trim();
    const { prompt, isSlashCommand } = buildAgentPrompt(extraMessage, [
      conflictMarkdown,
      clickedMarkdown?.trim(),
      reviewMarkdown?.trim(),
    ]);

    if (!prompt) return;
    try {
      setIsSendingFollowUp(true);
      setFollowUpError(null);
      const body: CreateFollowUpAttempt = {
        prompt: prompt,
        executor_profile_id: { executor, variant },
        retry_process_id: null,
        force_when_dirty: null,
        perform_git_reset: null,
      };
      await sessionsApi.followUp(sessionId, body);
      if (!isSlashCommand) {
        clearComments();
        clearClickedElements?.();
      }
      onAfterSendCleanup();
      // Don't call jumpToLogsTab() - preserves focus on the follow-up editor
    } catch (error: unknown) {
      const err = error as { message?: string };
      setFollowUpError(
        `Failed to start follow-up execution: ${err.message ?? 'Unknown error'}`
      );
    } finally {
      setIsSendingFollowUp(false);
    }
  }, [
    sessionId,
    message,
    conflictMarkdown,
    reviewMarkdown,
    clickedMarkdown,
    executor,
    variant,
    clearComments,
    clearClickedElements,
    onAfterSendCleanup,
  ]);

  return {
    isSendingFollowUp,
    followUpError,
    setFollowUpError,
    onSendFollowUp,
  } as const;
}
