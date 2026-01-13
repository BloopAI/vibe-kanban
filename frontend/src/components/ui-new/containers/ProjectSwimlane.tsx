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
  onAddTask: () => void;
}

function StatusCell({ status, children, onAddTask }: StatusCellProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: status,
    data: { type: 'status', status },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'group/cell flex-1 min-w-[120px] p-half border-r border-panel last:border-r-0 min-h-[60px]',
        'transition-colors relative',
        isOver && 'bg-brand/10'
      )}
    >
      <div className="space-y-half max-h-[200px] overflow-y-auto">
        {children}
      </div>
      <button
        type="button"
        onClick={onAddTask}
        className={cn(
          'absolute bottom-1 right-1 p-0.5 rounded',
          'text-low hover:text-normal hover:bg-panel',
          'opacity-0 group-hover/cell:opacity-100 transition-opacity'
        )}
        title="Add task"
      >
        <PlusIcon className="size-icon-xs" />
      </button>
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
  const { tasksByStatus, isLoading, error } = useBoardTasksOverview(project.id);

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
      <div className="flex border-b border-panel">
        <div className="w-[150px] shrink-0 p-half border-r border-panel bg-secondary">
          <div className="flex items-center gap-half">
            <KanbanIcon weight="fill" className="size-icon-sm text-brand shrink-0" />
            <span className="text-sm text-normal truncate">{project.name}</span>
          </div>
        </div>
        <div className="flex-1 p-half text-xs text-error">
          Failed to load tasks
        </div>
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="flex border-b border-panel hover:bg-secondary/50 transition-colors">
        {/* Project name cell */}
        <div className="w-[150px] shrink-0 p-half border-r border-panel bg-secondary">
          <div className="flex items-center gap-half">
            <KanbanIcon weight="fill" className="size-icon-sm text-brand shrink-0" />
            <span className="text-sm text-normal truncate flex-1">{project.name}</span>

            {/* Add task button */}
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

        {/* Status columns */}
        {STATUS_ORDER.map((status) => {
          const tasks = tasksByStatus[status];

          return (
            <StatusCell
              key={status}
              status={status}
              onAddTask={() => onCreateTask(project.id, status)}
            >
              {isLoading ? (
                <div className="text-xs text-low">...</div>
              ) : tasks.length === 0 ? (
                <div className="text-xs text-low opacity-50">-</div>
              ) : (
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
