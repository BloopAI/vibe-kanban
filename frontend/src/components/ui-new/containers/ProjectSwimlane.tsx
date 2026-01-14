import { useCallback, useMemo } from 'react';
import {
  DndContext,
  useDroppable,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { KanbanIcon, PlusIcon, DotsThreeIcon } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { useBoardTasksOverview } from '@/hooks/useBoardTasksOverview';
import { useRegisterProjectCounts } from '@/hooks/useAggregateTaskCounts';
import { SwimlaneTaskCard } from '@/components/ui-new/primitives/SwimlaneTaskCard';
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
import type {
  Project,
  ProjectGroup,
  TaskStatus,
  TaskWithAttemptStatus,
} from 'shared/types';
import type { FilterState } from '@/components/ui-new/primitives/FilterDisplayControls';
import { statusColumnBgColors } from '@/utils/statusLabels';

const STATUS_ORDER: TaskStatus[] = [
  'todo',
  'inprogress',
  'inreview',
  'done',
  'cancelled',
];

interface StatusCellProps {
  status: TaskStatus;
  children: React.ReactNode;
}

function StatusCell({ status, children }: StatusCellProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: status,
    data: { type: 'status', status },
  });

  const hasChildren = Array.isArray(children)
    ? children.some(Boolean)
    : Boolean(children);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'group/cell relative px-2 py-2 border-l border-panel/30 min-h-[64px]',
        'transition-all duration-200 ease-out',
        // Drop target indicator
        isOver && 'bg-brand/10 border-l-brand/40',
        // Empty state subtle indicator on hover
        !hasChildren && !isOver && 'hover:bg-panel/8'
      )}
      style={
        !isOver ? { backgroundColor: statusColumnBgColors[status] } : undefined
      }
    >
      {/* Drop zone visual indicator */}
      {isOver && (
        <div
          className={cn(
            'absolute inset-1.5 rounded-md',
            'border-2 border-dashed border-brand/40',
            'bg-brand/5',
            'pointer-events-none',
            'animate-scale-in'
          )}
        />
      )}
      <div className="relative flex flex-col gap-1.5">{children}</div>
    </div>
  );
}

interface ProjectSwimlaneProps {
  project: Project;
  groupId: string | null;
  groups: ProjectGroup[];
  selectedTaskId: string | null;
  onTaskClick: (projectId: string, taskId: string) => void;
  onCreateTask: (projectId: string, status?: TaskStatus) => void;
  onMoveToGroup?: (projectId: string, groupId: string | null) => void;
  onOpenBoard?: (projectId: string) => void;
  onStatusChange: (
    taskId: string,
    newStatus: TaskStatus,
    task: TaskWithAttemptStatus
  ) => void;
  filterState?: FilterState;
  /** If set, only show tasks with IDs in this set (for workspace-based filtering) */
  allowedTaskIds?: Set<string>;
}

export function ProjectSwimlane({
  project,
  groupId,
  groups,
  selectedTaskId,
  onTaskClick,
  onCreateTask,
  onMoveToGroup,
  onOpenBoard,
  onStatusChange,
  filterState,
  allowedTaskIds,
}: ProjectSwimlaneProps) {
  const { tasksByStatus, totalCount, isLoading, error } = useBoardTasksOverview(
    project.id
  );

  // Register task counts with the aggregate context for column header totals
  useRegisterProjectCounts(project.id, tasksByStatus, isLoading);

  // Apply status filter and workspace filter to tasks
  const filteredTasksByStatus = useMemo(() => {
    const filtered: typeof tasksByStatus = {
      todo: [],
      inprogress: [],
      inreview: [],
      done: [],
      cancelled: [],
    };

    for (const status of STATUS_ORDER) {
      // Skip statuses not in filter (if filter is set)
      if (
        filterState &&
        filterState.statuses.length > 0 &&
        !filterState.statuses.includes(status)
      ) {
        continue;
      }

      let tasks = tasksByStatus[status];

      // Apply workspace-based task filter
      if (allowedTaskIds) {
        tasks = tasks.filter((task) => allowedTaskIds.has(task.id));
      }

      filtered[status] = tasks;
    }

    return filtered;
  }, [tasksByStatus, filterState, allowedTaskIds]);

  // Calculate filtered total count
  const filteredTotalCount = useMemo(() => {
    // If we have any filter applied, count from filtered tasks
    if (allowedTaskIds || (filterState && filterState.statuses.length > 0)) {
      return Object.values(filteredTasksByStatus).reduce(
        (sum, tasks) => sum + tasks.length,
        0
      );
    }
    return totalCount;
  }, [filteredTasksByStatus, filterState, allowedTaskIds, totalCount]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over) return;

      const taskId = active.id as string;
      const newStatus = over.id as TaskStatus;

      // Find the task
      const task = STATUS_ORDER.reduce(
        (found, status) => {
          if (found) return found;
          return tasksByStatus[status].find((t) => t.id === taskId);
        },
        undefined as (typeof tasksByStatus)['todo'][0] | undefined
      );

      if (!task || task.status === newStatus) return;

      onStatusChange(taskId, newStatus, task);
    },
    [tasksByStatus, onStatusChange]
  );

  if (error) {
    return (
      <div className="grid grid-cols-[180px_repeat(5,minmax(120px,1fr))] border-b border-panel">
        <div className="p-half">
          <div className="flex items-center gap-half">
            <KanbanIcon
              weight="fill"
              className="size-icon-xs text-brand shrink-0"
            />
            <span className="text-xs text-normal font-medium">
              {project.name}
            </span>
          </div>
        </div>
        <div className="col-span-5 p-base text-sm text-error border-l border-panel">
          Failed to load tasks
        </div>
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div
        className={cn(
          'group/row grid grid-cols-[180px_repeat(5,minmax(120px,1fr))]',
          'border-b border-panel/15',
          'transition-all duration-150 ease-out',
          'hover:bg-panel/8'
        )}
      >
        {/* Project name cell */}
        <div className="px-3 py-2 flex items-center">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <KanbanIcon
              weight="fill"
              className="size-icon-sm text-brand shrink-0"
            />
            <span className="text-xs text-normal font-medium truncate">
              {project.name}
            </span>
            <span
              className={cn(
                'text-[10px] tabular-nums shrink-0',
                'px-1.5 py-0.5 rounded-sm',
                'bg-panel/20 text-low/60'
              )}
            >
              {isLoading ? '—' : filteredTotalCount}
            </span>

            {/* Actions - visible on row hover */}
            <div
              className={cn(
                'flex items-center gap-1 ml-auto shrink-0',
                'opacity-0 group-hover/row:opacity-100',
                'transition-opacity duration-150'
              )}
            >
              <button
                type="button"
                onClick={() => onCreateTask(project.id)}
                className={cn(
                  'icon-btn p-1 rounded-md',
                  'text-low hover:text-normal',
                  'hover:bg-panel/50',
                  'transition-all duration-150',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30'
                )}
                title="New task"
              >
                <PlusIcon className="size-icon-xs" />
              </button>

              {/* Actions dropdown */}
              {(onMoveToGroup || onOpenBoard) && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className={cn(
                        'icon-btn p-1 rounded-md',
                        'text-low hover:text-normal',
                        'hover:bg-panel/50',
                        'transition-all duration-150',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30'
                      )}
                    >
                      <DotsThreeIcon weight="bold" className="size-icon-xs" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {onOpenBoard && (
                      <>
                        <DropdownMenuItem
                          onClick={() => onOpenBoard(project.id)}
                        >
                          Open board
                        </DropdownMenuItem>
                        {onMoveToGroup && <DropdownMenuSeparator />}
                      </>
                    )}
                    {onMoveToGroup && (
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>
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
                              onClick={() =>
                                onMoveToGroup(project.id, group.id)
                              }
                              disabled={group.id === groupId}
                            >
                              {group.name}
                            </DropdownMenuItem>
                          ))}
                          {groups.length === 0 && (
                            <div className="px-2 py-1 text-sm text-low">
                              No groups
                            </div>
                          )}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        </div>

        {/* Status columns */}
        {STATUS_ORDER.map((status) => {
          const tasks = filteredTasksByStatus[status];

          return (
            <StatusCell key={status} status={status}>
              {isLoading ? (
                <div className="flex flex-col gap-1.5">
                  <div className="skeleton h-12 w-full rounded-md" />
                </div>
              ) : tasks.length === 0 ? null : (
                tasks.map((task) => (
                  <SwimlaneTaskCard
                    key={task.id}
                    task={task}
                    projectId={project.id}
                    isSelected={selectedTaskId === task.id}
                    onClick={() => onTaskClick(project.id, task.id)}
                  />
                ))
              )}
            </StatusCell>
          );
        })}
      </div>
    </DndContext>
  );
}
