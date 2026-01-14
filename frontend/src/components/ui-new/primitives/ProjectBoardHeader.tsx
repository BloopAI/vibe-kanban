import {
  KanbanIcon,
  PlusIcon,
  DotsThreeIcon,
  GearIcon,
  ArrowSquareOutIcon,
} from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/tooltip';
import type { Project, ProjectGroup, TaskStatus } from 'shared/types';

/**
 * Generates a consistent color based on the project ID
 * Uses a hash function to map IDs to a set of predefined colors
 */
function getProjectColor(projectId: string): string {
  // Predefined set of colors for projects (Linear-inspired palette)
  const colors = [
    '#5e6ad2', // indigo (Linear brand)
    '#26b5ce', // cyan
    '#f2994a', // orange
    '#6fcf97', // green
    '#bb6bd9', // purple
    '#eb5757', // red
    '#f2c94c', // yellow
    '#2d9cdb', // blue
  ];

  // Simple hash function based on project ID
  let hash = 0;
  for (let i = 0; i < projectId.length; i++) {
    const char = projectId.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }

  return colors[Math.abs(hash) % colors.length];
}

interface ProjectBoardHeaderProps {
  project: Project;
  taskCount: number;
  isLoading: boolean;
  groupId: string | null;
  groups: ProjectGroup[];
  isSticky?: boolean;
  onCreateTask: (projectId: string, status?: TaskStatus) => void;
  onMoveToGroup?: (projectId: string, groupId: string | null) => void;
  onOpenBoard?: (projectId: string) => void;
}

export function ProjectBoardHeader({
  project,
  taskCount,
  isLoading,
  groupId,
  groups,
  isSticky = false,
  onCreateTask,
  onMoveToGroup,
  onOpenBoard,
}: ProjectBoardHeaderProps) {
  const projectColor = getProjectColor(project.id);

  return (
    <TooltipProvider>
      <div
        className={cn(
          'group/header flex items-center gap-3 px-4 py-2.5',
          'bg-secondary/40 border-b border-panel/20',
          'transition-all duration-200 ease-out',
          // Sticky behavior styles
          isSticky && [
            'sticky top-[88px] z-[5]',
            'bg-secondary/95 backdrop-blur-sm',
            'shadow-sm shadow-black/[0.03]',
          ]
        )}
      >
        {/* Project icon with color indicator */}
        <div
          className={cn(
            'flex items-center justify-center',
            'size-7 rounded-md',
            'transition-all duration-150'
          )}
          style={{
            backgroundColor: `${projectColor}15`,
            borderLeft: `3px solid ${projectColor}`,
          }}
        >
          <KanbanIcon
            weight="fill"
            className="size-4"
            style={{ color: projectColor }}
          />
        </div>

        {/* Project name */}
        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3
              className={cn(
                'text-sm font-semibold text-normal truncate',
                'group-hover/header:text-high',
                'transition-colors duration-150'
              )}
            >
              {project.name}
            </h3>
            {/* Task count badge */}
            <span
              className={cn(
                'text-[10px] tabular-nums font-medium shrink-0',
                'px-1.5 py-0.5 rounded',
                'bg-panel/30 text-low/70',
                'transition-colors duration-150',
                'group-hover/header:bg-panel/40 group-hover/header:text-low'
              )}
            >
              {isLoading ? '...' : `${taskCount} task${taskCount !== 1 ? 's' : ''}`}
            </span>
          </div>
          {/* Optional: Task prefix display */}
          {project.task_prefix && (
            <span className="text-[10px] text-low/50 uppercase tracking-wider">
              {project.task_prefix}
            </span>
          )}
        </div>

        {/* Quick actions - always visible but more prominent on hover */}
        <div
          className={cn(
            'flex items-center gap-1',
            'opacity-60 group-hover/header:opacity-100',
            'transition-opacity duration-150'
          )}
        >
          {/* Add task button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => onCreateTask(project.id)}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md',
                  'text-xs font-medium',
                  'text-low hover:text-normal',
                  'hover:bg-panel/40',
                  'transition-all duration-150',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30'
                )}
              >
                <PlusIcon className="size-3.5" />
                <span className="hidden sm:inline">Add Task</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="sm:hidden">
              Add new task
            </TooltipContent>
          </Tooltip>

          {/* Open board button */}
          {onOpenBoard && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => onOpenBoard(project.id)}
                  className={cn(
                    'p-1.5 rounded-md',
                    'text-low hover:text-normal',
                    'hover:bg-panel/40',
                    'transition-all duration-150',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30'
                  )}
                >
                  <ArrowSquareOutIcon className="size-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Open full board</TooltipContent>
            </Tooltip>
          )}

          {/* More actions dropdown */}
          {onMoveToGroup && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    'p-1.5 rounded-md',
                    'text-low hover:text-normal',
                    'hover:bg-panel/40',
                    'transition-all duration-150',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30'
                  )}
                >
                  <DotsThreeIcon weight="bold" className="size-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[160px]">
                <DropdownMenuItem
                  onClick={() => onCreateTask(project.id, 'todo')}
                >
                  <PlusIcon className="size-4 mr-2" />
                  Add task to To Do
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => onCreateTask(project.id, 'inprogress')}
                >
                  <PlusIcon className="size-4 mr-2" />
                  Add task to In Progress
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <GearIcon className="size-4 mr-2" />
                    Move to group
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {groupId && (
                      <>
                        <DropdownMenuItem
                          onClick={() => onMoveToGroup(project.id, null)}
                        >
                          Remove from group
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                      </>
                    )}
                    {groups.map((group) => (
                      <DropdownMenuItem
                        key={group.id}
                        onClick={() => onMoveToGroup(project.id, group.id)}
                        disabled={group.id === groupId}
                      >
                        {group.name}
                      </DropdownMenuItem>
                    ))}
                    {groups.length === 0 && (
                      <div className="px-2 py-1.5 text-xs text-low">
                        No groups available
                      </div>
                    )}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}

