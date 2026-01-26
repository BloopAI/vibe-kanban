import { useState, useEffect, useCallback } from 'react';
import type { ExecutorProfileId } from 'shared/types';

export interface AutoReviewSettings {
  enabled: boolean;
  executorProfileId: ExecutorProfileId | null;
  includePmReview: boolean;
  includeCodeReview: boolean;
  additionalPrompt: string;
}

const DEFAULT_SETTINGS: AutoReviewSettings = {
  enabled: false,
  executorProfileId: null,
  includePmReview: true,
  includeCodeReview: false,
  additionalPrompt: '',
};

function getStorageKey(projectId: string): string {
  return `auto-review-settings-${projectId}`;
}

export function useAutoReviewSettings(projectId: string | undefined) {
  const [settings, setSettings] =
    useState<AutoReviewSettings>(DEFAULT_SETTINGS);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load settings from localStorage
  useEffect(() => {
    if (!projectId) {
      setSettings(DEFAULT_SETTINGS);
      setIsLoaded(true);
      return;
    }

    try {
      const stored = localStorage.getItem(getStorageKey(projectId));
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<AutoReviewSettings>;
        setSettings({ ...DEFAULT_SETTINGS, ...parsed });
      } else {
        setSettings(DEFAULT_SETTINGS);
      }
    } catch (error) {
      console.error('Failed to load auto-review settings:', error);
      setSettings(DEFAULT_SETTINGS);
    }
    setIsLoaded(true);
  }, [projectId]);

  // Save settings to localStorage
  const updateSettings = useCallback(
    (updates: Partial<AutoReviewSettings>) => {
      if (!projectId) return;

      const newSettings = { ...settings, ...updates };
      setSettings(newSettings);

      try {
        localStorage.setItem(
          getStorageKey(projectId),
          JSON.stringify(newSettings)
        );
      } catch (error) {
        console.error('Failed to save auto-review settings:', error);
      }
    },
    [projectId, settings]
  );

  return {
    settings,
    updateSettings,
    isLoaded,
  };
}
