import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import type { SidebarWorkspace } from '@/components/ui-new/hooks/useWorkspaces';

/**
 * Hook that monitors workspaces for PR merge events and shows celebratory toast notifications.
 * Tracks previous PR status to detect when a PR transitions to 'merged' state.
 */
export function usePrMergeNotifications(workspaces: SidebarWorkspace[]): void {
  // Track previous PR statuses to detect transitions
  const previousPrStatusRef = useRef<Map<string, string | undefined>>(
    new Map()
  );
  // Track if this is the initial load to avoid showing toasts for already-merged PRs
  const isInitialLoadRef = useRef(true);

  useEffect(() => {
    // Skip on initial load - we don't want to show toasts for PRs that were already merged
    if (isInitialLoadRef.current) {
      // Populate initial state
      const initialStatuses = new Map<string, string | undefined>();
      for (const workspace of workspaces) {
        initialStatuses.set(workspace.id, workspace.prStatus);
      }
      previousPrStatusRef.current = initialStatuses;
      isInitialLoadRef.current = false;
      return;
    }

    // Check each workspace for PR status changes
    for (const workspace of workspaces) {
      const previousStatus = previousPrStatusRef.current.get(workspace.id);
      const currentStatus = workspace.prStatus;

      // Detect transition to 'merged' status
      if (
        currentStatus === 'merged' &&
        previousStatus !== undefined &&
        previousStatus !== 'merged'
      ) {
        // Show celebratory toast
        toast.success('PR Merged!', {
          description: workspace.name,
          duration: 6000,
          icon: '🎉',
        });
      }

      // Update tracked status
      previousPrStatusRef.current.set(workspace.id, currentStatus);
    }

    // Clean up removed workspaces from tracking
    const currentIds = new Set(workspaces.map((w) => w.id));
    for (const trackedId of previousPrStatusRef.current.keys()) {
      if (!currentIds.has(trackedId)) {
        previousPrStatusRef.current.delete(trackedId);
      }
    }
  }, [workspaces]);
}
