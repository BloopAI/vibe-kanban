import type { ReactNode } from 'react';
import type { Icon } from '@phosphor-icons/react';
import {
  LayoutIcon,
  ChatsTeardropIcon,
  GitDiffIcon,
  TerminalIcon,
  DesktopIcon,
  GitForkIcon,
  ListIcon,
  GearIcon,
  KanbanIcon,
  CaretLeftIcon,
  ArrowClockwiseIcon,
} from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { Tooltip } from '../primitives/Tooltip';
import { SyncErrorIndicator } from '../primitives/SyncErrorIndicator';
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
import {
  type MobileTab,
  useMobileActiveTab,
} from '@/stores/useUiPreferencesStore';

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

const MOBILE_TABS: { id: MobileTab; icon: Icon; label: string }[] = [
  { id: 'workspaces', icon: LayoutIcon, label: 'Wksps' },
  { id: 'chat', icon: ChatsTeardropIcon, label: 'Chat' },
  { id: 'changes', icon: GitDiffIcon, label: 'Diff' },
  { id: 'logs', icon: TerminalIcon, label: 'Logs' },
  { id: 'preview', icon: DesktopIcon, label: 'Preview' },
  { id: 'git', icon: GitForkIcon, label: 'Git' },
];

export interface NavbarProps {
  workspaceTitle?: string;
  // Items for left side of navbar
  leftItems?: NavbarItem[];
  // Items for right side of navbar (with dividers inline)
  rightItems?: NavbarItem[];
  // Optional additional content for left side (after leftItems)
  leftSlot?: ReactNode;
  // Context for deriving action state
  actionContext: ActionVisibilityContext;
  // Handler to execute an action
  onExecuteAction: (action: ActionDefinition) => void;
  // Mobile mode props
  mobileMode?: boolean;
  mobileUserSlot?: ReactNode;
  isOnProjectPage?: boolean;
  onOpenCommandBar?: () => void;
  onOpenSettings?: () => void;
  onNavigateToBoard?: () => void;
  onNavigateBack?: () => void;
  onReload?: () => void;
  className?: string;
}

export function Navbar({
  workspaceTitle = 'Workspace Title',
  leftItems = [],
  rightItems = [],
  leftSlot,
  actionContext,
  onExecuteAction,
  mobileMode = false,
  mobileUserSlot,
  isOnProjectPage = false,
  onOpenCommandBar,
  onOpenSettings,
  onNavigateToBoard,
  onNavigateBack,
  onReload,
  className,
}: NavbarProps) {
  const [mobileTab, setMobileTab] = useMobileActiveTab();

  if (mobileMode) {
    return (
      <div className={cn('shrink-0', className)}>
        {/* Row 1 - Tab Bar (workspaces pages) or minimal header (project pages) */}
        <nav className="flex items-center bg-secondary border-b px-base py-half">
          {!isOnProjectPage && (
            <div className="flex items-center gap-1 flex-1 min-w-0">
              {MOBILE_TABS.map((tab) => {
                const isActive = mobileTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setMobileTab(tab.id)}
                    className={cn(
                      'flex items-center gap-1 px-1.5 py-1 rounded-sm text-sm shrink-0',
                      isActive
                        ? 'text-normal border-b-2 border-brand'
                        : 'text-low hover:text-normal'
                    )}
                  >
                    <tab.icon
                      className="size-icon-base"
                      weight={isActive ? 'fill' : 'regular'}
                    />
                    <span className="hidden min-[480px]:inline">
                      {tab.label}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          {isOnProjectPage && (
            <div className="flex items-center gap-1 flex-1 min-w-0">
              {onNavigateBack && (
                <button
                  type="button"
                  onClick={onNavigateBack}
                  className="flex items-center justify-center rounded-sm text-low hover:text-normal shrink-0"
                >
                  <CaretLeftIcon className="size-icon-base" weight="bold" />
                </button>
              )}
              {leftSlot}
              <p className="text-base text-low truncate">{workspaceTitle}</p>
            </div>
          )}
          <div className="flex items-center gap-1 shrink-0">
            <SyncErrorIndicator />
            {onReload && (
              <button
                type="button"
                onClick={onReload}
                className="flex items-center justify-center rounded-sm text-low hover:text-normal"
              >
                <ArrowClockwiseIcon className="size-icon-base" />
              </button>
            )}
            {onOpenSettings && (
              <button
                type="button"
                onClick={onOpenSettings}
                className="flex items-center justify-center rounded-sm text-low hover:text-normal"
              >
                <GearIcon className="size-icon-base" />
              </button>
            )}
            {onOpenCommandBar && (
              <button
                type="button"
                onClick={onOpenCommandBar}
                className="flex items-center justify-center rounded-sm text-low hover:text-normal"
              >
                <ListIcon className="size-icon-base" />
              </button>
            )}
            {mobileUserSlot}
          </div>
        </nav>
        {/* Row 2 - Info Bar (workspaces pages only) */}
        {!isOnProjectPage && (
          <div className="flex items-center gap-base px-base py-half bg-secondary border-b">
            {leftSlot}
            <p className="text-base text-low truncate flex-1 text-center">
              {workspaceTitle}
            </p>
            {onNavigateToBoard && (
              <button
                type="button"
                onClick={onNavigateToBoard}
                className="flex items-center gap-1 shrink-0 rounded-sm px-1.5 py-0.5 text-sm text-low hover:text-normal hover:bg-panel transition-colors"
              >
                <KanbanIcon className="size-icon-base" />
                <span className="hidden min-[480px]:inline">Board</span>
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

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
      {/* Left - Archive & Old UI Link + optional slot */}
      <div className="flex-1 flex items-center gap-base">
        {leftItems.map((item, index) =>
          renderItem(
            item,
            `left-${isDivider(item) ? 'divider' : item.id}-${index}`
          )
        )}
        {leftSlot}
      </div>

      {/* Center - Workspace Title */}
      <div className="flex-1 flex items-center justify-center">
        <p className="text-base text-low truncate">{workspaceTitle}</p>
      </div>

      {/* Right - Sync Error Indicator + Diff Controls + Panel Toggles (dividers inline) */}
      <div className="flex-1 flex items-center justify-end gap-base">
        <SyncErrorIndicator />
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
