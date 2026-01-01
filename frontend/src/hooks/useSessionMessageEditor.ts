import { useCallback, useEffect, useState } from 'react';
import { ScratchType, type DraftFollowUpData } from 'shared/types';
import { useScratch } from './useScratch';
import { useDebouncedCallback } from './useDebouncedCallback';

interface UseSessionMessageEditorOptions {
  /** Scratch ID (workspaceId for new session, sessionId for existing) */
  scratchId: string | undefined;
}

interface UseSessionMessageEditorResult {
  /** Current message value */
  localMessage: string;
  /** Set local message directly */
  setLocalMessage: (value: string) => void;
  /** Scratch data (message and variant) */
  scratchData: DraftFollowUpData | undefined;
  /** Whether scratch is loading */
  isScratchLoading: boolean;
  /** Save message and variant to scratch */
  saveToScratch: (message: string, variant: string | null) => Promise<void>;
  /** Delete the draft scratch */
  clearDraft: () => Promise<void>;
  /** Cancel pending debounced save */
  cancelDebouncedSave: () => void;
  /** Handle message change with debounced save */
  handleMessageChange: (value: string, currentVariant: string | null) => void;
}

/**
 * Hook to manage message editing with draft persistence.
 * Handles local state, debounced saves to scratch, and sync on load.
 */
export function useSessionMessageEditor({
  scratchId,
}: UseSessionMessageEditorOptions): UseSessionMessageEditorResult {
  const {
    scratch,
    updateScratch,
    deleteScratch,
    isLoading: isScratchLoading,
  } = useScratch(ScratchType.DRAFT_FOLLOW_UP, scratchId ?? '');

  const scratchData: DraftFollowUpData | undefined =
    scratch?.payload?.type === 'DRAFT_FOLLOW_UP'
      ? scratch.payload.data
      : undefined;

  const [localMessage, setLocalMessage] = useState('');

  const saveToScratch = useCallback(
    async (message: string, variant: string | null) => {
      if (!scratchId) return;
      try {
        await updateScratch({
          payload: {
            type: 'DRAFT_FOLLOW_UP',
            data: { message, variant },
          },
        });
      } catch (e) {
        console.error('Failed to save follow-up draft', e);
      }
    },
    [scratchId, updateScratch]
  );

  const { debounced: debouncedSave, cancel: cancelDebouncedSave } =
    useDebouncedCallback(saveToScratch, 500);

  // Sync local message from scratch when it loads
  useEffect(() => {
    if (isScratchLoading) return;
    setLocalMessage(scratchData?.message ?? '');
  }, [isScratchLoading, scratchData?.message]);

  // Handle message change with debounced save
  // Pass variant at call-time to avoid stale closure
  const handleMessageChange = useCallback(
    (value: string, currentVariant: string | null) => {
      setLocalMessage(value);
      debouncedSave(value, currentVariant);
    },
    [debouncedSave]
  );

  return {
    localMessage,
    setLocalMessage,
    scratchData,
    isScratchLoading,
    saveToScratch,
    clearDraft: deleteScratch,
    cancelDebouncedSave,
    handleMessageChange,
  };
}
