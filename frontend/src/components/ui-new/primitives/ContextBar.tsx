import type { RefObject } from 'react';
import type { Icon } from '@phosphor-icons/react';
import type { EditorType } from 'shared/types';
import { cn } from '@/lib/utils';
import { Tooltip } from './Tooltip';
import { IdeIcon } from '@/components/ide/IdeIcon';
import { useContextBarPosition } from '@/hooks/useContextBarPosition';
import {
  type ActionDefinition,
  type ActionVisibilityContext,
  type ContextBarItem,
  isSpecialIcon,
} from '../actions';
import {
  isActionEnabled,
  isActionVisible,
  getActionIcon,
  getActionTooltip,
} from '../actions/useActionVisibility';
import { CopyButton } from '../containers/CopyButton';

/**
 * Check if a ContextBarItem is a divider
 */
function isDivider(item: ContextBarItem): item is { readonly type: 'divider' } {
  return 'type' in item && item.type === 'divider';
}

interface ContextBarButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: Icon;
  label: string;
  iconClassName?: string;
  tooltip?: string;
  shortcut?: string;
}

function ContextBarButton({
  icon: IconComponent,
  label,
  className,
  iconClassName,
  tooltip,
  shortcut,
  ...props
}: ContextBarButtonProps) {
  const button = (
    <button
      className={cn(
        'flex items-center justify-center transition-colors',
        'drop-shadow-[2px_2px_4px_rgba(121,121,121,0.25)]',
        'text-low group-hover:text-normal',
        className
      )}
      aria-label={label}
      {...props}
    >
      <IconComponent
        className={cn('size-icon-base', iconClassName)}
        weight="bold"
      />
    </button>
  );

  return tooltip ? (
    <Tooltip content={tooltip} shortcut={shortcut} side="left">
      {button}
    </Tooltip>
  ) : (
    button
  );
}

function DragHandle({
  onMouseDown,
  isDragging,
}: {
  onMouseDown: (e: React.MouseEvent) => void;
  isDragging: boolean;
}) {
  return (
    <div
      className={cn(
        'flex justify-center py-half border-b',
        isDragging ? 'cursor-grabbing' : 'cursor-grab'
      )}
      onMouseDown={onMouseDown}
    >
      <div className="flex gap-[2px] py-half">
        <span className="size-dot rounded-full bg-panel group-hover:bg-low transition" />
        <span className="size-dot rounded-full bg-panel group-hover:bg-low transition" />
        <span className="size-dot rounded-full bg-panel group-hover:bg-low transition" />
      </div>
    </div>
  );
}

export interface ContextBarProps {
  containerRef: RefObject<HTMLElement | null>;
  // Items for primary group (top section)
  primaryItems?: ContextBarItem[];
  // Items for secondary group (below divider)
  secondaryItems?: ContextBarItem[];
  // Context for deriving action state
  actionContext: ActionVisibilityContext;
  // Handler to execute an action
  onExecuteAction: (action: ActionDefinition) => void;
  // IDE editor type for rendering IdeIcon
  editorType?: EditorType | null;
}

/**
 * Get the icon class name based on action state and type
 */
function getIconClassName(
  action: ActionDefinition,
  actionContext: ActionVisibilityContext,
  isDisabled: boolean
): string | undefined {
  // Handle dev server running state (for ToggleDevServer action)
  if (action.id === 'toggle-dev-server') {
    const { devServerState } = actionContext;
    if (devServerState === 'starting' || devServerState === 'stopping') {
      return 'animate-spin';
    }
    if (devServerState === 'running') {
      return 'text-error hover:text-error group-hover:text-error';
    }
  }

  if (isDisabled) {
    return 'opacity-40';
  }

  return undefined;
}

export function ContextBar({
  containerRef,
  primaryItems = [],
  secondaryItems = [],
  actionContext,
  onExecuteAction,
  editorType,
}: ContextBarProps) {
  const { style, isDragging, dragHandlers } =
    useContextBarPosition(containerRef);

  // Render a single action item
  const renderActionItem = (action: ActionDefinition, key: string) => {
    // Skip if not visible
    if (!isActionVisible(action, actionContext)) {
      return null;
    }

    const enabled = isActionEnabled(action, actionContext);
    const tooltip = getActionTooltip(action, actionContext);
    const iconType = action.icon;
    const iconClassName = getIconClassName(action, actionContext, !enabled);

    // Handle special icon types
    if (isSpecialIcon(iconType)) {
      if (iconType === 'ide-icon') {
        // Render IDE icon
        return (
          <Tooltip
            key={key}
            content={tooltip}
            shortcut={action.shortcut}
            side="left"
          >
            <button
              className="flex items-center justify-center transition-colors drop-shadow-[2px_2px_4px_rgba(121,121,121,0.25)]"
              aria-label={tooltip}
              onClick={() => onExecuteAction(action)}
              disabled={!enabled}
            >
              <IdeIcon
                editorType={editorType}
                className="size-icon-xs opacity-50 group-hover:opacity-80 transition-opacity"
              />
            </button>
          </Tooltip>
        );
      }

      if (iconType === 'copy-icon') {
        // Render copy button with self-contained feedback state
        return (
          <CopyButton
            key={key}
            onCopy={() => onExecuteAction(action)}
            disabled={!enabled}
          />
        );
      }
    }

    // Get dynamic icon if available
    const resolvedIcon = getActionIcon(action, actionContext);

    // For regular icons, use ContextBarButton
    // Handle case where resolvedIcon might be a special type (shouldn't happen, but type-safe)
    if (isSpecialIcon(resolvedIcon)) {
      return null;
    }

    return (
      <ContextBarButton
        key={key}
        icon={resolvedIcon}
        label={tooltip}
        tooltip={tooltip}
        shortcut={action.shortcut}
        onClick={() => onExecuteAction(action)}
        disabled={!enabled}
        iconClassName={iconClassName}
      />
    );
  };

  // Render items array
  const renderItems = (items: ContextBarItem[], prefix: string) => {
    return items.map((item, index) => {
      if (isDivider(item)) {
        return (
          <div key={`${prefix}-divider-${index}`} className="h-px bg-border" />
        );
      }
      return renderActionItem(item, `${prefix}-${item.id}-${index}`);
    });
  };

  // Filter visible items for rendering
  const visiblePrimaryItems = primaryItems.filter(
    (item) => isDivider(item) || isActionVisible(item, actionContext)
  );
  const visibleSecondaryItems = secondaryItems.filter(
    (item) => isDivider(item) || isActionVisible(item, actionContext)
  );

  return (
    <div
      className={cn(
        'absolute z-50',
        !isDragging && 'transition-all duration-300 ease-out'
      )}
      style={style}
    >
      <div className="group bg-secondary/50 backdrop-blur-sm border border-secondary rounded shadow-[inset_2px_2px_5px_rgba(255,255,255,0.03),_0_0_10px_rgba(0,0,0,0.2)] hover:shadow-[inset_2px_2px_5px_rgba(255,255,255,0.06),_0_0_10px_rgba(0,0,0,0.4)] transition-shadow px-base">
        <DragHandle
          onMouseDown={dragHandlers.onMouseDown}
          isDragging={isDragging}
        />

        <div className="flex flex-col py-base">
          {/* Primary Icons */}
          {visiblePrimaryItems.length > 0 && (
            <div className="flex flex-col gap-base">
              {renderItems(primaryItems, 'primary')}
            </div>
          )}

          {/* Separator - only show if both sections have items */}
          {visiblePrimaryItems.length > 0 &&
            visibleSecondaryItems.length > 0 && (
              <div className="h-px bg-border my-base" />
            )}

          {/* Secondary Icons */}
          {visibleSecondaryItems.length > 0 && (
            <div className="flex flex-col gap-base">
              {renderItems(secondaryItems, 'secondary')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
