import { useEffect, useRef } from 'react';
import { useLayoutStore } from '@/stores/useLayoutStore';
import {
  usePersistedPanelMode,
  type PanelMode,
} from '@/stores/useUiPreferencesStore';

/**
 * Hook that syncs panel mode (changes/logs/preview) between
 * the global layout store and workspace-specific persistence.
 *
 * When workspace changes, restores the persisted mode for that workspace.
 * When mode changes, saves it for the current workspace.
 */
export function useWorkspacePanelMode(
  workspaceId: string | undefined,
  isCreateMode: boolean = false
) {
  const [persistedMode, setPersistedMode] = usePersistedPanelMode(workspaceId);
  const {
    isChangesMode,
    isLogsMode,
    isPreviewMode,
    setChangesMode,
    setLogsMode,
    setPreviewMode,
  } = useLayoutStore();

  // Track the previous workspace ID to detect changes
  const prevWorkspaceIdRef = useRef<string | undefined>(undefined);
  // Track whether we're in the middle of restoring to avoid save loop
  const isRestoringRef = useRef(false);

  // Derive current mode from layout store
  const currentMode: PanelMode = isChangesMode
    ? 'changes'
    : isLogsMode
      ? 'logs'
      : isPreviewMode
        ? 'preview'
        : null;

  // When workspace changes, restore the persisted mode
  useEffect(() => {
    if (workspaceId && workspaceId !== prevWorkspaceIdRef.current) {
      isRestoringRef.current = true;
      prevWorkspaceIdRef.current = workspaceId;

      // Restore persisted mode for this workspace
      if (persistedMode === 'changes') {
        setChangesMode(true);
      } else if (persistedMode === 'logs') {
        setLogsMode(true);
      } else if (persistedMode === 'preview') {
        setPreviewMode(true);
      } else {
        // No mode was active - ensure all are off
        setChangesMode(false);
        setLogsMode(false);
        setPreviewMode(false);
      }

      // Allow saves after restore completes
      requestAnimationFrame(() => {
        isRestoringRef.current = false;
      });
    }
  }, [workspaceId, persistedMode, setChangesMode, setLogsMode, setPreviewMode]);

  // When mode changes, persist it for the current workspace
  useEffect(() => {
    // Don't persist during create mode or while restoring
    if (isCreateMode || isRestoringRef.current) return;

    // Only persist if we have a workspace and it matches the current one
    if (workspaceId && prevWorkspaceIdRef.current === workspaceId) {
      setPersistedMode(currentMode);
    }
  }, [workspaceId, currentMode, setPersistedMode, isCreateMode]);
}
