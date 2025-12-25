import { useCallback, useEffect, useRef } from 'react';
import { versionApi } from '@/lib/api';
import { UpdateAvailableDialog } from '@/components/dialogs/global/UpdateAvailableDialog';
import { useUserSystem } from '@/components/ConfigProvider';

const CHECK_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

export function useUpdateCheck() {
  const { config, updateAndSaveConfig } = useUserSystem();
  const checkIntervalRef = useRef<number | null>(null);

  const checkForUpdates = useCallback(async () => {
    if (!config) return;

    try {
      const versionInfo = await versionApi.checkForUpdates();

      // Only show notification if:
      // 1. Update is available
      // 2. This version hasn't been dismissed before
      if (
        versionInfo.update_available &&
        versionInfo.latest_version &&
        config.dismissed_update_version !== versionInfo.latest_version
      ) {
        await UpdateAvailableDialog.show({
          currentVersion: versionInfo.current_version,
          latestVersion: versionInfo.latest_version,
        });

        // Save the dismissed version so we don't show it again
        await updateAndSaveConfig({
          dismissed_update_version: versionInfo.latest_version,
        });
      }
    } catch (error) {
      // Silently fail - don't bother the user if update check fails
      console.warn('Failed to check for updates:', error);
    }
  }, [config, updateAndSaveConfig]);

  useEffect(() => {
    if (!config) return;

    // Check immediately on mount
    checkForUpdates();

    // Set up interval to check every 10 minutes
    checkIntervalRef.current = window.setInterval(
      checkForUpdates,
      CHECK_INTERVAL_MS
    );

    return () => {
      if (checkIntervalRef.current !== null) {
        clearInterval(checkIntervalRef.current);
      }
    };
  }, [config, checkForUpdates]);

  return null;
}
