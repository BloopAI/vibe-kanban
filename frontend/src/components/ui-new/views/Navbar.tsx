import {
  SidebarSimpleIcon,
  ArchiveIcon,
  ArrowSquareOutIcon,
  FilesIcon,
  ChatsTeardropIcon,
  CaretDoubleUpIcon,
  CaretDoubleDownIcon,
  ColumnsIcon,
  RowsIcon,
  type Icon,
} from '@phosphor-icons/react';
import type { DiffViewMode } from '@/stores/useDiffViewStore';
import { cn } from '@/lib/utils';

// NavbarIconButton - inlined from primitives
interface NavbarIconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: Icon;
  isActive?: boolean;
  rotation?: 0 | 90 | 180 | 270;
}

const rotationClasses = {
  0: '',
  90: 'rotate-90',
  180: 'rotate-180',
  270: '-rotate-90',
} as const;

function NavbarIconButton({
  icon: IconComponent,
  isActive = false,
  rotation = 0,
  className,
  ...props
}: NavbarIconButtonProps) {
  return (
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
        className={cn('size-icon-base', rotationClasses[rotation])}
        weight={isActive ? 'fill' : 'regular'}
      />
    </button>
  );
}

export interface NavbarProps {
  workspaceTitle?: string;
  // Panel visibility states
  isSidebarVisible?: boolean;
  isMainPanelVisible?: boolean;
  isGitPanelVisible?: boolean;
  isChangesMode?: boolean;
  isCreateMode?: boolean;
  // Archive state
  isArchived?: boolean;
  // Diff controls
  hasDiffs?: boolean; // Show view mode toggle when there are diffs
  isAllDiffsExpanded?: boolean;
  diffViewMode?: DiffViewMode;
  // Panel toggle handlers
  onToggleSidebar?: () => void;
  onToggleMainPanel?: () => void;
  onToggleGitPanel?: () => void;
  onToggleChangesMode?: () => void;
  onToggleArchive?: () => void;
  // Diff control handlers
  onToggleAllDiffs?: () => void;
  onToggleDiffViewMode?: () => void;
  // Navigation to old UI
  onNavigateToOldUI?: () => void;
  className?: string;
}

export function Navbar({
  workspaceTitle = 'Workspace Title',
  isSidebarVisible,
  isMainPanelVisible,
  isGitPanelVisible,
  isChangesMode,
  isCreateMode,
  isArchived,
  hasDiffs,
  isAllDiffsExpanded,
  diffViewMode,
  onToggleSidebar,
  onToggleMainPanel,
  onToggleGitPanel,
  onToggleChangesMode,
  onToggleArchive,
  onToggleAllDiffs,
  onToggleDiffViewMode,
  onNavigateToOldUI,
  className,
}: NavbarProps) {
  // Main toggle is disabled when Main is visible and Changes is not (can't hide both)
  const isMainToggleDisabled = isMainPanelVisible && !isChangesMode;
  return (
    <nav
      className={cn(
        'flex items-center justify-between px-double py-half bg-secondary border-b shrink-0',
        className
      )}
    >
      {/* Left - Archive & Old UI Link */}
      <div className="flex-1 flex items-center gap-base">
        {(onToggleArchive || onNavigateToOldUI) && (
          <>
            {onToggleArchive && (
              <NavbarIconButton
                icon={ArchiveIcon}
                isActive={isArchived}
                onClick={onToggleArchive}
                aria-label={
                  isArchived ? 'Unarchive workspace' : 'Archive workspace'
                }
              />
            )}
            {onNavigateToOldUI && (
              <NavbarIconButton
                icon={ArrowSquareOutIcon}
                onClick={onNavigateToOldUI}
                aria-label="Open in old UI"
              />
            )}
          </>
        )}
      </div>

      {/* Center - Workspace Title */}
      <div className="flex-1 flex items-center justify-center">
        <p className="text-base text-low truncate">{workspaceTitle}</p>
      </div>

      {/* Right - Diff Controls + Panel Toggles */}
      <div className="flex-1 flex items-center justify-end gap-base">
        {/* View mode toggle - visible when there are diffs (in or out of changes mode) */}
        {(isChangesMode || hasDiffs) && (
          <NavbarIconButton
            icon={diffViewMode === 'split' ? ColumnsIcon : RowsIcon}
            isActive={diffViewMode === 'split'}
            onClick={onToggleDiffViewMode}
            aria-label={
              diffViewMode === 'split' ? 'Side-by-side view' : 'Inline view'
            }
          />
        )}
        {/* Expand/collapse all - only in changes mode */}
        {isChangesMode && (
          <NavbarIconButton
            icon={isAllDiffsExpanded ? CaretDoubleUpIcon : CaretDoubleDownIcon}
            onClick={onToggleAllDiffs}
            aria-label={
              isAllDiffsExpanded ? 'Collapse all diffs' : 'Expand all diffs'
            }
          />
        )}
        {/* Separator - show when any diff controls are visible */}
        {(isChangesMode || hasDiffs) && <div className="h-4 w-px bg-border" />}
        <NavbarIconButton
          icon={SidebarSimpleIcon}
          isActive={isSidebarVisible}
          onClick={onToggleSidebar}
          aria-label="Toggle sidebar"
        />
        <NavbarIconButton
          icon={ChatsTeardropIcon}
          isActive={isMainPanelVisible}
          onClick={onToggleMainPanel}
          aria-label="Toggle main panel"
          disabled={isMainToggleDisabled}
          className={
            isMainToggleDisabled ? 'opacity-40 cursor-not-allowed' : ''
          }
        />
        <NavbarIconButton
          icon={FilesIcon}
          isActive={isChangesMode}
          onClick={onToggleChangesMode}
          aria-label="Toggle changes mode"
          disabled={isCreateMode}
          className={isCreateMode ? 'opacity-40 cursor-not-allowed' : ''}
        />
        <NavbarIconButton
          icon={SidebarSimpleIcon}
          rotation={180}
          isActive={isGitPanelVisible}
          onClick={onToggleGitPanel}
          aria-label="Toggle git panel"
        />
      </div>
    </nav>
  );
}
