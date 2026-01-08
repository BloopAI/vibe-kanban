import { useCallback, useState } from 'react';
import { sessionsApi, tagsApi } from '@/lib/api';
import type { CreateFollowUpAttempt } from 'shared/types';
import { expandTagCommands } from '@/lib/tagExpansion';

type Args = {
  sessionId?: string;
  message: string;
  conflictMarkdown: string | null;
  reviewMarkdown: string;
  clickedMarkdown?: string;
  selectedVariant: string | null;
  clearComments: () => void;
  clearClickedElements?: () => void;
  onAfterSendCleanup: () => void;
  expandTags?: boolean; // Enable tag command expansion
};

export function useFollowUpSend({
  sessionId,
  message,
  conflictMarkdown,
  reviewMarkdown,
  clickedMarkdown,
  selectedVariant,
  clearComments,
  clearClickedElements,
  onAfterSendCleanup,
  expandTags = false,
}: Args) {
  const [isSendingFollowUp, setIsSendingFollowUp] = useState(false);
  const [followUpError, setFollowUpError] = useState<string | null>(null);

  const onSendFollowUp = useCallback(async () => {
    if (!sessionId) return;
    
    // Expand tag commands if enabled
    let processedMessage = message.trim();
    if (expandTags && processedMessage) {
      try {
        const tags = await tagsApi.list();
        processedMessage = await expandTagCommands(processedMessage, tags);
      } catch (error) {
        console.error('Failed to expand tag commands:', error);
        // Continue with unexpanded message if expansion fails
      }
    }
    
    const finalPrompt = [
      conflictMarkdown,
      clickedMarkdown?.trim(),
      reviewMarkdown?.trim(),
      processedMessage,
    ]
      .filter(Boolean)
      .join('\n\n');
    if (!finalPrompt) return;
    try {
      setIsSendingFollowUp(true);
      setFollowUpError(null);
      const body: CreateFollowUpAttempt = {
        prompt: finalPrompt,
        variant: selectedVariant,
        retry_process_id: null,
        force_when_dirty: null,
        perform_git_reset: null,
      };
      await sessionsApi.followUp(sessionId, body);
      clearComments();
      clearClickedElements?.();
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
    selectedVariant,
    clearComments,
    clearClickedElements,
    onAfterSendCleanup,
    expandTags,
  ]);

  return {
    isSendingFollowUp,
    followUpError,
    setFollowUpError,
    onSendFollowUp,
  } as const;
}
