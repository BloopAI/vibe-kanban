import { useMemo, useCallback, type RefObject } from 'react';
import { useActions } from '@/contexts/ActionsContext';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { useUserSystem } from '@/components/ConfigProvider';
import { useDevServer } from '@/hooks/useDevServer';
import { ContextBar } from '../primitives/ContextBar';
import {
  ContextBarActionGroups,
  type ActionDefinition,
  type ActionVisibilityContext,
  type ContextBarItem,
  type DevServerState,
} from '../actions';
import {
  useActionVisibilityContext,
  isActionVisible,
} from '../actions/useActionVisibility';

/**
 * Check if a ContextBarItem is a divider
 */
function isDivider(item: ContextBarItem): item is { readonly type: 'divider' } {
  return 'type' in item && item.type === 'divider';
}

/**
 * Filter context bar items by visibility, keeping dividers but removing them
 * if they would appear at the start, end, or consecutively.
 */
function filterContextBarItems(
  items: readonly ContextBarItem[],
  ctx: ActionVisibilityContext
): ContextBarItem[] {
  // Filter actions by visibility, keep dividers
  const filtered = items.filter((item) => {
    if (isDivider(item)) return true;
    return isActionVisible(item, ctx);
  });

  // Remove leading/trailing dividers and consecutive dividers
  const result: ContextBarItem[] = [];
  for (const item of filtered) {
    if (isDivider(item)) {
      // Only add divider if we have items before it and last item wasn't a divider
      if (result.length > 0 && !isDivider(result[result.length - 1])) {
        result.push(item);
      }
    } else {
      result.push(item);
    }
  }

  // Remove trailing divider
  if (result.length > 0 && isDivider(result[result.length - 1])) {
    result.pop();
  }

  return result;
}

export interface ContextBarContainerProps {
  containerRef: RefObject<HTMLElement | null>;
  containerPath?: string; // workspace.container_ref for copy path
}

export function ContextBarContainer({
  containerRef,
  containerPath,
}: ContextBarContainerProps) {
  const { executorContext } = useActions();
  const { workspaceId } = useWorkspaceContext();
  const { config } = useUserSystem();
  const editorType = config?.editor?.editor_type ?? null;

  // Dev server state from hook (uses workspaceId from context)
  const { isStarting, isStopping, runningDevServer } =
    useDevServer(workspaceId);

  // Compute dev server state
  const devServerState: DevServerState = useMemo(() => {
    if (isStarting) return 'starting';
    if (isStopping) return 'stopping';
    if (runningDevServer) return 'running';
    return 'stopped';
  }, [isStarting, isStopping, runningDevServer]);

  // Build extended visibility context
  const baseCtx = useActionVisibilityContext();
  const actionCtx = useMemo<ActionVisibilityContext>(
    () => ({
      ...baseCtx,
      editorType,
      devServerState,
      runningDevServerId: runningDevServer?.id,
    }),
    [baseCtx, editorType, devServerState, runningDevServer?.id]
  );

  // Build extended executor context with ContextBar-specific data
  const extendedExecutorCtx = useMemo(
    () => ({
      ...executorContext,
      containerRef: containerPath,
      runningDevServerId: runningDevServer?.id,
    }),
    [executorContext, containerPath, runningDevServer?.id]
  );

  // Action handler - pass extended context
  const handleExecuteAction = useCallback(
    async (action: ActionDefinition) => {
      if (!action.requiresTarget) {
        await action.execute(extendedExecutorCtx);
      }
    },
    [extendedExecutorCtx]
  );

  // Filter visible actions
  const primaryItems = useMemo(
    () => filterContextBarItems(ContextBarActionGroups.primary, actionCtx),
    [actionCtx]
  );
  const secondaryItems = useMemo(
    () => filterContextBarItems(ContextBarActionGroups.secondary, actionCtx),
    [actionCtx]
  );

  return (
    <ContextBar
      containerRef={containerRef}
      primaryItems={primaryItems}
      secondaryItems={secondaryItems}
      actionContext={actionCtx}
      onExecuteAction={handleExecuteAction}
      editorType={editorType}
    />
  );
}
