import { memo, useEffect, useMemo, useState } from 'react';
import {
  type DragEndEvent,
  KanbanBoard,
  KanbanCards,
  KanbanHeader,
  KanbanProvider,
} from '@/components/ui/shadcn-io/kanban';
import { TaskCard } from './TaskCard';
import type { TaskStatus, TaskWithAttemptStatus } from 'shared/types';
import { useNavigate, useParams } from 'react-router-dom';
import { useKeyboardShortcuts } from '@/lib/keyboard-shortcuts.ts';

type Task = TaskWithAttemptStatus;

interface TaskKanbanBoardProps {
  tasks: Task[];
  searchQuery?: string;
  onDragEnd: (event: DragEndEvent) => void;
  onEditTask: (task: Task) => void;
  onDeleteTask: (taskId: string) => void;
  onViewTaskDetails: (task: Task) => void;
}

const allTaskStatuses: TaskStatus[] = [
  'todo',
  'inprogress',
  'inreview',
  'done',
  'cancelled',
];

const statusLabels: Record<TaskStatus, string> = {
  todo: 'To Do',
  inprogress: 'In Progress',
  inreview: 'In Review',
  done: 'Done',
  cancelled: 'Cancelled',
};

const statusBoardColors: Record<TaskStatus, string> = {
  todo: 'hsl(var(--neutral))',
  inprogress: 'hsl(var(--info))',
  inreview: 'hsl(var(--warning))',
  done: 'hsl(var(--success))',
  cancelled: 'hsl(var(--destructive))',
};

function TaskKanbanBoard({
  tasks,
  searchQuery = '',
  onDragEnd,
  onEditTask,
  onDeleteTask,
  onViewTaskDetails,
}: TaskKanbanBoardProps) {
  const { projectId, taskId } = useParams<{
    projectId: string;
    taskId?: string;
  }>();
  const navigate = useNavigate();

  useKeyboardShortcuts({
    navigate,
    currentPath: `/projects/${projectId}/tasks${taskId ? `/${taskId}` : ''}`,
  });

  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(
    taskId || null
  );
  const [focusedStatus, setFocusedStatus] = useState<TaskStatus | null>(null);

  // Memoize filtered tasks
  const filteredTasks = useMemo(() => {
    if (!searchQuery.trim()) {
      return tasks;
    }
    const query = searchQuery.toLowerCase();
    return tasks.filter(
      (task) =>
        task.title.toLowerCase().includes(query) ||
        (task.description && task.description.toLowerCase().includes(query))
    );
  }, [tasks, searchQuery]);

  // Memoize grouped tasks
  const groupedTasks = useMemo(() => {
    const groups: Record<TaskStatus, Task[]> = {} as Record<TaskStatus, Task[]>;
    allTaskStatuses.forEach((status) => {
      groups[status] = [];
    });
    filteredTasks.forEach((task) => {
      const normalizedStatus = task.status.toLowerCase() as TaskStatus;
      if (groups[normalizedStatus]) {
        groups[normalizedStatus].push(task);
      } else {
        groups['todo'].push(task);
      }
    });
    return groups;
  }, [filteredTasks]);

  // Sync focus state with taskId param
  useEffect(() => {
    if (taskId) {
      const found = filteredTasks.find((t) => t.id === taskId);
      if (found) {
        setFocusedTaskId(taskId);
        setFocusedStatus((found.status.toLowerCase() as TaskStatus) || null);
      }
    }
  }, [taskId, filteredTasks]);

  // If no taskId in params, keep last focused, or focus first available
  useEffect(() => {
    if (!taskId && !focusedTaskId) {
      for (const status of allTaskStatuses) {
        if (groupedTasks[status] && groupedTasks[status].length > 0) {
          setFocusedTaskId(groupedTasks[status][0].id);
          setFocusedStatus(status);
          break;
        }
      }
    }
  }, [taskId, focusedTaskId, groupedTasks]);

  // Keyboard navigation handler
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't handle if typing in input, textarea, or select
      const tag = (e.target as HTMLElement)?.tagName;
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        (e.target as HTMLElement)?.isContentEditable
      )
        return;
      if (!focusedTaskId || !focusedStatus) return;
      const currentColumn = groupedTasks[focusedStatus];
      const currentIndex = currentColumn.findIndex(
        (t) => t.id === focusedTaskId
      );
      let newStatus = focusedStatus;
      let newTaskId = focusedTaskId;
      if (e.key === 'ArrowDown') {
        if (currentIndex < currentColumn.length - 1) {
          newTaskId = currentColumn[currentIndex + 1].id;
        }
      } else if (e.key === 'ArrowUp') {
        if (currentIndex > 0) {
          newTaskId = currentColumn[currentIndex - 1].id;
        }
      } else if (e.key === 'ArrowRight') {
        let colIdx = allTaskStatuses.indexOf(focusedStatus);
        while (colIdx < allTaskStatuses.length - 1) {
          colIdx++;
          const nextStatus = allTaskStatuses[colIdx];
          if (groupedTasks[nextStatus] && groupedTasks[nextStatus].length > 0) {
            newStatus = nextStatus;
            newTaskId = groupedTasks[nextStatus][0].id;
            break;
          }
        }
      } else if (e.key === 'ArrowLeft') {
        let colIdx = allTaskStatuses.indexOf(focusedStatus);
        while (colIdx > 0) {
          colIdx--;
          const prevStatus = allTaskStatuses[colIdx];
          if (groupedTasks[prevStatus] && groupedTasks[prevStatus].length > 0) {
            newStatus = prevStatus;
            newTaskId = groupedTasks[prevStatus][0].id;
            break;
          }
        }
      } else if (e.key === 'Enter' || e.key === ' ') {
        const task = filteredTasks.find((t) => t.id === focusedTaskId);
        if (task) {
          onViewTaskDetails(task);
        }
      } else {
        return;
      }
      e.preventDefault();
      setFocusedTaskId(newTaskId);
      setFocusedStatus(newStatus);
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    focusedTaskId,
    focusedStatus,
    groupedTasks,
    filteredTasks,
    onViewTaskDetails,
    projectId,
    navigate,
  ]);

  return (
    <KanbanProvider onDragEnd={onDragEnd}>
      {Object.entries(groupedTasks).map(([status, statusTasks]) => (
        <KanbanBoard key={status} id={status as TaskStatus}>
          <KanbanHeader
            name={statusLabels[status as TaskStatus]}
            color={statusBoardColors[status as TaskStatus]}
          />
          <KanbanCards>
            {statusTasks.map((task, index) => (
              <TaskCard
                key={task.id}
                task={task}
                index={index}
                status={status}
                onEdit={onEditTask}
                onDelete={onDeleteTask}
                onViewDetails={onViewTaskDetails}
                isFocused={focusedTaskId === task.id}
                tabIndex={focusedTaskId === task.id ? 0 : -1}
              />
            ))}
          </KanbanCards>
        </KanbanBoard>
      ))}
    </KanbanProvider>
  );
}

export default memo(TaskKanbanBoard);
