import { useMemo, useCallback, type RefObject } from 'react';
import { useActions } from '@/contexts/ActionsContext';
import { useUserSystem } from '@/components/ConfigProvider';
import { ContextBar } from '../primitives/ContextBar';
import {
  ContextBarActionGroups,
  type ActionDefinition,
  type ActionVisibilityContext,
  type ContextBarItem,
  ActionTargetType,
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
}

export function ContextBarContainer({
  containerRef,
}: ContextBarContainerProps) {
  const { executorContext } = useActions();
  const { config } = useUserSystem();
  const editorType = config?.editor?.editor_type ?? null;

  // Get visibility context (now includes dev server state)
  const actionCtx = useActionVisibilityContext();

  // Action handler - use executor context directly from provider
  const handleExecuteAction = useCallback(
    async (action: ActionDefinition) => {
      if (action.requiresTarget === ActionTargetType.NONE) {
        await action.execute(executorContext);
      }
    },
    [executorContext]
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
