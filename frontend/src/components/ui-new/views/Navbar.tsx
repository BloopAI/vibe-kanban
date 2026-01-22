import type { Icon } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { Tooltip } from '../primitives/Tooltip';
import {
  type ActionDefinition,
  type ActionVisibilityContext,
  type NavbarItem,
  isSpecialIcon,
} from '../actions';
import {
  isActionActive,
  isActionEnabled,
  getActionIcon,
  getActionTooltip,
} from '../actions/useActionVisibility';

/**
 * Check if a NavbarItem is a divider
 */
function isDivider(item: NavbarItem): item is { readonly type: 'divider' } {
  return 'type' in item && item.type === 'divider';
}

// NavbarIconButton - inlined from primitives
interface NavbarIconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: Icon;
  isActive?: boolean;
  tooltip?: string;
  shortcut?: string;
}

function NavbarIconButton({
  icon: IconComponent,
  isActive = false,
  tooltip,
  shortcut,
  className,
  ...props
}: NavbarIconButtonProps) {
  const button = (
    <button
      type="button"
      className={cn(
        'flex items-center justify-center rounded-sm',
        'text-low hover:text-normal',
        isActive && 'text-normal',
        className
      )}
      {...props}
    >
      <IconComponent
        className="size-icon-base"
        weight={isActive ? 'fill' : 'regular'}
      />
    </button>
  );

  return tooltip ? (
    <Tooltip content={tooltip} shortcut={shortcut}>
      {button}
    </Tooltip>
  ) : (
    button
  );
}

export interface NavbarProps {
  workspaceTitle?: string;
  // Items for left side of navbar
  leftItems?: NavbarItem[];
  // Items for right side of navbar (with dividers inline)
  rightItems?: NavbarItem[];
  // Context for deriving action state
  actionContext: ActionVisibilityContext;
  // Handler to execute an action
  onExecuteAction: (action: ActionDefinition) => void;
  className?: string;
}

export function Navbar({
  workspaceTitle = 'Workspace Title',
  leftItems = [],
  rightItems = [],
  actionContext,
  onExecuteAction,
  className,
}: NavbarProps) {
  const renderItem = (item: NavbarItem, key: string) => {
    // Render divider
    if (isDivider(item)) {
      return <div key={key} className="h-4 w-px bg-border" />;
    }

    // Render action - derive state from action callbacks
    const action = item;
    const active = isActionActive(action, actionContext);
    const enabled = isActionEnabled(action, actionContext);
    const iconOrSpecial = getActionIcon(action, actionContext);
    const tooltip = getActionTooltip(action, actionContext);
    const isDisabled = !enabled;

    // Skip special icons in navbar (navbar only uses standard phosphor icons)
    if (isSpecialIcon(iconOrSpecial)) {
      return null;
    }

    return (
      <NavbarIconButton
        key={key}
        icon={iconOrSpecial}
        isActive={active}
        onClick={() => onExecuteAction(action)}
        aria-label={tooltip}
        tooltip={tooltip}
        shortcut={action.shortcut}
        disabled={isDisabled}
        className={isDisabled ? 'opacity-40 cursor-not-allowed' : ''}
      />
    );
  };

  return (
    <nav
      className={cn(
        'flex items-center justify-between px-base py-half bg-secondary border-b shrink-0',
        className
      )}
    >
      {/* Left - Archive & Old UI Link */}
      <div className="flex-1 flex items-center gap-base">
        {leftItems.map((item, index) =>
          renderItem(
            item,
            `left-${isDivider(item) ? 'divider' : item.id}-${index}`
          )
        )}
      </div>

      {/* Center - Workspace Title */}
      <div className="flex-1 flex items-center justify-center">
        <p className="text-base text-low truncate">{workspaceTitle}</p>
      </div>

      {/* Right - Diff Controls + Panel Toggles (dividers inline) */}
      <div className="flex-1 flex items-center justify-end gap-base">
        {rightItems.map((item, index) =>
          renderItem(
            item,
            `right-${isDivider(item) ? 'divider' : item.id}-${index}`
          )
        )}
      </div>
    </nav>
  );
}
