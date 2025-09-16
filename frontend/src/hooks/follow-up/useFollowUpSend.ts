import { useCallback, useState } from 'react';
import { attemptsApi } from '@/lib/api';
import type { ImageResponse } from 'shared/types';

type Args = {
  attemptId?: string;
  message: string;
  reviewMarkdown: string;
  selectedVariant: string | null;
  images: ImageResponse[];
  newlyUploadedImageIds: string[];
  clearComments: () => void;
  jumpToLogsTab: () => void;
  onAfterSendCleanup: () => void;
  setMessage: (v: string) => void;
};

export function useFollowUpSend({
  attemptId,
  message,
  reviewMarkdown,
  selectedVariant,
  images,
  newlyUploadedImageIds,
  clearComments,
  jumpToLogsTab,
  onAfterSendCleanup,
  setMessage,
}: Args) {
  const [isSendingFollowUp, setIsSendingFollowUp] = useState(false);
  const [followUpError, setFollowUpError] = useState<string | null>(null);

  const onSendFollowUp = useCallback(async () => {
    if (!attemptId) return;
    const extraMessage = message.trim();
    const finalPrompt = [reviewMarkdown, extraMessage]
      .filter(Boolean)
      .join('\n\n');
    if (!finalPrompt) return;
    try {
      setIsSendingFollowUp(true);
      setFollowUpError(null);
      const image_ids =
        newlyUploadedImageIds.length > 0
          ? newlyUploadedImageIds
          : images.length > 0
            ? images.map((img) => img.id)
            : null;
      await attemptsApi.followUp(attemptId, {
        prompt: finalPrompt,
        variant: selectedVariant,
        image_ids,
      });
      setMessage('');
      clearComments();
      onAfterSendCleanup();
      jumpToLogsTab();
    } catch (error: unknown) {
      const err = error as { message?: string };
      setFollowUpError(
        `Failed to start follow-up execution: ${err.message ?? 'Unknown error'}`
      );
    } finally {
      setIsSendingFollowUp(false);
    }
  }, [
    attemptId,
    message,
    reviewMarkdown,
    newlyUploadedImageIds,
    images,
    selectedVariant,
    clearComments,
    jumpToLogsTab,
    onAfterSendCleanup,
    setMessage,
  ]);

  return {
    isSendingFollowUp,
    followUpError,
    setFollowUpError,
    onSendFollowUp,
  } as const;
}
