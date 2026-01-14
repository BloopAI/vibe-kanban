import {
  PlusIcon,
  StopIcon,
  LightningIcon,
  EyeIcon,
  KanbanIcon,
  SidebarSimpleIcon,
} from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import type { SidebarWorkspace } from '@/components/ui-new/hooks/useWorkspaces';

interface LeftSidebarProps {
  /** App name shown in header */
  appName?: string;
  /** Workspace data for active/review sections */
  workspaces: SidebarWorkspace[];
  /** Handler to create a new task (opens dialog) */
  onCreateTask?: () => void;
  /** Handler to create a new project (opens dialog) */
  onCreateProject?: () => void;
  /** Handler to stop a running workspace */
  onStopWorkspace?: (workspaceId: string) => void;
  /** Handler to click on a workspace item (navigates to workspace) */
  onWorkspaceClick?: (workspaceId: string) => void;
  /** Toggle sidebar visibility */
  onToggleSidebar?: () => void;
  className?: string;
}

interface ActionButtonProps {
  icon: React.ElementType;
  label: string;
  onClick?: () => void;
}

function ActionButton({ icon: Icon, label, onClick }: ActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 w-full px-3 py-2 rounded-sm',
        'text-sm text-normal',
        'bg-panel/30 hover:bg-panel/50',
        'border border-panel/40 hover:border-panel/60',
        'transition-colors duration-100'
      )}
    >
      <Icon className="size-4 flex-shrink-0" />
      <span>{label}</span>
    </button>
  );
}

interface WorkspaceItemProps {
  workspace: SidebarWorkspace;
  onStop?: () => void;
  onClick?: () => void;
  showPRBadge?: boolean;
}

function WorkspaceItem({
  workspace,
  onStop,
  onClick,
  showPRBadge,
}: WorkspaceItemProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 px-2 py-1.5 rounded-sm',
        'hover:bg-panel/30 transition-colors duration-100',
        'group cursor-pointer'
      )}
      onClick={onClick}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.()}
      tabIndex={0}
      role="button"
    >
      <div className="relative">
        <KanbanIcon className="size-3.5 text-brand" weight="fill" />
        {workspace.isRunning && (
          <span className="absolute -top-0.5 -right-0.5 size-1.5 bg-success rounded-full animate-pulse" />
        )}
      </div>
      <span className="flex-1 text-xs text-normal truncate">
        {workspace.name || `Workspace ${workspace.id.slice(0, 8)}`}
      </span>
      {showPRBadge && workspace.prStatus === 'open' && (
        <span className="text-[9px] px-1 py-0.5 rounded bg-brand/20 text-brand">
          PR
        </span>
      )}
      {onStop && workspace.isRunning && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onStop();
          }}
          className={cn(
            'p-1 rounded-sm',
            'text-low hover:text-error',
            'hover:bg-error/10',
            'opacity-0 group-hover:opacity-100',
            'transition-all duration-100'
          )}
          title="Stop workspace"
        >
          <StopIcon className="size-3" weight="fill" />
        </button>
      )}
    </div>
  );
}

export function LeftSidebar({
  appName = 'Vibe Kanban',
  workspaces,
  onCreateTask,
  onCreateProject,
  onStopWorkspace,
  onWorkspaceClick,
  onToggleSidebar,
  className,
}: LeftSidebarProps) {
  // Separate workspaces into active (running) and in-review (has open PR)
  const activeWorkspaces = workspaces.filter((ws) => ws.isRunning);
  const reviewWorkspaces = workspaces.filter(
    (ws) => ws.prStatus === 'open' && !ws.isRunning
  );

  return (
    <div className={cn('w-full h-full bg-secondary flex flex-col', className)}>
      {/* App Header */}
      <div className="flex items-center justify-between px-base py-2 border-b">
        <div className="flex items-center gap-2 min-w-0">
          <div className="size-6 rounded bg-brand flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-bold text-white">
              {appName.charAt(0).toUpperCase()}
            </span>
          </div>
          <span className="font-semibold text-high truncate">{appName}</span>
        </div>
        {onToggleSidebar && (
          <button
            type="button"
            onClick={onToggleSidebar}
            className="text-low hover:text-normal p-1 rounded hover:bg-panel/50 transition-colors"
            title="Toggle sidebar"
          >
            <SidebarSimpleIcon className="size-icon-sm" />
          </button>
        )}
      </div>

      {/* Quick Actions Section */}
      <div className="flex flex-col px-3 py-3 gap-2 border-b">
        <div className="text-[10px] font-medium text-low uppercase tracking-wider mb-1">
          Quick Actions
        </div>
        <ActionButton icon={PlusIcon} label="New Task" onClick={onCreateTask} />
        <ActionButton
          icon={PlusIcon}
          label="New Project"
          onClick={onCreateProject}
        />
      </div>

      {/* Active Sessions Section */}
      <div className="flex flex-col px-3 py-3 border-b">
        <div className="flex items-center gap-1.5 text-[10px] font-medium text-low uppercase tracking-wider mb-2">
          <LightningIcon className="size-3" weight="fill" />
          <span>Active Sessions</span>
          {activeWorkspaces.length > 0 && (
            <span className="text-success">({activeWorkspaces.length})</span>
          )}
        </div>
        {activeWorkspaces.length === 0 ? (
          <div className="text-[10px] text-low/60 px-2 py-1">
            No active sessions
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {activeWorkspaces.map((ws) => (
              <WorkspaceItem
                key={ws.id}
                workspace={ws}
                onStop={
                  onStopWorkspace ? () => onStopWorkspace(ws.id) : undefined
                }
                onClick={
                  onWorkspaceClick ? () => onWorkspaceClick(ws.id) : undefined
                }
              />
            ))}
          </div>
        )}
      </div>

      {/* Awaiting Review Section */}
      <div className="flex flex-col px-3 py-3 flex-1 overflow-y-auto">
        <div className="flex items-center gap-1.5 text-[10px] font-medium text-low uppercase tracking-wider mb-2">
          <EyeIcon className="size-3" weight="fill" />
          <span>Awaiting Review</span>
          {reviewWorkspaces.length > 0 && (
            <span className="text-brand">({reviewWorkspaces.length})</span>
          )}
        </div>
        {reviewWorkspaces.length === 0 ? (
          <div className="text-[10px] text-low/60 px-2 py-1">
            No PRs awaiting review
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {reviewWorkspaces.map((ws) => (
              <WorkspaceItem
                key={ws.id}
                workspace={ws}
                showPRBadge
                onClick={
                  onWorkspaceClick ? () => onWorkspaceClick(ws.id) : undefined
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
