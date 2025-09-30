import {
  attemptsApi,
  type UpdateFollowUpDraftRequest,
  type UpdateRetryFollowUpDraftRequest,
} from '@/lib/api';
import type { Draft, DraftResponse } from 'shared/types';
import { useEffect, useRef, useState } from 'react';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'offline' | 'sent';

// Small helper to diff common draft fields
type BaseCurrent = {
  prompt: string;
  variant: string | null | undefined;
  image_ids: string[] | null | undefined;
};
type BaseServer = {
  prompt?: string | null;
  variant?: string | null;
  image_ids?: string[] | null;
} | null;
type BasePayload = {
  prompt?: string;
  variant?: string | null;
  image_ids?: string[];
};

function diffBaseDraft(current: BaseCurrent, server: BaseServer): BasePayload {
  const payload: BasePayload = {};
  const serverPrompt = (server?.prompt ?? '') || '';
  const serverVariant = server?.variant ?? null;
  const serverIds = (server?.image_ids as string[] | undefined) ?? [];

  if (current.prompt !== serverPrompt) payload.prompt = current.prompt || '';
  if ((current.variant ?? null) !== serverVariant)
    payload.variant = (current.variant ?? null) as string | null;

  const currIds = (current.image_ids as string[] | null) ?? [];
  const idsEqual =
    currIds.length === serverIds.length &&
    currIds.every((id, i) => id === serverIds[i]);
  if (!idsEqual) payload.image_ids = currIds;

  return payload;
}

function diffDraftPayload<
  TExtra extends Record<string, unknown> = Record<string, never>,
>(
  current: BaseCurrent,
  server: BaseServer,
  extra?: TExtra,
  requireBaseChange: boolean = true
): (BasePayload & TExtra) | null {
  const base = diffBaseDraft(current, server);
  const baseChanged = Object.keys(base).length > 0;
  if (!baseChanged && requireBaseChange) return null;
  return { ...(extra as object), ...base } as BasePayload & TExtra;
}

// Private core
function useDraftAutosaveCore<TServer, TCurrent, TPayload>({
  attemptId,
  serverDraft,
  current,
  isDraftSending,
  skipConditions = [],
  buildPayload,
  saveDraft,
  fetchLatest,
  debugLabel,
}: {
  attemptId?: string;
  serverDraft: TServer | null;
  current: TCurrent;
  isDraftSending: boolean;
  skipConditions?: boolean[];
  buildPayload: (
    current: TCurrent,
    serverDraft: TServer | null
  ) => TPayload | null;
  saveDraft: (attemptId: string, payload: TPayload) => Promise<unknown>;
  fetchLatest?: (attemptId: string) => Promise<unknown>;
  debugLabel?: string;
}) {
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const lastSentRef = useRef<string>('');
  const saveTimeoutRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!attemptId) return;
    if (isDraftSending) {
      if (import.meta.env.DEV)
        console.debug(`[autosave:${debugLabel}] skip: draft is sending`, {
          attemptId,
        });
      return;
    }
    if (skipConditions.some((c) => c)) {
      if (import.meta.env.DEV)
        console.debug(`[autosave:${debugLabel}] skip: skipConditions`, {
          attemptId,
          skipConditions,
        });
      return;
    }

    const doSave = async () => {
      const payload = buildPayload(current, serverDraft);
      if (!payload) {
        if (import.meta.env.DEV)
          console.debug(`[autosave:${debugLabel}] no changes`, { attemptId });
        return;
      }
      const payloadKey = JSON.stringify(payload);
      if (payloadKey === lastSentRef.current) {
        if (import.meta.env.DEV)
          console.debug(`[autosave:${debugLabel}] deduped identical payload`, {
            attemptId,
            payload,
          });
        return;
      }
      lastSentRef.current = payloadKey;

      try {
        setIsSaving(true);
        setSaveStatus(navigator.onLine ? 'saving' : 'offline');
        if (import.meta.env.DEV)
          console.debug(`[autosave:${debugLabel}] saving`, {
            attemptId,
            payload,
          });
        await saveDraft(attemptId, payload);
        setSaveStatus('saved');
        if (import.meta.env.DEV)
          console.debug(`[autosave:${debugLabel}] saved`, { attemptId });
      } catch {
        if (import.meta.env.DEV)
          console.debug(`[autosave:${debugLabel}] error -> fetchLatest`, {
            attemptId,
          });
        if (fetchLatest) {
          try {
            await fetchLatest(attemptId);
          } catch {
            /* empty */
          }
        }
        setSaveStatus(navigator.onLine ? 'idle' : 'offline');
      } finally {
        setIsSaving(false);
      }
    };

    if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = window.setTimeout(doSave, 400);
    return () => {
      if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current);
    };
  }, [
    attemptId,
    serverDraft,
    current,
    isDraftSending,
    skipConditions,
    buildPayload,
    saveDraft,
    fetchLatest,
    debugLabel,
  ]);

  return { isSaving, saveStatus } as const;
}

type DraftData = Pick<Draft, 'prompt' | 'variant' | 'image_ids'>;

type DraftArgs<TServer, TCurrent> = {
  attemptId?: string;
  serverDraft: TServer | null;
  current: TCurrent;
  isDraftSending: boolean;
  // Queue-related flags (used for follow_up; not used for retry)
  isQueuedUI?: boolean;
  isQueuing?: boolean;
  isUnqueuing?: boolean;
  // Discriminant
  draftType?: 'follow_up' | 'retry';
};

type FollowUpAutosaveArgs = DraftArgs<Draft, DraftData> & {
  draftType?: 'follow_up';
};
type RetryAutosaveArgs = DraftArgs<RetryDraftResponse, RetryDraftData> & {
  draftType: 'retry';
};

export function useDraftAutosave(
  args: FollowUpAutosaveArgs | RetryAutosaveArgs
) {
  const skipConditions =
    args.draftType === 'retry'
      ? [!args.serverDraft]
      : [!!args.isQueuing, !!args.isUnqueuing, !!args.isQueuedUI];

  return useDraftAutosaveCore<
    Draft | RetryDraftResponse,
    DraftData | RetryDraftData,
    UpdateFollowUpDraftRequest | UpdateRetryFollowUpDraftRequest
  >({
    attemptId: args.attemptId,
    serverDraft: args.serverDraft as Draft | RetryDraftResponse | null,
    current: args.current as DraftData | RetryDraftData,
    isDraftSending: args.isDraftSending,
    skipConditions,
    debugLabel: (args.draftType ?? 'follow_up') as string,
    buildPayload: (current, serverDraft) => {
      if (args.draftType === 'retry') {
        const c = current as RetryDraftData;
        const s = serverDraft as RetryDraftResponse | null;
        return diffDraftPayload(
          c,
          s,
          { retry_process_id: c.retry_process_id },
          true
        ) as UpdateRetryFollowUpDraftRequest | null;
      }
      const c = current as DraftData;
      const s = serverDraft as Draft | null;
      return diffDraftPayload(c, s) as UpdateFollowUpDraftRequest | null;
    },
    saveDraft: (id, payload) => {
      if (args.draftType === 'retry') {
        return attemptsApi.saveDraft(
          id,
          'retry',
          payload as UpdateRetryFollowUpDraftRequest
        );
      }
      return attemptsApi.saveDraft(
        id,
        'follow_up',
        payload as UpdateFollowUpDraftRequest
      );
    },
    fetchLatest: (id) => {
      if (args.draftType === 'retry') return attemptsApi.getDraft(id, 'retry');
      return attemptsApi.getDraft(id, 'follow_up');
    },
  });
}

export type RetrySaveStatus = SaveStatus;

type RetryDraftResponse = DraftResponse;

type RetryDraftData = Pick<
  DraftResponse,
  'prompt' | 'variant' | 'image_ids'
> & {
  retry_process_id: string;
};
