import {
  SidebarSimpleIcon,
  ArchiveIcon,
  type Icon,
} from '@phosphor-icons/react';
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
  isGitPanelVisible?: boolean;
  // Archive state
  isArchived?: boolean;
  // Panel toggle handlers
  onToggleSidebar?: () => void;
  onToggleGitPanel?: () => void;
  onToggleArchive?: () => void;
  className?: string;
}

export function Navbar({
  workspaceTitle = 'Workspace Title',
  isSidebarVisible,
  isGitPanelVisible,
  isArchived,
  onToggleSidebar,
  onToggleGitPanel,
  onToggleArchive,
  className,
}: NavbarProps) {
  return (
    <nav
      className={cn(
        'flex items-center justify-between px-double py-half bg-secondary border-b shrink-0',
        className
      )}
    >
      {/* Left - Sidebar Toggle & Archive */}
      <div className="flex-1 flex items-center gap-base">
        <NavbarIconButton
          icon={SidebarSimpleIcon}
          isActive={isSidebarVisible}
          onClick={onToggleSidebar}
          aria-label="Toggle sidebar"
        />
        {onToggleArchive && (
          <>
            <div className="w-px h-4 bg-low/20" />
            <NavbarIconButton
              icon={ArchiveIcon}
              isActive={isArchived}
              onClick={onToggleArchive}
              aria-label={
                isArchived ? 'Unarchive workspace' : 'Archive workspace'
              }
            />
          </>
        )}
      </div>

      {/* Center - Workspace Title */}
      <div className="flex-1 flex items-center justify-center">
        <p className="text-base text-low truncate">{workspaceTitle}</p>
      </div>

      {/* Right - Git Panel Toggle */}
      <div className="flex-1 flex items-center justify-end">
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
