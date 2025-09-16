import { useCallback } from 'react';
import { attemptsApi, type UpdateFollowUpDraftRequest } from '@/lib/api';
import type { FollowUpDraft, ImageResponse } from 'shared/types';

type Args = {
  attemptId?: string;
  draft: FollowUpDraft | null;
  message: string;
  selectedVariant: string | null;
  images: ImageResponse[];
  suppressNextSaveRef: React.MutableRefObject<boolean>;
  lastServerVersionRef: React.MutableRefObject<number>;
};

export function useDraftQueue({
  attemptId,
  draft,
  message,
  selectedVariant,
  images,
  suppressNextSaveRef,
  lastServerVersionRef,
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
      const currentIds = images.map((img) => img.id);
      const serverIds = (draft?.image_ids as string[] | undefined) ?? [];
      const idsEqual =
        currentIds.length === serverIds.length &&
        currentIds.every((id, i) => id === serverIds[i]);
      if (!idsEqual) immediatePayload.image_ids = currentIds;
      suppressNextSaveRef.current = true;
      await attemptsApi.saveFollowUpDraft(
        attemptId,
        immediatePayload as UpdateFollowUpDraftRequest
      );
      try {
        const resp = await attemptsApi.setFollowUpQueue(attemptId, true);
        if (resp?.version !== undefined && resp?.version !== null) {
          lastServerVersionRef.current = Number(resp.version ?? 0n);
        }
        return !!resp?.queued;
      } catch {
        /* adopt server on failure */
        const latest = await attemptsApi.getFollowUpDraft(attemptId);
        suppressNextSaveRef.current = true;
        if (latest.version !== undefined && latest.version !== null) {
          lastServerVersionRef.current = Number(latest.version ?? 0n);
        }
        return !!latest?.queued;
      }
    } finally {
      // presentation-only state handled by caller
    }
    return false;
  }, [
    attemptId,
    draft?.variant,
    draft?.image_ids,
    images,
    message,
    selectedVariant,
    suppressNextSaveRef,
    lastServerVersionRef,
  ]);

  const onUnqueue = useCallback(async (): Promise<boolean> => {
    if (!attemptId) return false;
    try {
      suppressNextSaveRef.current = true;
      try {
        const resp = await attemptsApi.setFollowUpQueue(attemptId, false);
        if (resp?.version !== undefined && resp?.version !== null) {
          lastServerVersionRef.current = Number(resp.version ?? 0n);
        }
        return !!resp && !resp.queued;
      } catch {
        const latest = await attemptsApi.getFollowUpDraft(attemptId);
        suppressNextSaveRef.current = true;
        if (latest.version !== undefined && latest.version !== null) {
          lastServerVersionRef.current = Number(latest.version ?? 0n);
        }
        return !!latest && !latest.queued;
      }
    } finally {
      // presentation-only state handled by caller
    }
    return false;
  }, [attemptId, suppressNextSaveRef, lastServerVersionRef]);

  return { onQueue, onUnqueue } as const;
}
