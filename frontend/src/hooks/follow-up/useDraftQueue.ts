import { useCallback } from 'react';
import { attemptsApi, type UpdateFollowUpDraftRequest } from '@/lib/api';
import type { Draft } from 'shared/types';

type Args = {
  attemptId?: string;
  draft: Draft | null;
  message: string;
  selectedVariant: string | null;
};

export function useDraftQueue({
  attemptId,
  draft,
  message,
  selectedVariant,
}: Args) {
  const onQueue = useCallback(async (): Promise<boolean> => {
    if (!attemptId) return false;
    if (draft?.queued) return true;
    if (message.trim().length === 0) return false;
    try {
      const immediatePayload: Partial<UpdateFollowUpDraftRequest> = {
        prompt: message,
      };
      if ((draft?.variant ?? null) !== (selectedVariant ?? null))
        immediatePayload.variant = (selectedVariant ?? null) as string | null;
      await attemptsApi.saveDraft(
        attemptId,
        'follow_up',
        immediatePayload as UpdateFollowUpDraftRequest
      );
      const resp = await attemptsApi.setDraftQueue(attemptId, true);
      return !!resp?.queued;
    } finally {
      // presentation-only state handled by caller
    }
    return false;
  }, [attemptId, draft?.variant, draft?.queued, message, selectedVariant]);

  const onUnqueue = useCallback(async (): Promise<boolean> => {
    if (!attemptId) return false;
    try {
      const resp = await attemptsApi.setDraftQueue(attemptId, false);
      return !!resp && !resp.queued;
    } finally {
      // presentation-only state handled by caller
    }
    return false;
  }, [attemptId]);

  return { onQueue, onUnqueue } as const;
}
