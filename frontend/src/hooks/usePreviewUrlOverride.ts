import { useCallback } from 'react';
import { useScratch } from './useScratch';
import { useDebouncedCallback } from './useDebouncedCallback';
import {
  ScratchType,
  type PreviewUrlOverrideData,
  type ScratchPayload,
} from 'shared/types';

interface UsePreviewUrlOverrideResult {
  overrideUrl: string | null;
  isLoading: boolean;
  setOverrideUrl: (url: string) => void;
  clearOverride: () => Promise<void>;
  hasOverride: boolean;
}

/**
 * Hook to manage a per-workspace preview URL override.
 * Uses the scratch system for persistence.
 */
export function usePreviewUrlOverride(
  workspaceId: string | undefined
): UsePreviewUrlOverrideResult {
  const enabled = !!workspaceId;

  const {
    scratch,
    updateScratch,
    deleteScratch,
    isLoading: isScratchLoading,
  } = useScratch(ScratchType.PREVIEW_URL_OVERRIDE, workspaceId ?? '', {
    enabled,
  });

  // Extract override URL from scratch data
  const payload = scratch?.payload as ScratchPayload | undefined;
  const scratchData: PreviewUrlOverrideData | undefined =
    payload?.type === 'PREVIEW_URL_OVERRIDE' ? payload.data : undefined;

  const overrideUrl = scratchData?.url ?? null;
  const hasOverride = overrideUrl !== null && overrideUrl.trim() !== '';

  // Debounced save to scratch
  const { debounced: debouncedSave } = useDebouncedCallback(
    async (url: string) => {
      if (!workspaceId) return;

      try {
        await updateScratch({
          payload: {
            type: 'PREVIEW_URL_OVERRIDE',
            data: { url },
          },
        });
      } catch (e) {
        console.error('[usePreviewUrlOverride] Failed to save:', e);
      }
    },
    300
  );

  const setOverrideUrl = useCallback(
    (url: string) => {
      debouncedSave(url);
    },
    [debouncedSave]
  );

  const clearOverride = useCallback(async () => {
    try {
      await deleteScratch();
    } catch (e) {
      // Ignore 404 errors when scratch doesn't exist
      console.error('[usePreviewUrlOverride] Failed to clear:', e);
    }
  }, [deleteScratch]);

  return {
    overrideUrl,
    isLoading: isScratchLoading,
    setOverrideUrl,
    clearOverride,
    hasOverride,
  };
}
