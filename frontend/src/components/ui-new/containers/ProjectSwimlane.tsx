import { useCallback, useMemo } from 'react';
import {
  DndContext,
  useDroppable,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import { useBoardTasksOverview } from '@/hooks/useBoardTasksOverview';
import { useRegisterProjectCounts } from '@/hooks/useAggregateTaskCounts';
import { SwimlaneTaskCard } from '@/components/ui-new/primitives/SwimlaneTaskCard';
import { ProjectBoardHeader } from '@/components/ui-new/primitives/ProjectBoardHeader';
import { ProjectProviderOverride } from '@/contexts/ProjectProviderOverride';
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
      <div className="border-b border-panel/15">
        {/* Project header */}
        <ProjectBoardHeader
          project={project}
          taskCount={0}
          isLoading={false}
          groupId={groupId}
          groups={groups}
          onCreateTask={onCreateTask}
          onMoveToGroup={onMoveToGroup}
          onOpenBoard={onOpenBoard}
        />
        {/* Error state */}
        <div className="px-4 py-3 text-sm text-error bg-error/5">
          Failed to load tasks for this project
        </div>
      </div>
    );
  }

  return (
    <ProjectProviderOverride projectId={project.id}>
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="border-b border-panel/15">
          {/* Project board header - Linear-style */}
          <ProjectBoardHeader
            project={project}
            taskCount={filteredTotalCount}
            isLoading={isLoading}
            groupId={groupId}
            groups={groups}
            onCreateTask={onCreateTask}
            onMoveToGroup={onMoveToGroup}
            onOpenBoard={onOpenBoard}
          />

          {/* Status columns grid - without the project name column */}
          <div
            className={cn(
              'grid grid-cols-[180px_repeat(5,minmax(120px,1fr))]',
              'transition-all duration-150 ease-out'
            )}
          >
            {/* Empty spacer cell to align with the swimlane header */}
            <div className="px-3 py-2" />

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
        </div>
      </DndContext>
    </ProjectProviderOverride>
  );
}
