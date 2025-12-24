import { useEffect, useRef, useState } from 'react';
import { versionApi } from '@/lib/api';
import { UpdateAvailableDialog } from '@/components/dialogs/global/UpdateAvailableDialog';

const CHECK_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

export function useUpdateCheck() {
  const [hasShownDialog, setHasShownDialog] = useState(false);
  const checkIntervalRef = useRef<number | null>(null);

  const checkForUpdates = async () => {
    try {
      const versionInfo = await versionApi.checkForUpdates();

      if (versionInfo.update_available && !hasShownDialog) {
        setHasShownDialog(true);
        await UpdateAvailableDialog.show({
          currentVersion: versionInfo.current_version,
          latestVersion: versionInfo.latest_version || 'unknown',
        });
        // After dialog is dismissed, reset the flag so it can show again next time
        // This allows the user to dismiss it and see it again if they don't restart
        setHasShownDialog(false);
      }
    } catch (error) {
      // Silently fail - don't bother the user if update check fails
      console.warn('Failed to check for updates:', error);
    }
  };

  useEffect(() => {
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
  }, []);

  return null;
}
