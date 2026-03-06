import { useCallback, useMemo, useRef, useState } from 'react';
import { useScratch } from './useScratch';
import { useDebouncedCallback } from './useDebouncedCallback';
import {
  ScratchType,
  type PreviewSettingsData,
  type ScratchPayload,
} from 'shared/types';

export type ScreenSize = 'desktop' | 'mobile' | 'responsive';

export interface ResponsiveDimensions {
  width: number;
  height: number;
}

interface UsePreviewSettingsResult {
  // URL override
  overrideUrl: string | null;
  hasOverride: boolean;
  setOverrideUrl: (url: string) => void;
  clearOverride: () => Promise<void>;

  // Screen size
  screenSize: ScreenSize;
  responsiveDimensions: ResponsiveDimensions;
  setScreenSize: (size: ScreenSize) => void;
  setResponsiveDimensions: (dimensions: ResponsiveDimensions) => void;

  isLoading: boolean;
}

const DEFAULT_RESPONSIVE_DIMENSIONS: ResponsiveDimensions = {
  width: 800,
  height: 600,
};

/**
 * Hook to manage per-workspace preview settings (URL override and screen size).
 * Uses the scratch system for persistence.
 */
export function usePreviewSettings(
  workspaceId: string | undefined
): UsePreviewSettingsResult {
  const enabled = !!workspaceId;

  const {
    scratch,
    updateScratch,
    deleteScratch,
    isLoading: isScratchLoading,
  } = useScratch(ScratchType.PREVIEW_SETTINGS, workspaceId ?? '', {
    enabled,
  });

  // Extract settings from scratch data
  const payload = scratch?.payload as ScratchPayload | undefined;
  const scratchData: PreviewSettingsData | undefined =
    payload?.type === 'PREVIEW_SETTINGS' ? payload.data : undefined;

  // Optimistic local state: immediately reflects setOverrideUrl calls before
  // the debounced scratch save completes. Without this, the 300ms debounce
  // window causes hasOverride to stay false, letting effectiveUrl snap back
  // to the auto-detected URL and overwrite what the user just typed.
  const [optimisticUrl, setOptimisticUrl] = useState<string | null>(null);
  const optimisticUrlRef = useRef<string | null>(null);

  const scratchUrl = scratchData?.url ?? null;
  // Use optimistic value while it's pending; fall back to persisted scratch value
  const overrideUrl = optimisticUrl ?? scratchUrl;
  const hasOverride = overrideUrl !== null && overrideUrl.trim() !== '';

  const screenSize: ScreenSize =
    (scratchData?.screen_size as ScreenSize) ?? 'desktop';
  const responsiveDimensions: ResponsiveDimensions = useMemo(
    () => ({
      width:
        scratchData?.responsive_width ?? DEFAULT_RESPONSIVE_DIMENSIONS.width,
      height:
        scratchData?.responsive_height ?? DEFAULT_RESPONSIVE_DIMENSIONS.height,
    }),
    [scratchData?.responsive_width, scratchData?.responsive_height]
  );

  // Helper to save settings
  const saveSettings = useCallback(
    async (updates: Partial<PreviewSettingsData>) => {
      if (!workspaceId) return;

      try {
        await updateScratch({
          payload: {
            type: 'PREVIEW_SETTINGS',
            data: {
              url: updates.url ?? overrideUrl ?? '',
              screen_size: updates.screen_size ?? screenSize,
              responsive_width:
                updates.responsive_width ?? responsiveDimensions.width,
              responsive_height:
                updates.responsive_height ?? responsiveDimensions.height,
            },
          },
        });
      } catch (e) {
        console.error('[usePreviewSettings] Failed to save:', e);
      }
    },
    [
      workspaceId,
      updateScratch,
      overrideUrl,
      screenSize,
      responsiveDimensions.width,
      responsiveDimensions.height,
    ]
  );

  // Debounced save for URL changes (frequent typing)
  const { debounced: debouncedSaveUrl } = useDebouncedCallback(
    async (url: string) => {
      await saveSettings({ url });
      // Clear optimistic state once the scratch has been persisted
      if (optimisticUrlRef.current === url) {
        optimisticUrlRef.current = null;
        setOptimisticUrl(null);
      }
    },
    300
  );

  // Debounced save for responsive dimensions (frequent dragging)
  const { debounced: debouncedSaveDimensions } = useDebouncedCallback(
    async (dimensions: ResponsiveDimensions) => {
      await saveSettings({
        responsive_width: dimensions.width,
        responsive_height: dimensions.height,
      });
    },
    300
  );

  const setOverrideUrl = useCallback(
    (url: string) => {
      // Set optimistic state immediately so effectiveUrl reflects the new URL
      // before the debounced scratch save completes (avoids 300ms race window
      // where hasOverride is false and the input snaps back to the detected URL).
      optimisticUrlRef.current = url;
      setOptimisticUrl(url);
      debouncedSaveUrl(url);
    },
    [debouncedSaveUrl]
  );

  const setScreenSize = useCallback(
    (size: ScreenSize) => {
      saveSettings({ screen_size: size });
    },
    [saveSettings]
  );

  const setResponsiveDimensions = useCallback(
    (dimensions: ResponsiveDimensions) => {
      debouncedSaveDimensions(dimensions);
    },
    [debouncedSaveDimensions]
  );

  const clearOverride = useCallback(async () => {
    optimisticUrlRef.current = null;
    setOptimisticUrl(null);
    try {
      await deleteScratch();
    } catch (e) {
      // Ignore 404 errors when scratch doesn't exist
      console.error('[usePreviewSettings] Failed to clear:', e);
    }
  }, [deleteScratch]);

  return {
    overrideUrl,
    hasOverride,
    setOverrideUrl,
    clearOverride,
    screenSize,
    responsiveDimensions,
    setScreenSize,
    setResponsiveDimensions,
    isLoading: isScratchLoading,
  };
}
