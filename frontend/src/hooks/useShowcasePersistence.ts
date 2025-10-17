import { useCallback } from 'react';
import { useUserSystem } from '@/components/config-provider';

export interface ShowcasePersistence {
  hasSeen: (id: string, version: number) => boolean;
  markSeen: (id: string, version: number) => Promise<void>;
  isLoaded: boolean;
}

export function useShowcasePersistence(): ShowcasePersistence {
  const { config, updateAndSaveConfig, loading } = useUserSystem();

  const seen = config?.showcases?.seen_versions ?? {};

  const hasSeen = useCallback(
    (id: string, version: number): boolean => {
      const currentVersion = seen[id] ?? 0;
      return currentVersion >= version;
    },
    [seen]
  );

  const markSeen = useCallback(
    async (id: string, version: number): Promise<void> => {
      const currentVersion = seen[id] ?? 0;
      if (currentVersion >= version) {
        return;
      }

      const nextSeenVersions = {
        ...seen,
        [id]: Math.max(currentVersion, version),
      };

      await updateAndSaveConfig({
        showcases: {
          seen_versions: nextSeenVersions,
        },
      });
    },
    [seen, updateAndSaveConfig]
  );

  return {
    hasSeen,
    markSeen,
    isLoaded: !loading,
  };
}
