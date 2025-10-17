import { useCallback } from 'react';
import { useUserSystem } from '@/components/config-provider';

export interface ShowcasePersistence {
  hasSeen: (id: string) => boolean;
  markSeen: (id: string) => Promise<void>;
  isLoaded: boolean;
}

export function useShowcasePersistence(): ShowcasePersistence {
  const { config, updateAndSaveConfig, loading } = useUserSystem();

  const seenFeatures = config?.showcases?.seen_features ?? [];

  const hasSeen = useCallback(
    (id: string): boolean => {
      return seenFeatures.includes(id);
    },
    [seenFeatures]
  );

  const markSeen = useCallback(
    async (id: string): Promise<void> => {
      if (seenFeatures.includes(id)) {
        return;
      }

      await updateAndSaveConfig({
        showcases: {
          seen_features: [...seenFeatures, id],
        },
      });
    },
    [seenFeatures, updateAndSaveConfig]
  );

  return {
    hasSeen,
    markSeen,
    isLoaded: !loading,
  };
}
