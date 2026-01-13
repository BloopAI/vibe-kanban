import { useCallback } from 'react';
import { DndContext, useDroppable, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { KanbanIcon, PlusIcon, DotsThreeIcon } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { useBoardTasksOverview } from '@/hooks/useBoardTasksOverview';
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
import type { Project, ProjectGroup, TaskStatus, TaskWithAttemptStatus } from 'shared/types';

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

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'group/cell px-base py-half border-l border-panel min-h-[70px]',
        'transition-all relative',
        isOver && 'bg-brand/5'
      )}
    >
      <div className="flex flex-col gap-1">
        {children}
      </div>
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
  onStatusChange: (taskId: string, newStatus: TaskStatus, task: TaskWithAttemptStatus) => void;
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
}: ProjectSwimlaneProps) {
  const { tasksByStatus, totalCount, isLoading, error } = useBoardTasksOverview(project.id);

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
      const task = STATUS_ORDER.reduce((found, status) => {
        if (found) return found;
        return tasksByStatus[status].find((t) => t.id === taskId);
      }, undefined as typeof tasksByStatus['todo'][0] | undefined);

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
            <KanbanIcon weight="fill" className="size-icon-xs text-brand shrink-0" />
            <span className="text-xs text-normal font-medium">{project.name}</span>
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
      <div className="group/row grid grid-cols-[180px_repeat(5,minmax(120px,1fr))] border-b border-panel/30 hover:bg-panel/10 transition-colors">
        {/* Project name cell */}
        <div className="px-half py-half flex items-center">
          <div className="flex items-center gap-half flex-1 min-w-0">
            <KanbanIcon weight="fill" className="size-icon-xs text-brand shrink-0" />
            <span className="text-xs text-normal font-medium">{project.name}</span>
            <span className="text-xs text-low/60 tabular-nums">{totalCount}</span>

            {/* Actions - visible on row hover */}
            <div className="flex items-center gap-0.5 opacity-0 group-hover/row:opacity-100 transition-opacity shrink-0">
              <button
                type="button"
                onClick={() => onCreateTask(project.id)}
                className="p-0.5 rounded hover:bg-panel text-low hover:text-normal transition-colors"
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
                      className="p-0.5 rounded hover:bg-panel text-low hover:text-normal transition-colors"
                    >
                      <DotsThreeIcon weight="bold" className="size-icon-xs" />
                    </button>
                  </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {onOpenBoard && (
                    <>
                      <DropdownMenuItem onClick={() => onOpenBoard(project.id)}>
                        Open board
                      </DropdownMenuItem>
                      {onMoveToGroup && <DropdownMenuSeparator />}
                    </>
                  )}
                  {onMoveToGroup && (
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>Move to group</DropdownMenuSubTrigger>
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
                          <div className="px-2 py-1 text-sm text-low">No groups</div>
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
          const tasks = tasksByStatus[status];

          return (
            <StatusCell
              key={status}
              status={status}
            >
              {isLoading ? (
                <div className="text-xs text-low animate-pulse">...</div>
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
