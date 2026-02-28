import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { Icon } from '@phosphor-icons/react';
import {
  Layout as LayoutIcon,
  ChatsTeardrop as ChatsTeardropIcon,
  GitDiff as GitDiffIcon,
  Terminal as TerminalIcon,
  Desktop as DesktopIcon,
  GitFork as GitForkIcon,
  List as ListIcon,
  Gear as GearIcon,
  Kanban as KanbanIcon,
  CaretLeft as CaretLeftIcon,
  ArrowClockwise as ArrowClockwiseIcon,
  SidebarSimple as SidebarSimpleIcon,
} from '@phosphor-icons/react';
import { cn } from '../lib/cn';
import { Tooltip } from './Tooltip';
import {
  SyncErrorIndicator,
  type SyncErrorIndicatorError,
} from './SyncErrorIndicator';

/**
 * Action item rendered in the navbar.
 */
export interface NavbarActionItem {
  type?: 'action';
  id: string;
  icon: Icon;
  isActive?: boolean;
  tooltip?: string;
  shortcut?: string;
  disabled?: boolean;
  onClick?: () => void;
}

/**
 * Divider item rendered in the navbar.
 */
export interface NavbarDividerItem {
  type: 'divider';
}

export type NavbarSectionItem = NavbarActionItem | NavbarDividerItem;

function isDivider(item: NavbarSectionItem): item is NavbarDividerItem {
  return item.type === 'divider';
}

// NavbarIconButton - inlined from primitives
interface NavbarIconButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
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

export type MobileTabId =
  | 'workspaces'
  | 'chat'
  | 'changes'
  | 'logs'
  | 'preview'
  | 'git';

export const MOBILE_TABS: { id: MobileTabId; icon: Icon; label: string }[] = [
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
  leftItems?: NavbarSectionItem[];
  // Items for right side of navbar (with dividers inline)
  rightItems?: NavbarSectionItem[];
  // Optional additional content for left side (after leftItems)
  leftSlot?: ReactNode;
  // Sync errors shown in the right section
  syncErrors?: readonly SyncErrorIndicatorError[] | null;
  className?: string;
  // Mobile props
  mobileMode?: boolean;
  mobileUserSlot?: ReactNode;
  isOnProjectPage?: boolean;
  onOpenCommandBar?: () => void;
  onOpenSettings?: () => void;
  onNavigateToBoard?: (() => void) | null;
  onNavigateBack?: () => void;
  onReload?: () => void;
  onOpenDrawer?: () => void;
  isOnProjectSubRoute?: boolean;
  mobileActiveTab?: MobileTabId;
  onMobileTabChange?: (tab: MobileTabId) => void;
  mobileTabs?: { id: MobileTabId; icon: Icon; label: string }[];
  showMobileTabs?: boolean;
  mobileShowBack?: boolean;
}

export function Navbar({
  workspaceTitle,
  leftItems = [],
  rightItems = [],
  leftSlot,
  syncErrors,
  className,
  mobileMode = false,
  mobileUserSlot,
  isOnProjectPage = false,
  onOpenCommandBar,
  onOpenSettings,
  onNavigateToBoard,
  onNavigateBack,
  onReload,
  onOpenDrawer,
  isOnProjectSubRoute = false,
  mobileActiveTab = 'chat',
  onMobileTabChange,
  mobileTabs,
  showMobileTabs,
  mobileShowBack,
}: NavbarProps) {
  const renderItem = (item: NavbarSectionItem, key: string) => {
    // Render divider
    if (isDivider(item)) {
      return <div key={key} className="h-4 w-px bg-border" />;
    }

    const isDisabled = !!item.disabled;

    return (
      <NavbarIconButton
        key={key}
        icon={item.icon}
        isActive={item.isActive}
        onClick={item.onClick}
        aria-label={item.tooltip}
        tooltip={item.tooltip}
        shortcut={item.shortcut}
        disabled={isDisabled}
        className={isDisabled ? 'opacity-40 cursor-not-allowed' : ''}
      />
    );
  };

  // ---- Mobile layout ----
  if (mobileMode) {
    return (
      <nav
        className={cn(
          'flex flex-col bg-secondary border-b shrink-0',
          className
        )}
      >
        {/* Row 1: Tab bar (workspace pages) or minimal header (project pages) */}
        <div className="flex items-center justify-between px-base py-half">
          {isOnProjectPage ? (
            <div className="flex items-center gap-base">
              {isOnProjectSubRoute
                ? onNavigateBack && (
                    <button
                      type="button"
                      className="flex items-center justify-center text-low hover:text-normal"
                      onClick={onNavigateBack}
                      aria-label="Back"
                    >
                      <CaretLeftIcon className="size-icon-base" />
                    </button>
                  )
                : onOpenDrawer && (
                    <button
                      type="button"
                      className="flex items-center justify-center text-low hover:text-normal"
                      onClick={onOpenDrawer}
                      aria-label="Open menu"
                    >
                      <SidebarSimpleIcon className="size-icon-base" />
                    </button>
                  )}
              <p className="text-base text-normal font-medium truncate">
                {workspaceTitle}
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-0.5 overflow-x-auto">
              {mobileShowBack && onNavigateBack ? (
                <>
                  <button
                    type="button"
                    className="flex items-center justify-center px-1.5 py-1 text-low hover:text-normal"
                    onClick={onNavigateBack}
                    aria-label="Back"
                  >
                    <CaretLeftIcon className="size-icon-sm" />
                  </button>
                  <div className="h-4 w-px bg-border mx-0.5 shrink-0" />
                </>
              ) : (
                onOpenDrawer && (
                  <>
                    <button
                      type="button"
                      className="flex items-center justify-center px-1.5 py-1 text-low hover:text-normal"
                      onClick={onOpenDrawer}
                      aria-label="Projects"
                    >
                      <KanbanIcon className="size-icon-sm" />
                    </button>
                    <div className="h-4 w-px bg-border mx-0.5 shrink-0" />
                  </>
                )
              )}
              {showMobileTabs !== false &&
                (mobileTabs ?? MOBILE_TABS).map((tab) => {
                  const TabIcon = tab.icon;
                  const isActive = mobileActiveTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      className={cn(
                        'flex items-center gap-1 px-1.5 py-1 text-xs whitespace-nowrap transition-colors',
                        isActive
                          ? 'text-normal border-b-2 border-brand'
                          : 'text-low hover:text-normal'
                      )}
                      onClick={() => onMobileTabChange?.(tab.id)}
                    >
                      <TabIcon
                        className="size-icon-sm"
                        weight={isActive ? 'fill' : 'regular'}
                      />
                      <span className="hidden min-[480px]:inline">
                        {tab.label}
                      </span>
                    </button>
                  );
                })}
              {onNavigateToBoard && (
                <button
                  type="button"
                  className="flex items-center gap-1 px-1.5 py-1 text-xs text-low hover:text-normal whitespace-nowrap"
                  onClick={onNavigateToBoard}
                >
                  <KanbanIcon className="size-icon-sm" />
                  <span className="hidden min-[480px]:inline">Board</span>
                </button>
              )}
            </div>
          )}

          {/* Right side: sync indicator + action buttons + user slot */}
          <div className="flex items-center gap-1 shrink-0">
            <SyncErrorIndicator errors={syncErrors} />
            {onReload && (
              <button
                type="button"
                className="flex items-center justify-center text-low hover:text-normal"
                onClick={onReload}
                aria-label="Reload"
              >
                <ArrowClockwiseIcon className="size-icon-sm" />
              </button>
            )}
            {onOpenSettings && (
              <button
                type="button"
                className="flex items-center justify-center text-low hover:text-normal"
                onClick={onOpenSettings}
                aria-label="Settings"
              >
                <GearIcon className="size-icon-sm" />
              </button>
            )}
            {onOpenCommandBar && (
              <button
                type="button"
                className="flex items-center justify-center text-low hover:text-normal"
                onClick={onOpenCommandBar}
                aria-label="Command bar"
              >
                <ListIcon className="size-icon-sm" />
              </button>
            )}
            {mobileUserSlot && (
              <div className="h-4 w-px bg-border mx-0.5 shrink-0" />
            )}
            {mobileUserSlot}
          </div>
        </div>

        {/* Row 2: Info bar with leftSlot + workspace title (workspace pages only) */}
        {!isOnProjectPage && workspaceTitle && (
          <div className="flex items-center justify-between px-base py-half border-t border-border">
            <div className="flex items-center gap-base flex-1 min-w-0">
              {leftSlot}
              <p className="text-sm text-low truncate">{workspaceTitle}</p>
            </div>
          </div>
        )}
      </nav>
    );
  }

  // ---- Desktop layout ----
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
        <p className="text-base text-low truncate">{workspaceTitle ?? ''}</p>
      </div>

      {/* Right - Sync Error Indicator + Diff Controls + Panel Toggles (dividers inline) */}
      <div className="flex-1 flex items-center justify-end gap-base">
        <SyncErrorIndicator errors={syncErrors} />
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
